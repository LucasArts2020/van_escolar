import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { PlanningClock, localDate, addDays } from "./planning-clock";
export type RoutineDay = {
  weekday: number;
  outbound: boolean;
  return: boolean;
};
export const accessSql = `l.status='ACTIVE' AND (
  ($2='SCHOOL' AND l.school_id=$1) OR ($2='DRIVER' AND l.transport_id=$1)
  OR ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=l.student_id AND g.user_id=$3 AND g.status='ACTIVE')))`;
type Queryable = Pick<PoolClient, "query">;
@Injectable()
export class PlanningService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningClock) readonly clock: PlanningClock,
  ) {}
  params(req: ActorRequest) {
    return [req.context!.organization_id, req.context!.role, req.actor.id];
  }
  async link(
    req: ActorRequest,
    id: string,
    db: Queryable = this.db.pool,
    lock = false,
  ) {
    const row = (
      await db.query(
        `SELECT l.*,s.name student_name,sc.name school_name,t.name transport_name FROM operating_links l JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id JOIN organizations t ON t.id=l.transport_id WHERE ${accessSql} AND l.id=$4 ${lock ? "FOR UPDATE OF l" : ""}`,
        [...this.params(req), id],
      )
    ).rows[0];
    if (!row)
      throw new NotFoundException(
        "Vínculo operacional não disponível neste contexto.",
      );
    return row;
  }
  assertGuardian(req: ActorRequest) {
    if (req.context?.role !== "GUARDIAN")
      throw new ForbiddenException(
        "Selecione seu perfil de responsável para configurar a rotina ou confirmar o uso.",
      );
  }
  assertMutable(plan: { locked_at: unknown }) {
    if (plan.locked_at)
      throw new ConflictException(
        "O planejamento já está bloqueado pela operação. Trate a movimentação na viagem.",
      );
  }
  async plan(req: ActorRequest, id: string, db: Queryable, lock = false) {
    // O vínculo é bloqueado antes da previsão, na mesma ordem usada pela inativação da associação.
    const candidate = (
      await db.query("SELECT operating_link_id FROM daily_plans WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!candidate)
      throw new NotFoundException("Previsão não disponível neste contexto.");
    const link = await this.link(req, candidate.operating_link_id, db, lock);
    const plan = (
      await db.query(
        `SELECT p.*,p.service_date::text service_date FROM daily_plans p WHERE p.id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [id],
      )
    ).rows[0];
    if (!plan)
      throw new NotFoundException("Previsão não disponível neste contexto.");
    return { plan, link };
  }
  async generate(req: ActorRequest, date: string, linkId?: string) {
    const candidates = (
      await this.db.pool.query(
        `SELECT l.id FROM operating_links l WHERE ${accessSql} ${linkId ? "AND l.id=$4" : ""} ORDER BY l.id`,
        [...this.params(req), ...(linkId ? [linkId] : [])],
      )
    ).rows;
    if (linkId && !candidates.length)
      throw new NotFoundException(
        "Vínculo operacional não disponível neste contexto.",
      );
    return this.db.transaction(async (db) => {
      let created = 0;
      const skipped: string[] = [];
      for (const candidate of candidates) {
        const l = await this.link(req, candidate.id, db, true);
        const policy = (
          await db.query(
            "SELECT * FROM planning_policies WHERE transport_id=$1",
            [l.transport_id],
          )
        ).rows[0];
        if (!policy) {
          skipped.push(l.id);
          continue;
        }
        const today = localDate(this.clock.now(), policy.timezone);
        if (date < today || date > addDays(today, 30))
          throw new BadRequestException(
            "Gere previsões de hoje até os próximos 30 dias.",
          );
        const routine = (
          await db.query(
            "SELECT * FROM weekly_routines WHERE operating_link_id=$1",
            [l.id],
          )
        ).rows[0];
        const weekday = new Date(date + "T12:00:00Z").getUTCDay();
        const day = (routine?.days as RoutineDay[] | undefined)?.find(
          (d) => d.weekday === weekday,
        );
        const deadline = (
          await db.query(
            "SELECT ($1::date - 1 + $2::time) AT TIME ZONE $3 AS deadline_at",
            [date, policy.cutoff_time, policy.timezone],
          )
        ).rows[0].deadline_at;
        for (const direction of ["OUTBOUND", "RETURN"] as const) {
          const scheduled = Boolean(
            day?.[direction === "OUTBOUND" ? "outbound" : "return"],
          );
          const id = randomUUID();
          const inserted = await db.query(
            `INSERT INTO daily_plans(id,operating_link_id,service_date,direction,scheduled,status,routine_revision,policy_revision,timezone,deadline_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(operating_link_id,service_date,direction) DO NOTHING RETURNING id`,
            [
              id,
              l.id,
              date,
              direction,
              scheduled,
              scheduled ? "PENDING" : "NOT_EXPECTED",
              routine?.revision || null,
              policy.revision,
              policy.timezone,
              deadline,
              req.actor.id,
            ],
          );
          if (inserted.rows[0]) {
            created++;
            await audit(
              db,
              req.actor.id,
              "DAILY_PLAN_GENERATED",
              id,
              req.context,
              {
                linkId: l.id,
                date,
                direction,
                scheduled,
                routineRevision: routine?.revision || null,
              },
            );
          }
        }
      }
      return { created, skipped };
    });
  }
  async respond(
    req: ActorRequest,
    id: string,
    input: { use: boolean; expectedVersion: number; reason?: string },
  ) {
    this.assertGuardian(req);
    return this.db.transaction((db) => this.respondLocked(req, id, input, db));
  }
  async respondDay(
    req: ActorRequest,
    choices: { id: string; use: boolean; expectedVersion: number }[],
    reason?: string,
  ) {
    this.assertGuardian(req);
    return this.db.transaction(async (db) => {
      const member = (
        await db.query(
          "SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND role='GUARDIAN' AND active FOR UPDATE",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!member) throw new ForbiddenException("Vínculo familiar revogado.");
      const ordered = [...choices].sort((a, b) => a.id.localeCompare(b.id));
      const plans = [];
      // Validate the group before acquiring link locks: never combine children or dates.
      for (const c of ordered)
        plans.push((await this.plan(req, c.id, db)).plan);
      if (
        new Set(plans.map((p) => p.operating_link_id + "|" + p.service_date))
          .size !== 1 ||
        new Set(plans.map((p) => p.direction)).size !== plans.length
      )
        throw new BadRequestException(
          "Confirme somente ida e volta da mesma criança, transporte e data.",
        );
      const results = [];
      for (const c of ordered)
        results.push(await this.respondLocked(req, c.id, { ...c, reason }, db));
      return {
        results,
        awaitingAcceptance: results.some((r) => "requestId" in r),
        unchanged: results.every((r) => "unchanged" in r && r.unchanged),
      };
    });
  }
  private async respondLocked(
    req: ActorRequest,
    id: string,
    input: { use: boolean; expectedVersion: number; reason?: string },
    db: Queryable,
  ) {
    const { plan: p } = await this.plan(req, id, db, true);
    this.assertMutable(p);
    const today = localDate(this.clock.now(), p.timezone);
    if (p.service_date < today)
      throw new ConflictException(
        "Planejamento passado é somente para consulta.",
      );
    if (p.service_date > addDays(today, 1))
      throw new BadRequestException(
        "Confirme o uso no dia anterior à data planejada.",
      );
    const pending = (
      await db.query(
        "SELECT * FROM planning_changes WHERE plan_id=$1 AND status='PENDING'",
        [id],
      )
    ).rows[0];
    if (pending) {
      if (
        pending.requested_by === req.actor.id &&
        pending.requested_usage === input.use
      )
        return { id, requestId: pending.id, unchanged: true };
      throw new ConflictException(
        "Já existe alteração em análise. Aguarde a decisão ou retire o pedido.",
      );
    }
    const desired = input.use ? "CONFIRMED" : "NOT_USING";
    if (p.version !== input.expectedVersion) {
      if (p.status === desired && p.changed_by === req.actor.id)
        return { id, unchanged: true };
      throw new ConflictException(
        "O planejamento mudou. Atualize antes de confirmar.",
      );
    }
    if (p.status === desired) return { id, unchanged: true };
    if (this.clock.now().getTime() >= new Date(p.deadline_at).getTime()) {
      if (!input.reason || input.reason.trim().length < 10)
        throw new BadRequestException(
          "Após o limite, descreva o motivo da alteração em pelo menos 10 caracteres.",
        );
      const requestId = randomUUID();
      await db.query(
        "INSERT INTO planning_changes(id,plan_id,requested_usage,previous_status,reason,status,requested_by) VALUES($1,$2,$3,$4,$5,'PENDING',$6)",
        [requestId, id, input.use, p.status, input.reason.trim(), req.actor.id],
      );
      await db.query(
        "UPDATE daily_plans SET version=version+1,changed_at=now() WHERE id=$1",
        [id],
      );
      await audit(
        db,
        req.actor.id,
        "PLANNING_CHANGE_REQUESTED",
        requestId,
        req.context,
        { planId: id, use: input.use, reason: input.reason },
      );
      return { id, requestId, awaitingAcceptance: true };
    }
    await db.query(
      "UPDATE daily_plans SET status=$1,version=version+1,changed_by=$2,changed_at=now() WHERE id=$3",
      [desired, req.actor.id, id],
    );
    await audit(db, req.actor.id, "DAILY_PLAN_RESPONDED", id, req.context, {
      previousStatus: p.status,
      status: desired,
      use: input.use,
    });
    return { id, awaitingAcceptance: false };
  }
}
