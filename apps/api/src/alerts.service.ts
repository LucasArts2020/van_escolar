import {
  resolutionReceipt,
  acknowledgeResolution,
  receiptJoin,
  pendingReceipt,
  receiptEligible,
  pendingResolutionCount,
} from "./resolution-receipts";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { invalidateAccounting } from "./history-domain";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { PlanningClock } from "./planning-clock";
import { TripsService } from "./trips.service";
import { NotificationsService } from "./notifications.service";
import {
  Tx,
  alertJoin,
  alertScope,
  caseRow,
  confirmations,
  syncPassengerAlerts,
  alertEvent,
  notifyAlert,
  nextDue,
} from "./alerts-domain";
@Injectable()
export class AlertsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningClock) private clock: PlanningClock,
    @Inject(TripsService) private trips: TripsService,
    @Inject(NotificationsService) private notifications: NotificationsService,
  ) {}
  params(req: ActorRequest) {
    return [req.context!.organization_id, req.context!.role, req.actor.id];
  }
  async allowed(req: ActorRequest, id: string, db: Tx = this.db.pool) {
    const row = (
      await db.query(
        `SELECT a.id ${alertJoin} WHERE ${alertScope} AND a.id=$4`,
        [...this.params(req), id],
      )
    ).rows[0];
    if (!row)
      throw new NotFoundException("Ocorrência não disponível neste contexto.");
    return caseRow(db, id);
  }
  async options(req: ActorRequest) {
    const c = req.context!;
    const policies =
      c.role === "DRIVER"
        ? (
            await this.db.pool.query(
              "SELECT * FROM alert_policies WHERE transport_id=$1",
              [c.organization_id],
            )
          ).rows
        : [];
    return {
      canConfigure: c.role === "DRIVER",
      policy: policies[0] || null,
      proposal: {
        reminderMinutes: 5,
        attentionMinutes: 10,
        criticalMinutes: 15,
      },
    };
  }
  async policy(
    req: ActorRequest,
    input: {
      expectedRevision: number;
      reminderMinutes: number;
      attentionMinutes: number;
      criticalMinutes: number;
    },
  ) {
    if (req.context!.role !== "DRIVER")
      throw new ForbiddenException(
        "Nesta proposta, somente o transporte configura seus intervalos.",
      );
    await this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        req.context!.organization_id,
      ]);
      const m = (
        await db.query(
          "SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND active AND role='DRIVER'",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!m) throw new ForbiddenException("Contexto revogado.");
      const previous = (
        await db.query(
          "SELECT revision FROM alert_policies WHERE transport_id=$1",
          [req.context!.organization_id],
        )
      ).rows[0];
      if ((previous?.revision || 0) !== input.expectedRevision)
        throw new ConflictException(
          "Os intervalos mudaram. Atualize antes de salvar.",
        );
      await db.query(
        `INSERT INTO alert_policies(transport_id,reminder_minutes,attention_minutes,critical_minutes,changed_by)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(transport_id) DO UPDATE SET reminder_minutes=EXCLUDED.reminder_minutes,attention_minutes=EXCLUDED.attention_minutes,
    critical_minutes=EXCLUDED.critical_minutes,revision=alert_policies.revision+1,changed_by=EXCLUDED.changed_by,changed_at=now()`,
        [
          req.context!.organization_id,
          input.reminderMinutes,
          input.attentionMinutes,
          input.criticalMinutes,
          req.actor.id,
        ],
      );
      await audit(
        db,
        req.actor.id,
        "ALERT_POLICY_UPDATED",
        req.context!.organization_id,
        req.context,
        input,
      );
    });
    await this.sweep();
    return this.options(req);
  }
  canHandle(req: ActorRequest, a: any) {
    return req.context!.role === "DRIVER"
      ? req.context!.id === a.driver_membership_id &&
          req.actor.id === a.driver_user_id
      : req.context!.role === a.counterpart_role &&
          (req.context!.role !== "SCHOOL" ||
            a.level < 3 ||
            req.context!.coordinator);
  }
  async flags(req: ActorRequest, a: any, db: Tx = this.db.pool) {
    const events = (
      await db.query(
        "SELECT type FROM alert_events WHERE case_id=$1 AND type IN ('CONTACT','VERIFICATION')",
        [a.id],
      )
    ).rows;
    const verified =
      events.some((e) => e.type === "CONTACT") &&
      events.some((e) => e.type === "VERIFICATION");
    const authority =
      a.counterpart_role === "SCHOOL"
        ? req.context!.role === "SCHOOL" && req.context!.coordinator
        : req.context!.role === "DRIVER" &&
          req.context!.id === a.driver_membership_id &&
          req.actor.id === a.driver_user_id;
    const validStages = (
      await db.query(
        `SELECT v.kind FROM movements v JOIN movement_confirmations c ON c.movement_id=v.id
       WHERE v.passenger_id=$1 AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED')
       GROUP BY v.kind HAVING count(DISTINCT c.side)=2`,
        [a.passenger_id],
      )
    ).rows;
    const automatic = [
      "CONFIRMATION_PENDING",
      "ROUTE_END_PENDING",
      "CORRECTION_CONFLICT",
    ].includes(a.kind);
    const requirements = [
      {
        id: "authority",
        label:
          a.counterpart_role === "SCHOOL"
            ? "Coordenação da escola"
            : "Motorista designado",
        met: authority,
      },
      {
        id: "boarding",
        label: "Embarque com duas confirmações vigentes",
        met: validStages.some((v) => v.kind === "BOARDING"),
      },
      {
        id: "alighting",
        label: "Entrega com duas confirmações vigentes",
        met: validStages.some((v) => v.kind === "ALIGHTING"),
      },
      {
        id: "contact",
        label: "Contato realizado registrado",
        met: events.some((e) => e.type === "CONTACT"),
      },
      {
        id: "verification",
        label: "Verificação física registrada",
        met: events.some((e) => e.type === "VERIFICATION"),
      },
    ];
    return {
      requirements,
      resolutionMode: automatic ? "FACTS" : "VERIFIED_FOLLOW_UP",
      canAssume:
        a.status !== "RESOLVED" && !a.assigned_to && this.canHandle(req, a),
      canRecord:
        a.status !== "RESOLVED" &&
        (req.context!.role !== "DRIVER" ||
          (req.context!.id === a.driver_membership_id &&
            req.actor.id === a.driver_user_id)),
      canResolve:
        a.status !== "RESOLVED" &&
        ![
          "CONFIRMATION_PENDING",
          "ROUTE_END_PENDING",
          "CORRECTION_CONFLICT",
        ].includes(a.kind) &&
        authority &&
        validStages.some((v) => v.kind === "BOARDING") &&
        validStages.some((v) => v.kind === "ALIGHTING") &&
        verified,
      resolutionExplanation:
        a.kind === "CORRECTION_CONFLICT"
          ? "A correção é decidida pela coordenação no Histórico. Aprovar mantém a divergência até a contabilização excepcional; rejeitar preserva a confirmação original."
          : a.kind === "ROUTE_END_PENDING"
            ? "A contabilização termina com as quatro confirmações reais ou uma ausência individual verificada, sem movimentação. A conferência da van não substitui esses registros."
            : a.kind === "CONFIRMATION_PENDING"
              ? "A pendência termina somente com as duas confirmações reais da movimentação."
              : "Encerrar o atendimento exige confirmações vigentes de embarque e entrega, contato e verificação física registrados. Na escola, atua a coordenação; em casa, o motorista designado. Para contabilização excepcional, consulte o Histórico.",
    };
  }
  async present(req: ActorRequest, a: any) {
    const records = await confirmations(this.db.pool, a.movement_id),
      sides = new Set(records.map((c) => c.side));
    const missingRoles = [
      !sides.has("DRIVER") ? "DRIVER" : null,
      !sides.has("COUNTERPART") ? a.counterpart_role : null,
    ].filter(Boolean);
    const assigned = a.assigned_to
      ? (
          await this.db.pool.query("SELECT name FROM users WHERE id=$1", [
            a.assigned_to,
          ])
        ).rows[0]?.name
      : null;
    const { creation_hash, recipient_fingerprint, ...visible } = a;
    return {
      ...visible,
      assignedName: assigned,
      missingRoles,
      actions: await this.flags(req, a),
      resolution:
        a.status === "RESOLVED"
          ? ((
              await this.db.pool.query(
                "SELECT id event_id,actor_name,occurred_at FROM alert_events WHERE case_id=$1 AND type='RESOLVED' ORDER BY position DESC LIMIT 1",
                [a.id],
              )
            ).rows[0] ?? null)
          : null,
      receipt:
        a.status === "RESOLVED"
          ? await resolutionReceipt(this.db.pool, a, req, this.clock.now())
          : null,
    };
  }
  async list(req: ActorRequest, closed = false, awaiting = false) {
    const rows = (
      await this.db.pool.query(
        `SELECT a.id ${alertJoin} WHERE ${alertScope} AND (CASE WHEN $5 THEN EXISTS(SELECT 1 FROM alert_resolution_recipients rr JOIN alert_resolution_receipts ar ON ar.event_id=rr.event_id WHERE ar.case_id=a.id AND rr.user_id=$3 AND ${pendingReceipt} AND ${receiptEligible.replace("rm.active", "rm.active AND rm.id=$6")}) AND a.status='RESOLVED' ELSE (a.status='RESOLVED')=$4 END)
    ORDER BY a.level DESC,a.origin_at,a.id LIMIT 100`,
        [...this.params(req), closed, awaiting, req.context!.id],
      )
    ).rows;
    const items = [];
    for (const { id } of rows)
      items.push(await this.present(req, await this.allowed(req, id)));
    const pendingCount = await pendingResolutionCount(
      this.db.pool,
      req.actor.id,
      req.context!.id,
    );
    return {
      items: awaiting ? items.filter((i) => i.receipt?.canAcknowledge) : items,
      pendingCount,
      serverNow: this.clock.now().toISOString(),
    };
  }
  async detail(req: ActorRequest, id: string) {
    const a = await this.allowed(req, id);
    const history = (
      await this.db.pool.query(
        "SELECT * FROM alert_events WHERE case_id=$1 ORDER BY position",
        [id],
      )
    ).rows;
    return {
      alert: await this.present(req, a),
      history,
      journey: await this.notifications.journey(req, a.passenger_id),
    };
  }
  async write(
    req: ActorRequest,
    id: string,
    fn: (db: Tx, a: any) => Promise<any>,
  ) {
    const initial = await this.allowed(req, id);
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        initial.transport_id,
      ]);
      await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
        initial.trip_id,
      ]);
      await db.query("SELECT id FROM alert_cases WHERE id=$1 FOR UPDATE", [id]);
      const m = (
        await db.query(
          "SELECT * FROM memberships WHERE id=$1 AND user_id=$2 AND active FOR UPDATE",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!m) throw new ForbiddenException("Contexto revogado.");
      const currentReq = {
        ...req,
        context: { ...req.context, ...m },
      } as ActorRequest;
      const a = await this.allowed(currentReq, id, db);
      // A permissão de coordenação também é revalidada sob o lock.
      req.context = currentReq.context;
      return fn(db, a);
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
  async acknowledge(req: ActorRequest, id: string, eventId: string) {
    return this.write(req, id, async (db, a) => {
      if (!(await acknowledgeResolution(db, a, req, eventId, this.clock.now())))
        throw new ForbiddenException(
          "Esta ciência não está disponível para seu acesso ou para esta resolução.",
        );
      return { receipt: await resolutionReceipt(db, a, req, this.clock.now()) };
    });
  }
  async action(
    req: ActorRequest,
    id: string,
    input: {
      expectedVersion: number;
      type: "ASSUMED" | "CONTACT" | "VERIFICATION" | "RESOLVED";
      note: string;
    },
  ) {
    return this.write(req, id, async (db, a) => {
      if (a.status === "RESOLVED")
        throw new ConflictException(
          "Atendimento já encerrado; histórico preservado.",
        );
      const flags = await this.flags(req, a, db);
      if (input.type === "ASSUMED" && a.assigned_to === req.actor.id)
        return { ok: true, unchanged: true };
      if (a.version !== input.expectedVersion)
        throw new ConflictException(
          "A ocorrência mudou. Atualize antes de continuar.",
        );
      const permitted =
        input.type === "ASSUMED"
          ? flags.canAssume
          : input.type === "RESOLVED"
            ? flags.canResolve
            : flags.canRecord;
      if (!permitted)
        throw new ForbiddenException(
          input.type === "RESOLVED"
            ? flags.resolutionExplanation
            : "Ação não autorizada para este contexto.",
        );
      const now = this.clock.now();
      if (input.type === "ASSUMED") {
        if (a.assigned_to && a.assigned_to !== req.actor.id)
          throw new ConflictException(
            "Outra pessoa já assumiu este atendimento.",
          );
        await db.query(
          "UPDATE alert_cases SET status='IN_REVIEW',assigned_to=$2,version=version+1 WHERE id=$1",
          [id, req.actor.id],
        );
        if (a.source_issue_id)
          await db.query(
            "UPDATE movement_issues SET status='IN_REVIEW' WHERE id=$1",
            [a.source_issue_id],
          );
      } else if (input.type === "RESOLVED") {
        await db.query(
          `UPDATE alert_cases SET status='RESOLVED',resolved_at=$2,resolved_by=$3,resolution_kind='VERIFIED_FOLLOW_UP',resolution_note=$4,next_due_at=NULL,version=version+1 WHERE id=$1`,
          [id, now, req.actor.id, input.note],
        );
        if (a.source_issue_id)
          await db.query(
            "UPDATE movement_issues SET status='RESOLVED' WHERE id=$1",
            [a.source_issue_id],
          );
      } else
        await db.query("UPDATE alert_cases SET version=version+1 WHERE id=$1", [
          id,
        ]);
      const event = await alertEvent(
        db,
        a,
        input.type,
        now,
        { note: input.note },
        this.actor(req),
      );
      if (input.type === "RESOLVED") await notifyAlert(db, a, event, now, true);
      return { ok: true };
    });
  }
  async report(
    req: ActorRequest,
    input: {
      id: string;
      tripId: string;
      passengerId: string;
      movementKind: "BOARDING" | "ALIGHTING";
      kind: "NOT_LOCATED" | "RECEIPT_DISPUTED";
      note: string;
    },
  ) {
    const trip = await this.trips.detail(req, input.tripId),
      p = trip.passengers.find((p: any) => p.id === input.passengerId);
    if (!p) throw new NotFoundException("Participação não disponível.");
    if (
      req.context!.role === "DRIVER" &&
      trip.driver_membership_id !== req.context!.id
    )
      throw new ForbiddenException(
        "Somente o motorista designado registra risco nesta viagem.",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          actor: req.actor.id,
          context: req.context!.id,
        }),
      )
      .digest("hex");
    return this.db.transaction(async (db) => {
      const transport = (
        await db.query("SELECT transport_id FROM trips WHERE id=$1", [trip.id])
      ).rows[0];
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        transport.transport_id,
      ]);
      await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [trip.id]);
      // Revalida escopo após aguardar o lock, inclusive vínculos revogados.
      const scope = (
        await db.query(
          `SELECT p.id FROM trip_passengers p JOIN trips t ON t.id=p.trip_id JOIN operating_links l ON l.id=p.operating_link_id
    WHERE p.id=$4 AND ${alertScope}`,
          [...this.params(req), p.id],
        )
      ).rows[0];
      const m = (
        await db.query(
          "SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND active",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!scope || !m) throw new ForbiddenException("Vínculo revogado.");
      const currentTrip = (
        await db.query("SELECT * FROM trips WHERE id=$1", [trip.id])
      ).rows[0];
      if (
        ![
          "IN_PROGRESS",
          "ROUTE_ENDED_OPEN",
          "COMPLETED_REVIEW",
          "COMPLETED",
        ].includes(currentTrip.status)
      )
        throw new ConflictException("Relatos de risco exigem viagem aberta.");
      if (
        req.context!.role === "DRIVER" &&
        currentTrip.driver_membership_id !== req.context!.id
      )
        throw new ForbiddenException("Motorista substituído.");
      const old = (
        await db.query("SELECT * FROM alert_cases WHERE id=$1", [input.id])
      ).rows[0];
      if (old) {
        if (old.creation_hash !== hash)
          throw new ConflictException(
            "Identificador já usado em outro relato.",
          );
        return { id: old.id, unchanged: true };
      }
      const counterpart =
        (currentTrip.direction === "OUTBOUND") ===
        (input.movementKind === "BOARDING")
          ? "GUARDIAN"
          : "SCHOOL";
      await db.query(
        `INSERT INTO movements(id,passenger_id,kind,counterpart_role,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(passenger_id,kind) DO NOTHING`,
        [randomUUID(), p.id, input.movementKind, counterpart, this.clock.now()],
      );
      const movement = (
        await db.query(
          "SELECT id FROM movements WHERE passenger_id=$1 AND kind=$2",
          [p.id, input.movementKind],
        )
      ).rows[0];
      const duplicate = (
        await db.query(
          "SELECT id FROM alert_cases WHERE movement_id=$1 AND kind=$2 AND status<>'RESOLVED'",
          [movement.id, input.kind],
        )
      ).rows[0];
      if (duplicate)
        throw new ConflictException(
          "Já existe ocorrência aberta deste tipo para esta movimentação.",
        );
      const now = this.clock.now();
      await invalidateAccounting(db, p.id);
      await db.query(
        "UPDATE trips SET version=version+1,status=CASE WHEN status='COMPLETED' THEN 'COMPLETED_REVIEW' ELSE status END,review_opened_at=CASE WHEN status='COMPLETED' THEN $2 ELSE review_opened_at END WHERE id=$1",
        [trip.id, now],
      );
      await db.query(
        `INSERT INTO alert_cases(id,movement_id,kind,level,origin_at,reported_by,report_note,creation_hash) VALUES($1,$2,$3,3,$4,$5,$6,$7)`,
        [
          input.id,
          movement.id,
          input.kind,
          now,
          req.actor.id,
          input.note,
          hash,
        ],
      );
      const a = await caseRow(db, input.id),
        event = await alertEvent(
          db,
          a,
          "REPORTED",
          now,
          { note: input.note, kind: input.kind },
          this.actor(req),
        );
      await notifyAlert(db, a, event, now);
      return { id: input.id, unchanged: false };
    });
  }
  async sweep() {
    // Reconcilia fontes, incluindo confirmação recebida antes da configuração dos intervalos.
    const rows = (
      await this.db.pool
        .query(`SELECT DISTINCT p.id,p.trip_id,t.transport_id FROM trip_passengers p JOIN trips t ON t.id=p.trip_id
    WHERE p.active AND t.status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED_REVIEW') AND (
    EXISTS(SELECT 1 FROM alert_policies ap WHERE ap.transport_id=t.transport_id) OR
    EXISTS(SELECT 1 FROM movements v JOIN movement_issues i ON i.movement_id=v.id WHERE v.passenger_id=p.id AND i.status<>'RESOLVED') OR
    EXISTS(SELECT 1 FROM alert_cases a JOIN movements v ON v.id=a.movement_id WHERE v.passenger_id=p.id AND a.status<>'RESOLVED')
    ) ORDER BY p.id`)
    ).rows;
    for (const p of rows)
      await this.db.transaction(async (db) => {
        await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          p.transport_id,
        ]);
        await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
          p.trip_id,
        ]);
        await syncPassengerAlerts(db, p.id, this.clock.now());
      });
  }
  async evaluate(id: string) {
    const a = await caseRow(this.db.pool, id);
    if (!a || a.status === "RESOLVED") return;
    await this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        a.transport_id,
      ]);
      await db.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
        a.trip_id,
      ]);
      await syncPassengerAlerts(db, a.passenger_id, this.clock.now());
    });
  }
  async scheduled() {
    return (
      await this.db.pool.query(
        "SELECT id,level,next_due_at FROM alert_cases WHERE status<>'RESOLVED' AND next_due_at IS NOT NULL ORDER BY next_due_at",
      )
    ).rows;
  }
}
