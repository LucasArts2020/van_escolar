import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { PlanningClock, localDate, addDays } from "./planning-clock";
import {
  Tx,
  alertEvent,
  caseRow,
  notifyAlert,
  syncPassengerAlerts,
} from "./alerts-domain";
import {
  historyScope,
  historyJoin,
  currentException,
  invalidateAccounting,
} from "./history-domain";
import { MovementsService } from "./movements.service";
import { finalReview } from "./trip-closure";
import { recordNotificationEvent } from "./notification-events";
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
@Injectable()
export class HistoryService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningClock) private clock: PlanningClock,
    @Inject(MovementsService) private movements: MovementsService,
  ) {}
  params(req: ActorRequest) {
    return [req.context!.organization_id, req.context!.role, req.actor.id];
  }
  async allowed(req: ActorRequest, id: string, db: Tx = this.db.pool) {
    const p = (
      await db.query(
        `SELECT p.*,l.status link_status,t.transport_id,t.driver_membership_id,t.status trip_status,t.direction,t.timezone,t.service_date::text service_date,t.version trip_version ${historyJoin}
   WHERE p.id=$4 AND ${historyScope}`,
        [...this.params(req), id],
      )
    ).rows[0];
    if (!p)
      throw new NotFoundException("Histórico não disponível neste contexto.");
    return p;
  }
  async options(req: ActorRequest) {
    const students = (
      await this.db.pool.query(
        `SELECT id,name FROM (SELECT DISTINCT ON(p.student_id) p.student_id id,p.student_name name ${historyJoin} WHERE ${historyScope} ORDER BY p.student_id,t.service_date DESC,t.created_at DESC,p.id) names ORDER BY name,id`,
        this.params(req),
      )
    ).rows;
    let rows = (
      await this.db.pool.query(
        `SELECT DISTINCT t.transport_id,COALESCE(pp.timezone,t.timezone) timezone,o.name,
   ap.reminder_minutes,ap.attention_minutes,ap.critical_minutes,pp.cutoff_time::text cutoff_time
   ${historyJoin} JOIN organizations o ON o.id=t.transport_id LEFT JOIN alert_policies ap ON ap.transport_id=t.transport_id
   LEFT JOIN planning_policies pp ON pp.transport_id=t.transport_id WHERE ${historyScope} ORDER BY o.name,t.transport_id`,
        this.params(req),
      )
    ).rows;
    if (req.context!.role === "DRIVER")
      rows = (
        await this.db.pool.query(
          `SELECT o.id transport_id,o.name,COALESCE(pp.timezone,'Não configurado') timezone,pp.cutoff_time::text cutoff_time,ap.reminder_minutes,ap.attention_minutes,ap.critical_minutes FROM organizations o LEFT JOIN planning_policies pp ON pp.transport_id=o.id LEFT JOIN alert_policies ap ON ap.transport_id=o.id WHERE o.id=$1`,
          [req.context!.organization_id],
        )
      ).rows;
    return {
      today: localDate(this.clock.now(), "America/Sao_Paulo"),
      students,
      operations: rows,
      canConfigure: req.context!.role === "DRIVER",
      canReview: req.context!.role === "SCHOOL" && req.context!.coordinator,
      exceptionalAuthority:
        "Coordenação da escola, com motivo, contato e verificação física registrados.",
      offlineProcedure:
        "Sem comunicação com o servidor, a ação não é apresentada como recebida. Não há fila offline. Restabeleça a conexão, atualize o histórico e verifique se o registro foi recebido antes de repetir. Use os contatos operacionais já acordados; o sistema não inventa canal ou destinatário alternativo.",
      retention:
        "Prazo de retenção e exportação pendentes de definição (D-11). Nenhuma exclusão automática ou exportação disponível nesta etapa.",
    };
  }
  async list(
    req: ActorRequest,
    q: {
      from: string;
      to: string;
      studentId?: string;
      tripId?: string;
      offset: number;
    },
  ) {
    if (q.from > q.to || q.to > addDays(q.from, 92))
      throw new BadRequestException(
        "Consulte um intervalo de até 93 dias, com início anterior ao fim.",
      );
    const rows = (
      await this.db.pool.query(
        `SELECT p.id,p.student_id,p.student_name,p.school_name,t.id trip_id,t.service_date::text service_date,t.direction,t.status,t.timezone,t.vehicle_name,
   (SELECT count(*)::int FROM confirmation_corrections c WHERE c.passenger_id=p.id AND c.status='PENDING') pending_corrections,
   EXISTS(SELECT 1 FROM exceptional_resolutions e WHERE e.passenger_id=p.id AND e.safety_revision=p.safety_revision) exceptional
   ${historyJoin} WHERE ${historyScope} AND t.service_date BETWEEN $4::date AND $5::date AND ($6::uuid IS NULL OR p.student_id=$6) AND ($7::uuid IS NULL OR t.id=$7)
   ORDER BY t.service_date DESC,t.id,p.id LIMIT 31 OFFSET $8`,
        [
          ...this.params(req),
          q.from,
          q.to,
          q.studentId || null,
          q.tripId || null,
          q.offset,
        ],
      )
    ).rows;
    return {
      items: rows.slice(0, 30),
      hasMore: rows.length > 30,
      nextOffset: q.offset + 30,
    };
  }
  async recipients(db: Tx, p: any, lock = false) {
    return (
      await db.query(
        `SELECT m.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.active AND (
   ($1='OUTBOUND' AND m.role='SCHOOL' AND m.organization_id=$2) OR
   ($1='RETURN' AND m.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=$3 AND g.user_id=m.user_id AND g.status='ACTIVE')))
   ORDER BY u.name,m.id${lock ? " FOR UPDATE OF m" : ""}`,
        [p.direction, p.school_id, p.student_id],
      )
    ).rows;
  }
  async detail(req: ActorRequest, id: string) {
    const p = await this.allowed(req, id);
    const trip = (
      await this.db.pool.query(
        "SELECT *,service_date::text service_date FROM trips WHERE id=$1",
        [p.trip_id],
      )
    ).rows[0];
    const [passenger] = await this.movements.summaries(req, trip, [p]);
    const corrections = (
      await this.db.pool.query(
        `SELECT c.id,c.confirmation_id,c.reason,c.account,c.created_at,c.actor_name,c.status,c.version,
   c.decision_actor_name,c.decided_at,c.decision_reason,c.contacts,c.verification FROM confirmation_corrections c WHERE c.passenger_id=$1 ORDER BY c.created_at,c.id`,
        [id],
      )
    ).rows;
    const confirmations = (
      await this.db.pool.query(
        `SELECT c.*,m.kind FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=$1 ORDER BY c.received_at,c.id`,
        [id],
      )
    ).rows;
    const alerts = (
      await this.db.pool.query(
        `SELECT a.id,a.kind,a.status,a.level,a.origin_at,a.resolved_at,a.resolution_kind,a.resolution_note FROM alert_cases a JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=$1 ORDER BY a.origin_at,a.id`,
        [id],
      )
    ).rows;
    const alertHistory = (
      await this.db.pool.query(
        `SELECT e.id,e.case_id,e.type,e.actor_name,e.occurred_at,e.details FROM alert_events e JOIN alert_cases a ON a.id=e.case_id JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=$1 ORDER BY e.occurred_at,e.position`,
        [id],
      )
    ).rows;
    const resolutions = (
      await this.db.pool.query(
        `SELECT id,actor_name,created_at,reason,contacts,verification,outcome,recipient_name,safety_revision FROM exceptional_resolutions WHERE passenger_id=$1 ORDER BY safety_revision`,
        [id],
      )
    ).rows.map((e) => ({
      ...e,
      current: e.safety_revision === p.safety_revision,
    }));
    const inspections = (
      await this.db.pool.query(
        "SELECT id,actor_name,inspected_at,van_empty,result,trip_version FROM trip_inspections WHERE trip_id=$1 ORDER BY trip_version",
        [p.trip_id],
      )
    ).rows;
    const assignments = (
      await this.db.pool.query(
        "SELECT id,driver_name,vehicle_name,vehicle_plate,created_at FROM trip_assignments WHERE trip_id=$1 ORDER BY created_at,id",
        [p.trip_id],
      )
    ).rows;
    const canReview =
      req.context!.role === "SCHOOL" &&
      req.context!.organization_id === p.school_id &&
      req.context!.coordinator;
    const cancelled = trip.status === "CANCELLED";
    return {
      passenger,
      trip: {
        id: trip.id,
        service_date: trip.service_date,
        direction: trip.direction,
        status: trip.status,
        version: trip.version,
        timezone: trip.timezone,
        vehicle_name: trip.vehicle_name,
        driver_name: trip.driver_name,
        started_at: trip.started_at,
        completed_at: trip.completed_at,
        review_opened_at: trip.review_opened_at,
      },
      confirmations: confirmations.map((c) => ({
        ...c,
        canRequestCorrection:
          !cancelled &&
          c.actor_id === req.actor.id &&
          !corrections.some(
            (r) => r.confirmation_id === c.id && r.status !== "REJECTED",
          ),
      })),
      corrections,
      alerts,
      alertHistory,
      resolutions,
      inspections,
      assignments,
      canReview,
      canResolveException:
        canReview &&
        ["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
          trip.status,
        ) &&
        !corrections.some((c) => c.status === "PENDING") &&
        !resolutions.some((e) => e.current) &&
        !(await finalReview(this.db.pool, p.trip_id, [p.id])).ready,
      recipients: canReview ? await this.recipients(this.db.pool, p) : [],
    };
  }
  async write<T>(
    req: ActorRequest,
    id: string,
    fn: (db: Tx, p: any) => Promise<T>,
  ) {
    const initial = await this.allowed(req, id);
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        initial.transport_id,
      ]);
      await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
        initial.trip_id,
      ]);
      // Mesma ordem de vínculos usada pelas confirmações; revalidação após aguardar o lock.
      await db.query("SELECT id FROM operating_links WHERE id=$1 FOR UPDATE", [
        initial.operating_link_id,
      ]);
      const m = (
        await db.query(
          "SELECT * FROM memberships WHERE id=$1 AND user_id=$2 AND active FOR UPDATE",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!m) throw new ForbiddenException("Contexto revogado.");
      req.context = { ...req.context!, ...m };
      if (m.role === "GUARDIAN")
        await db.query(
          "SELECT id FROM guardian_links WHERE student_id=$1 AND user_id=$2 FOR UPDATE",
          [initial.student_id, req.actor.id],
        );
      const p = await this.allowed(req, id, db);
      return fn(db, p);
    });
  }
  actor(req: ActorRequest) {
    return {
      id: req.actor.id,
      name: req.actor.name,
      role: req.context!.role,
      membershipId: req.context!.id,
    };
  }
  coordinator(req: ActorRequest, p: any) {
    if (
      req.context!.role !== "SCHOOL" ||
      !req.context!.coordinator ||
      req.context!.organization_id !== p.school_id
    )
      throw new ForbiddenException(
        "Somente a coordenação da escola desta criança pode decidir ou resolver excepcionalmente.",
      );
  }
  async resolveCase(
    db: Tx,
    id: string,
    req: ActorRequest,
    kind: string,
    note: string,
    now: Date,
    details: object = {},
  ) {
    const a = await caseRow(db, id);
    if (!a || a.status === "RESOLVED") return;
    await db.query(
      "UPDATE alert_cases SET status='RESOLVED',resolved_at=$2,resolved_by=$3,resolution_kind=$4,resolution_note=$5,next_due_at=NULL,version=version+1 WHERE id=$1",
      [id, now, req.actor.id, kind, note],
    );
    if (a.source_issue_id)
      await db.query(
        "UPDATE movement_issues SET status='RESOLVED' WHERE id=$1",
        [a.source_issue_id],
      );
    const event = await alertEvent(
      db,
      a,
      "RESOLVED",
      now,
      { resolutionKind: kind, note, ...details },
      this.actor(req),
    );
    await notifyAlert(db, a, event, now, true);
  }
  async requestCorrection(
    req: ActorRequest,
    passengerId: string,
    input: {
      id: string;
      confirmationId: string;
      reason: string;
      account: string;
      expectedVersion: number;
    },
  ) {
    return this.write(req, passengerId, async (db, p) => {
      const hash = fingerprint({
        ...input,
        passengerId,
        actor: req.actor.id,
        context: req.context!.id,
      });
      const old = (
        await db.query(
          "SELECT id,request_hash FROM confirmation_corrections WHERE id=$1",
          [input.id],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new ConflictException("Chave já usada em outra solicitação.");
        return { id: old.id, unchanged: true };
      }
      if (p.trip_version !== input.expectedVersion)
        throw new ConflictException(
          "A viagem mudou. Atualize antes de solicitar correção.",
        );
      if (!p.active || p.link_status !== "ACTIVE")
        throw new ConflictException(
          "Vínculo inativo: histórico preservado para consulta, sem nova solicitação operacional.",
        );
      if (
        ![
          "IN_PROGRESS",
          "ROUTE_ENDED_OPEN",
          "COMPLETED",
          "COMPLETED_REVIEW",
        ].includes(p.trip_status)
      )
        throw new ConflictException("Correções exigem viagem iniciada.");
      const c = (
        await db.query(
          `SELECT c.*,m.kind FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE c.id=$1 AND m.passenger_id=$2`,
          [input.confirmationId, p.id],
        )
      ).rows[0];
      if (!c || c.actor_id !== req.actor.id)
        throw new ForbiddenException(
          "Solicite correção somente da confirmação registrada por você. A confirmação de outra pessoa permanece sob a autoria dela.",
        );
      if (
        (
          await db.query(
            "SELECT id FROM confirmation_corrections WHERE confirmation_id=$1 AND status IN ('PENDING','APPROVED')",
            [c.id],
          )
        ).rows[0]
      )
        throw new ConflictException(
          "Já há uma correção pendente ou aprovada para este registro.",
        );
      const now = this.clock.now(),
        alertId = randomUUID();
      await invalidateAccounting(db, p.id);
      await db.query(
        "INSERT INTO alert_cases(id,movement_id,kind,level,origin_at,reported_by,report_note) VALUES($1,$2,'CORRECTION_CONFLICT',3,$3,$4,$5)",
        [alertId, c.movement_id, now, req.actor.id, input.reason],
      );
      await db.query(
        `INSERT INTO confirmation_corrections(id,confirmation_id,passenger_id,alert_id,requested_by,membership_id,actor_name,reason,account,created_at,request_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.id,
          c.id,
          p.id,
          alertId,
          req.actor.id,
          req.context!.id,
          req.actor.name,
          input.reason,
          input.account,
          now,
          hash,
        ],
      );
      await db.query(
        `UPDATE trips SET status=CASE WHEN status='COMPLETED' THEN 'COMPLETED_REVIEW' ELSE status END,
    review_opened_at=CASE WHEN status='COMPLETED' THEN $2 ELSE review_opened_at END,version=version+1 WHERE id=$1`,
        [p.trip_id, now],
      );
      const a = await caseRow(db, alertId),
        event = await alertEvent(
          db,
          a,
          "CREATED",
          now,
          { correctionId: input.id, confirmationId: c.id, note: input.reason },
          this.actor(req),
        );
      await notifyAlert(db, a, event, now);
      await audit(
        db,
        req.actor.id,
        "CORRECTION_REQUESTED",
        input.id,
        req.context,
        {
          passengerId: p.id,
          tripId: p.trip_id,
          confirmationId: c.id,
          previousTripStatus: p.trip_status,
          reason: input.reason,
          account: input.account,
        },
      );
      return { id: input.id };
    });
  }
  async decide(
    req: ActorRequest,
    passengerId: string,
    id: string,
    input: {
      expectedVersion: number;
      decision: "APPROVED" | "REJECTED";
      reason: string;
      contacts: string;
      verification: string;
    },
  ) {
    return this.write(req, passengerId, async (db, p) => {
      this.coordinator(req, p);
      const c = (
        await db.query(
          "SELECT * FROM confirmation_corrections WHERE id=$1 AND passenger_id=$2 FOR UPDATE",
          [id, p.id],
        )
      ).rows[0];
      if (!c) throw new NotFoundException("Solicitação não disponível.");
      if (c.status !== "PENDING" || c.version !== input.expectedVersion)
        throw new ConflictException("A solicitação já mudou ou foi decidida.");
      const now = this.clock.now();
      await db.query(
        `UPDATE confirmation_corrections SET status=$2,version=version+1,decided_by=$3,decision_membership_id=$4,decision_actor_name=$5,decided_at=$6,decision_reason=$7,contacts=$8,verification=$9 WHERE id=$1`,
        [
          id,
          input.decision,
          req.actor.id,
          req.context!.id,
          req.actor.name,
          now,
          input.reason,
          input.contacts,
          input.verification,
        ],
      );
      await invalidateAccounting(db, p.id);
      await db.query("UPDATE trips SET version=version+1 WHERE id=$1", [
        p.trip_id,
      ]);
      if (input.decision === "REJECTED")
        await this.resolveCase(
          db,
          c.alert_id,
          req,
          "CORRECTION_REJECTED",
          input.reason,
          now,
          { contacts: input.contacts, verification: input.verification },
        );
      else {
        const a = await caseRow(db, c.alert_id);
        await alertEvent(
          db,
          a,
          "VERIFICATION",
          now,
          {
            correctionId: id,
            decision: "APPROVED",
            note: input.reason,
            contacts: input.contacts,
            verification: input.verification,
          },
          this.actor(req),
        );
      }
      await syncPassengerAlerts(db, p.id, now);
      await audit(
        db,
        req.actor.id,
        "CORRECTION_" + input.decision,
        id,
        req.context,
        { passengerId: p.id, ...input },
      );
      return { id };
    });
  }
  async exceptional(
    req: ActorRequest,
    passengerId: string,
    input: {
      id: string;
      expectedVersion: number;
      reason: string;
      contacts: string;
      verification: string;
      physicalCheck: true;
      outcome: "DELIVERED" | "NOT_TRANSPORTED";
      recipientId?: string;
    },
  ) {
    return this.write(req, passengerId, async (db, p) => {
      this.coordinator(req, p);
      const hash = fingerprint({
        ...input,
        passengerId,
        actor: req.actor.id,
        context: req.context!.id,
      });
      const old = (
        await db.query(
          "SELECT id,request_hash FROM exceptional_resolutions WHERE id=$1",
          [input.id],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new ConflictException("Chave já usada em outra resolução.");
        return { id: old.id, unchanged: true };
      }
      if (p.trip_version !== input.expectedVersion)
        throw new ConflictException(
          "A viagem mudou. Atualize a verificação antes de resolver.",
        );
      if (
        !["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
          p.trip_status,
        ) ||
        !p.active ||
        p.link_status !== "ACTIVE"
      )
        throw new ConflictException(
          "A resolução exige participação ativa em viagem aberta ou sob revisão.",
        );
      if (
        (
          await db.query(
            "SELECT id FROM confirmation_corrections WHERE passenger_id=$1 AND status='PENDING'",
            [p.id],
          )
        ).rows[0]
      )
        throw new ConflictException(
          "Decida primeiro as solicitações de correção pendentes.",
        );
      if (await currentException(db, p.id))
        throw new ConflictException(
          "Já há uma contabilização excepcional vigente.",
        );
      if ((await finalReview(db, p.trip_id, [p.id])).ready)
        throw new ConflictException(
          "A contabilização já está atendida pelas regras normais. Não há exceção a resolver.",
        );
      const valid = (
        await db.query(
          `SELECT c.id FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=$1
    AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED')`,
          [p.id],
        )
      ).rows;
      if (input.outcome === "NOT_TRANSPORTED" && valid.length)
        throw new ConflictException(
          "Não transportada exige ausência de confirmações vigentes; registros contestados precisam de correção aprovada.",
        );
      let recipient: any;
      if (input.outcome === "DELIVERED") {
        recipient = (await this.recipients(db, p, true)).find(
          (m) => m.id === input.recipientId,
        );
        if (!recipient)
          throw new BadRequestException(
            "Identifique um recebedor ativo da escola na ida ou responsável verificado na volta. Outro adulto ainda depende de autorização definida em D-08.",
          );
        if (
          recipient.role === "GUARDIAN" &&
          !(
            await db.query(
              "SELECT id FROM guardian_links WHERE student_id=$1 AND user_id=(SELECT user_id FROM memberships WHERE id=$2) AND status='ACTIVE' FOR UPDATE",
              [p.student_id, recipient.id],
            )
          ).rows[0]
        )
          throw new BadRequestException(
            "O vínculo do recebedor foi revogado. Atualize a verificação.",
          );
      }
      const now = this.clock.now();
      await db.query(
        `INSERT INTO exceptional_resolutions(id,passenger_id,safety_revision,actor_id,membership_id,actor_name,created_at,reason,contacts,verification,outcome,recipient_membership_id,recipient_name,request_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          input.id,
          p.id,
          p.safety_revision,
          req.actor.id,
          req.context!.id,
          req.actor.name,
          now,
          input.reason,
          input.contacts,
          input.verification,
          input.outcome,
          recipient?.id || null,
          recipient?.name || null,
          hash,
        ],
      );
      const cases = (
        await db.query(
          "SELECT a.id FROM alert_cases a JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=$1 AND a.status<>'RESOLVED' ORDER BY a.id FOR UPDATE OF a",
          [p.id],
        )
      ).rows;
      for (const a of cases)
        await this.resolveCase(
          db,
          a.id,
          req,
          "EXCEPTIONAL_ACCOUNTING",
          input.reason,
          now,
          {
            resolutionId: input.id,
            contacts: input.contacts,
            verification: input.verification,
            outcome: input.outcome,
            recipientName: recipient?.name,
          },
        );
      await db.query("UPDATE trips SET version=version+1 WHERE id=$1", [
        p.trip_id,
      ]);
      await audit(
        db,
        req.actor.id,
        "EXCEPTIONAL_ACCOUNTING",
        input.id,
        req.context,
        { passengerId: p.id, tripId: p.trip_id, ...input },
      );
      await db.query(
        "INSERT INTO movements(id,passenger_id,kind,counterpart_role,created_at) VALUES($1,$2,'ALIGHTING',$3,$4) ON CONFLICT(passenger_id,kind) DO NOTHING",
        [
          randomUUID(),
          p.id,
          p.direction === "OUTBOUND" ? "SCHOOL" : "GUARDIAN",
          now,
        ],
      );
      const movement = (
        await db.query(
          "SELECT id FROM movements WHERE passenger_id=$1 AND kind='ALIGHTING'",
          [p.id],
        )
      ).rows[0];
      await recordNotificationEvent(db, {
        confirmationId: null,
        exceptionalResolutionId: input.id,
        movementId: movement.id,
        passengerId: p.id,
        kind: "EXCEPTIONAL_ACCOUNTING",
        state: "INFORMED",
        actorName: req.actor.name,
        actorRole: req.context!.role,
        occurredAt: now,
      });
      return { id: input.id };
    });
  }
}
