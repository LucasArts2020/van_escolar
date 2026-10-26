import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ActorRequest, AuthGuard, ContextGuard, parse, uuid } from "./auth";
import { Database, audit } from "./db";
import { PlanningService, accessSql } from "./planning.service";
import { localDate, addDays } from "./planning-clock";
const dateSchema = z.iso.date("Data inválida.");
const reason = z
  .string()
  .trim()
  .min(10, "Informe pelo menos 10 caracteres.")
  .max(1000);
const days = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        outbound: z.boolean(),
        return: z.boolean(),
      })
      .strict(),
  )
  .length(7)
  .refine(
    (v) => new Set(v.map((d) => d.weekday)).size === 7,
    "Informe os sete dias da semana, sem repetição.",
  );
@Controller("planning")
@UseGuards(AuthGuard, ContextGuard)
export class PlanningController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningService) private service: PlanningService,
  ) {}
  @Get("options")
  async options(@Req() req: ActorRequest) {
    const links = (
      await this.db.pool.query(
        `SELECT l.id,l.student_id,l.school_id,l.transport_id,s.name student_name,sc.name school_name,t.name transport_name,p.cutoff_time::text cutoff_time,p.timezone,p.revision policy_revision,p.demo policy_demo FROM operating_links l JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id JOIN organizations t ON t.id=l.transport_id LEFT JOIN planning_policies p ON p.transport_id=l.transport_id WHERE ${accessSql} ORDER BY s.name,l.id`,
        this.service.params(req),
      )
    ).rows;
    const now = this.service.clock.now();
    const policy =
      req.context!.role === "DRIVER"
        ? (
            await this.db.pool.query(
              "SELECT transport_id,cutoff_time::text cutoff_time,timezone,revision,demo FROM planning_policies WHERE transport_id=$1",
              [req.context!.organization_id],
            )
          ).rows[0] || null
        : null;
    return {
      serverNow: now.toISOString(),
      defaultToday: localDate(now, policy?.timezone || "America/Sao_Paulo"),
      policy,
      links: links.map((l) => ({
        ...l,
        today: localDate(now, l.timezone || "America/Sao_Paulo"),
        tomorrow: addDays(localDate(now, l.timezone || "America/Sao_Paulo"), 1),
      })),
    };
  }
  @Put("policy")
  async policy(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = req.context!;
    if (c.role !== "DRIVER")
      throw new ForbiddenException(
        "Somente o transporte configura seu limite de confirmação.",
      );
    const input = parse(
      z
        .object({
          cutoffTime: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
          timezone: z.string().min(3).max(80),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      body,
    );
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone }).format();
    } catch {
      throw new BadRequestException("Fuso horário inválido.");
    }
    const zone = (
      await this.db.pool.query(
        "SELECT name FROM pg_timezone_names WHERE name=$1",
        [input.timezone],
      )
    ).rows[0];
    if (!zone)
      throw new BadRequestException("Fuso horário não disponível no banco.");
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        c.organization_id,
      ]);
      const current = (
        await db.query(
          "SELECT * FROM planning_policies WHERE transport_id=$1 FOR UPDATE",
          [c.organization_id],
        )
      ).rows[0];
      if ((current?.revision || 0) !== input.expectedRevision)
        throw new ConflictException(
          "A configuração mudou. Atualize antes de salvar.",
        );
      const revision = (current?.revision || 0) + 1;
      await db.query(
        `INSERT INTO planning_policies(transport_id,cutoff_time,timezone,revision,changed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(transport_id) DO UPDATE SET cutoff_time=EXCLUDED.cutoff_time,timezone=EXCLUDED.timezone,revision=EXCLUDED.revision,demo=false,changed_by=EXCLUDED.changed_by,changed_at=now()`,
        [
          c.organization_id,
          input.cutoffTime,
          input.timezone,
          revision,
          req.actor.id,
        ],
      );
      await audit(
        db,
        req.actor.id,
        "PLANNING_POLICY_UPDATED",
        c.organization_id,
        c,
        { cutoffTime: input.cutoffTime, timezone: input.timezone, revision },
      );
      return { revision };
    });
  }
  @Get("routines/:linkId")
  async routine(@Req() req: ActorRequest, @Param("linkId") linkId: string) {
    parse(uuid, linkId);
    await this.service.link(req, linkId);
    const row = (
      await this.db.pool.query(
        "SELECT revision,days,changed_at FROM weekly_routines WHERE operating_link_id=$1",
        [linkId],
      )
    ).rows[0];
    return (
      row || {
        revision: 0,
        days: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          outbound: false,
          return: false,
        })),
        changed_at: null,
      }
    );
  }
  @Put("routines/:linkId")
  async saveRoutine(
    @Req() req: ActorRequest,
    @Param("linkId") linkId: string,
    @Body() body: unknown,
  ) {
    this.service.assertGuardian(req);
    parse(uuid, linkId);
    const input = parse(
      z.object({ expectedRevision: z.number().int().min(0), days }).strict(),
      body,
    );
    return this.db.transaction(async (db) => {
      await this.service.link(req, linkId, db, true);
      const current = (
        await db.query(
          "SELECT * FROM weekly_routines WHERE operating_link_id=$1 FOR UPDATE",
          [linkId],
        )
      ).rows[0];
      if ((current?.revision || 0) !== input.expectedRevision)
        throw new ConflictException(
          "A rotina foi alterada por outro responsável. Atualize antes de salvar.",
        );
      const id = current?.id || randomUUID(),
        revision = (current?.revision || 0) + 1;
      await db.query(
        "INSERT INTO weekly_routines(id,operating_link_id,revision,days,changed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(operating_link_id) DO UPDATE SET revision=EXCLUDED.revision,days=EXCLUDED.days,changed_by=EXCLUDED.changed_by,changed_at=now()",
        [id, linkId, revision, JSON.stringify(input.days), req.actor.id],
      );
      await audit(db, req.actor.id, "WEEKLY_ROUTINE_UPDATED", id, req.context, {
        linkId,
        revision,
        days: input.days,
      });
      return { revision };
    });
  }
  @Post("generate")
  async generate(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = parse(
      z.object({ date: dateSchema, linkId: uuid.optional() }).strict(),
      body,
    );
    return this.service.generate(req, input.date, input.linkId);
  }
  @Get("day")
  async day(@Req() req: ActorRequest, @Query("date") date: unknown) {
    const value = parse(dateSchema, date);
    const rows = (
      await this.db.pool.query(
        `SELECT p.*,p.service_date::text service_date,l.student_id,s.name student_name,sc.name school_name,t.name transport_name,
      pc.id request_id,pc.requested_usage,pc.reason request_reason,pc.requested_by,pc.requested_by=$3 can_withdraw,
      (SELECT json_build_object('status',ch.status,'requestedUsage',ch.requested_usage,'reason',ch.reason,'decisionNote',ch.decision_note,'decidedAt',ch.decided_at) FROM planning_changes ch WHERE ch.plan_id=p.id ORDER BY ch.requested_at DESC,ch.id DESC LIMIT 1) last_change
      FROM daily_plans p JOIN operating_links l ON l.id=p.operating_link_id JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id JOIN organizations t ON t.id=l.transport_id LEFT JOIN planning_changes pc ON pc.plan_id=p.id AND pc.status='PENDING' WHERE ${accessSql} AND p.service_date=$4 ORDER BY s.name,l.id,p.direction`,
        [...this.service.params(req), value],
      )
    ).rows;
    return {
      date: value,
      plans: rows.map((p) => ({
        ...p,
        late:
          this.service.clock.now().getTime() >=
          new Date(p.deadline_at).getTime(),
        today: localDate(this.service.clock.now(), p.timezone),
        exception:
          (p.status === "CONFIRMED" && !p.scheduled) ||
          (p.status === "NOT_USING" && p.scheduled),
      })),
      counts: {
        scheduled: rows.filter((p) => p.scheduled).length,
        pending: rows.filter((p) => p.status === "PENDING").length,
        confirmed: rows.filter((p) => p.status === "CONFIRMED").length,
        notUsing: rows.filter((p) => p.status === "NOT_USING").length,
        notExpected: rows.filter((p) => p.status === "NOT_EXPECTED").length,
        awaitingChanges: rows.filter((p) => p.request_id).length,
      },
    };
  }
  @Post("plans/:id/respond")
  async respond(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const input = parse(
      z
        .object({
          use: z.boolean(),
          expectedVersion: z.number().int().min(1),
          reason: reason.optional(),
        })
        .strict(),
      body,
    );
    return this.service.respond(req, id, input);
  }
  @Patch("changes/:id")
  async decide(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const input = parse(
      z
        .object({
          action: z.enum(["ACCEPT", "REFUSE", "WITHDRAW"]),
          note: reason.optional(),
        })
        .strict(),
      body,
    );
    return this.db.transaction(async (db) => {
      const candidate = (
        await db.query("SELECT plan_id FROM planning_changes WHERE id=$1", [id])
      ).rows[0];
      if (!candidate)
        throw new NotFoundException("Alteração não disponível neste contexto.");
      const { plan: p, link: l } = await this.service.plan(
        req,
        candidate.plan_id,
        db,
        true,
      );
      this.service.assertMutable(p);
      if (p.service_date < localDate(this.service.clock.now(), p.timezone))
        throw new ConflictException(
          "Alterações de planejamento passado não podem ser decididas nesta etapa.",
        );
      const change = (
        await db.query(
          "SELECT * FROM planning_changes WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (input.action === "WITHDRAW") {
        this.service.assertGuardian(req);
        if (change.requested_by !== req.actor.id)
          throw new ForbiddenException(
            "Somente quem solicitou pode retirar este pedido.",
          );
      } else if (
        req.context!.role !== "DRIVER" ||
        req.context!.organization_id !== l.transport_id
      )
        throw new ForbiddenException(
          "A alteração tardia precisa ser decidida pelo transporte vinculado.",
        );
      if (change.status !== "PENDING")
        throw new ConflictException(
          "Esta alteração já foi decidida ou retirada.",
        );
      if (input.action === "ACCEPT") {
        const verified = await db.query(
          "SELECT g.id FROM guardian_links g WHERE g.student_id=$1 AND g.user_id=$2 AND g.status='ACTIVE' AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=g.user_id AND m.role='GUARDIAN' AND m.active)",
          [l.student_id, change.requested_by],
        );
        if (!verified.rows[0])
          throw new ConflictException(
            "O solicitante não possui mais vínculo familiar ativo.",
          );
        await db.query(
          "UPDATE daily_plans SET status=$1,version=version+1,changed_by=$2,changed_at=now() WHERE id=$3",
          [
            change.requested_usage ? "CONFIRMED" : "NOT_USING",
            req.actor.id,
            p.id,
          ],
        );
      } else {
        if (input.action === "REFUSE" && !input.note)
          throw new BadRequestException("Informe o motivo da recusa.");
        await db.query(
          "UPDATE daily_plans SET version=version+1,changed_at=now() WHERE id=$1",
          [p.id],
        );
      }
      const status = {
        ACCEPT: "ACCEPTED",
        REFUSE: "REFUSED",
        WITHDRAW: "WITHDRAWN",
      }[input.action];
      await db.query(
        "UPDATE planning_changes SET status=$1,decided_by=$2,decided_at=now(),decision_note=$3 WHERE id=$4",
        [status, req.actor.id, input.note || null, id],
      );
      await audit(
        db,
        req.actor.id,
        "PLANNING_CHANGE_" + status,
        id,
        req.context,
        { planId: p.id, use: change.requested_usage, note: input.note },
      );
      return { ok: true };
    });
  }
}
