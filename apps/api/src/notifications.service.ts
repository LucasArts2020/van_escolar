import { pendingResolutionCount } from "./resolution-receipts";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { TripsService } from "./trips.service";
import { PlanningClock, localDate } from "./planning-clock";
import {
  currentNotification,
  notificationAccess,
  notificationJoin,
  notificationSelect,
  notificationText,
} from "./notification-events";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TripsService) private trips: TripsService,
    @Inject(PlanningClock) private clock: PlanningClock,
  ) {}

  async owned(req: ActorRequest, id: string) {
    const n = await currentNotification(this.db.pool, id);
    if (
      !n?.authorized ||
      n.membership_id !== req.context!.id ||
      n.user_id !== req.actor.id
    )
      throw new NotFoundException("Notificação não disponível neste contexto.");
    return n;
  }
  async presentation(n: any, knownDeliveries?: any[]) {
    const deliveries =
      knownDeliveries ||
      (
        await this.db.pool.query(
          `SELECT id,status,attempts,receipt_attempts,accepted_at,finished_at,error_code
      FROM notification_deliveries WHERE notification_id=$1 ORDER BY id`,
          [n.id],
        )
      ).rows;
    return {
      id: n.id,
      ...notificationText(n),
      createdAt: n.occurred_at,
      readAt: n.read_at,
      purpose: n.purpose,
      pending: n.pending,
      studentName: n.student_name,
      timezone: n.timezone,
      target: {
        tripId: n.trip_id,
        passengerId: n.passenger_id,
        movementId: n.movement_id,
        kind: n.movement_kind,
        date: n.service_date,
        direction: n.direction,
        alertId: n.alert_id || null,
      },
      pushNote: deliveries.length ? "DEVICES" : n.push_note || "WAITING",
      deliveries,
    };
  }
  async list(req: ActorRequest, before?: string) {
    const ids = (
      await this.db.pool.query(
        `${notificationSelect}
      WHERE n.membership_id=$1 AND n.user_id=$2 AND ${notificationAccess}
      AND ($3::timestamptz IS NULL OR n.created_at<$3::timestamptz)
      ORDER BY n.created_at DESC,n.id DESC LIMIT 51`,
        [req.context!.id, req.actor.id, before || null],
      )
    ).rows;
    const visible = ids.slice(0, 50);
    const deliveries = (
      await this.db.pool.query(
        `SELECT id,notification_id,status,attempts,receipt_attempts,accepted_at,finished_at,error_code
      FROM notification_deliveries WHERE notification_id=ANY($1::uuid[]) ORDER BY id`,
        [visible.map((n) => n.id)],
      )
    ).rows;
    const items = await Promise.all(
      visible.map((n) =>
        this.presentation(
          n,
          deliveries.filter((d) => d.notification_id === n.id),
        ),
      ),
    );
    const unread = (
      await this.db.pool.query(
        `SELECT count(*)::int count ${notificationJoin}
      WHERE n.membership_id=$1 AND n.user_id=$2 AND n.read_at IS NULL AND ${notificationAccess}`,
        [req.context!.id, req.actor.id],
      )
    ).rows[0].count;
    return { items, unread, hasMore: ids.length > 50 };
  }
  async detail(req: ActorRequest, id: string) {
    const n = await this.owned(req, id);
    const journey = await this.journey(req, n.passenger_id);
    const deliveries = (
      await this.db.pool.query(
        `SELECT a.delivery_id,a.phase,a.attempt,a.status,a.error_code,a.created_at
      FROM notification_attempts a JOIN notification_deliveries d ON d.id=a.delivery_id WHERE d.notification_id=$1
      ORDER BY a.created_at,a.id`,
        [id],
      )
    ).rows;
    return {
      notification: await this.presentation(n),
      ...journey,
      attempts: deliveries,
    };
  }
  async journey(req: ActorRequest, passengerId: string) {
    const candidate = (
      await this.db.pool.query(
        "SELECT trip_id FROM trip_passengers WHERE id=$1",
        [passengerId],
      )
    ).rows[0];
    if (!candidate) throw new NotFoundException("Participação não disponível.");
    const trip = await this.trips.detail(req, candidate.trip_id);
    const passenger = trip.passengers.find((p: any) => p.id === passengerId);
    if (!passenger) throw new NotFoundException("Participação não disponível.");
    const records = (
      await this.db.pool.query(
        `SELECT c.*,c.role actor_role,v.kind movement_kind,v.id movement_id,p.student_name,
        (SELECT r.status FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status<>'REJECTED' LIMIT 1) correction_status
      FROM movement_confirmations c JOIN movements v ON v.id=c.movement_id
      JOIN trip_passengers p ON p.id=v.passenger_id WHERE p.id=$1 ORDER BY c.received_at,c.id`,
        [passengerId],
      )
    ).rows;
    const seen = new Set<string>();
    const timeline = records.map((c: any) => {
      const state = seen.has(c.movement_id) ? "VALIDATED" : "INFORMED";
      seen.add(c.movement_id);
      const stage = c.movement_kind === "BOARDING" ? "embarque" : "desembarque";
      const invalidated = records.some(
        (r: any) =>
          r.movement_id === c.movement_id && r.correction_status === "APPROVED",
      );
      const text =
        c.correction_status === "APPROVED"
          ? {
              title: "Confirmação invalidada por correção",
              body: `${c.actor_name} registrou o ${stage}. A coordenação aprovou a correção; este registro histórico não conta como confirmação vigente. Consulte o Histórico.`,
            }
          : c.correction_status === "PENDING"
            ? {
                title: "Confirmação em análise",
                body: `${c.actor_name} registrou o ${stage} e solicitou correção. A coordenação ainda precisa decidir; consulte o Histórico.`,
              }
            : invalidated
              ? {
                  title: `Registro de ${stage}`,
                  body: `${c.actor_name} registrou o ${stage}. A outra confirmação foi invalidada por correção; a etapa não está validada pelas duas partes.`,
                }
              : notificationText({
                  ...c,
                  event_kind: "MOVEMENT_CONFIRMED",
                  event_state: state,
                });
      return {
        id: c.id,
        ...text,
        at: c.received_at,
      };
    });
    for (const issue of passenger.issues)
      timeline.push({
        id: issue.id,
        title: "Sequência incompleta",
        body:
          "Desembarque registrado sem embarque validado. Ocorrência: " +
          (issue.status === "OPEN" ? "aberta" : issue.status),
        at: issue.detectedAt,
      });
    timeline.sort(
      (a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    return { trip: { ...trip, passengers: [passenger] }, passenger, timeline };
  }
  async read(req: ActorRequest, id: string) {
    await this.owned(req, id);
    await this.db.transaction(async (db) => {
      const updated = await db.query(
        "UPDATE notifications SET read_at=now() WHERE id=$1 AND read_at IS NULL RETURNING id",
        [id],
      );
      if (updated.rows.length)
        await audit(db, req.actor.id, "NOTIFICATION_READ", id, req.context);
    });
    return { ok: true };
  }
  async home(req: ActorRequest, page = 0) {
    if (req.context!.role !== "GUARDIAN")
      throw new ForbiddenException("Este início é do responsável.");
    const students = (
      await this.db.pool.query(
        `SELECT DISTINCT s.id,s.name FROM students s
      JOIN guardian_links g ON g.student_id=s.id AND g.user_id=$1 AND g.status='ACTIVE'
      WHERE EXISTS(SELECT 1 FROM operating_links l WHERE l.student_id=s.id AND l.status='ACTIVE') ORDER BY s.name,s.id`,
        [req.actor.id],
      )
    ).rows;
    const children = [];
    for (const student of students) {
      const candidates = (
        await this.db.pool.query(
          `SELECT t.id,t.timezone,t.service_date::text service_date FROM trips t
        JOIN trip_passengers p ON p.trip_id=t.id JOIN operating_links l ON l.id=p.operating_link_id
        WHERE p.student_id=$1 AND p.active AND l.status='ACTIVE' AND t.status<>'CANCELLED'
          AND t.service_date<=($2::timestamptz AT TIME ZONE t.timezone)::date
        ORDER BY t.service_date DESC,CASE WHEN t.status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED_REVIEW') THEN 0 ELSE 1 END,
        t.started_at DESC NULLS LAST,t.created_at DESC,t.id LIMIT 1`,
          [student.id, this.clock.now()],
        )
      ).rows;
      const latest = candidates.find(
        (t: any) => t.service_date <= localDate(this.clock.now(), t.timezone),
      );
      let current = null;
      if (latest) {
        const trip = await this.trips.detail(req, latest.id);
        const p = trip.passengers.find(
          (p: any) => p.student_id === student.id,
        )!;
        current = {
          tripId: trip.id,
          passengerId: p.id,
          date: trip.service_date,
          direction: trip.direction,
          state: p.movementState,
          possiblyOnboard: p.possiblyOnboard,
          openIssues:
            p.issues.filter((i: any) => i.status !== "RESOLVED").length +
            p.alerts.filter((a: any) => a.kind !== "SEQUENCE_INCOMPLETE")
              .length,
          deliveryUnderReview: p.deliveryUnderReview,
          movements: p.movements,
          tripStatus: trip.status,
        };
      }
      children.push({ ...student, current });
    }
    // Current journey and unresolved journeys are independent. Historical validation dates
    // cannot prove a confirmation is still valid after an approved correction.
    const pendingJourneys = (
      await this.db.pool.query(
        `WITH scoped AS (
      SELECT t.id "tripId",p.id "passengerId",p.student_id "studentId",p.student_name "studentName",
        t.service_date::text date,t.direction,t.status,
        COALESCE((SELECT max(a.level) FROM alert_cases a JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=p.id AND a.status<>'RESOLVED'),0) level
      FROM trips t JOIN trip_passengers p ON p.trip_id=t.id JOIN operating_links l ON l.id=p.operating_link_id
      WHERE p.active AND l.status='ACTIVE'
        AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=$1 AND g.status='ACTIVE')
        AND t.service_date<=($2::timestamptz AT TIME ZONE t.timezone)::date
        AND (t.status='COMPLETED_REVIEW'
          OR EXISTS(SELECT 1 FROM alert_cases a JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=p.id AND a.status<>'RESOLVED')
          OR (t.status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN') AND
            (SELECT count(*) FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id
             WHERE m.passenger_id=p.id AND m.kind='ALIGHTING' AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED'))<2
            AND p.disposition<>'NOT_TRANSPORTED'
            AND NOT EXISTS(SELECT 1 FROM exceptional_resolutions e WHERE e.passenger_id=p.id AND e.safety_revision=p.safety_revision))))
      SELECT (SELECT count(*)::int FROM scoped) total,
        COALESCE((SELECT jsonb_agg(to_jsonb(items)) FROM (SELECT * FROM scoped ORDER BY level DESC,date,"tripId","passengerId" LIMIT 20 OFFSET $3) items),'[]'::jsonb) items`,
        [req.actor.id, this.clock.now(), page * 20],
      )
    ).rows[0];
    return {
      children,
      pendingAcknowledgements: await pendingResolutionCount(
        this.db.pool,
        req.actor.id,
        req.context!.id,
      ),
      pendingJourneys: {
        ...pendingJourneys,
        page,
        hasMore: (page + 1) * 20 < pendingJourneys.total,
      },
    };
  }
  async registerDevice(
    req: ActorRequest,
    input: { installationId: string; token: string },
  ) {
    return this.db.transaction(async (db) => {
      // Uma instalação pertence à sessão que a registrou por último. Trocas de conta não herdam envios antigos.
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.actor.id,
      ]);
      const collision = (
        await db.query(
          "SELECT installation_id FROM push_devices WHERE token=$1",
          [input.token],
        )
      ).rows[0];
      if (collision && collision.installation_id !== input.installationId)
        throw new ForbiddenException(
          "Token já associado a outra instalação. Recrie o registro neste aparelho.",
        );
      await db.query(
        `INSERT INTO push_devices(id,user_id,session_hash,installation_id,token) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(installation_id) DO UPDATE SET user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,
        registered_at=CASE WHEN push_devices.user_id<>EXCLUDED.user_id OR push_devices.session_hash<>EXCLUDED.session_hash
          OR push_devices.token<>EXCLUDED.token OR NOT push_devices.active THEN clock_timestamp() ELSE push_devices.registered_at END,
        token=EXCLUDED.token,active=true`,
        [
          randomUUID(),
          req.actor.id,
          req.tokenHash,
          input.installationId,
          input.token,
        ],
      );
      return { ok: true };
    });
  }
  async removeDevice(req: ActorRequest, installationId: string) {
    await this.db.pool.query(
      "UPDATE push_devices SET active=false WHERE installation_id=$1 AND user_id=$2 AND session_hash=$3",
      [installationId, req.actor.id, req.tokenHash],
    );
    return { ok: true };
  }
}
