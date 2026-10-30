import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { ActorRequest } from "./auth";
import { Database, audit } from "./db";
import { PlanningService } from "./planning.service";
import { PlanningClock, localDate } from "./planning-clock";
import { recordNotificationEvent } from "./notification-events";
import { syncPassengerAlerts } from "./alerts-domain";
import { currentException, invalidateAccounting } from "./history-domain";
import { tripSummary } from "./trip-summary";
type Tx = Pick<PoolClient, "query">;
export type MovementKind = "BOARDING" | "ALIGHTING";
export function counterpart(direction: string, kind: MovementKind) {
  return (direction === "OUTBOUND") === (kind === "BOARDING")
    ? "GUARDIAN"
    : "SCHOOL";
}
const roleLabels: Record<string, string> = {
  DRIVER: "Motorista",
  GUARDIAN: "Responsável",
  SCHOOL: "Escola",
};
@Injectable()
export class MovementsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningService) private planning: PlanningService,
    @Inject(PlanningClock) private clock: PlanningClock,
  ) {}
  blockReason(
    req: ActorRequest,
    t: any,
    p: any,
    kind: MovementKind,
    confirmations: any[],
  ) {
    const role = req.context!.role,
      required = counterpart(t.direction, kind);
    if (role !== "DRIVER" && role !== required)
      return `Esta confirmação exige ${roleLabels[required].toLowerCase()} ou motorista.`;
    if (
      role === "DRIVER" &&
      (t.driver_user_id !== req.actor.id ||
        t.driver_membership_id !== req.context!.id)
    )
      return "Somente o motorista atualmente designado confirma pela operação.";
    const side = role === "DRIVER" ? "DRIVER" : "COUNTERPART";
    if (
      confirmations.some((c) => c.actor_id === req.actor.id && c.side !== side)
    )
      return "A mesma pessoa não pode confirmar os dois lados da movimentação.";
    if (confirmations.some((c) => c.side === side))
      return "Este lado já foi confirmado. Não é necessário confirmar novamente.";
    if (p.exceptionalResolution)
      return "Contabilização excepcional vigente. Consulte o Histórico; não há confirmação automática em nome de outra parte.";
    if (p.correctedMovementKinds?.includes(kind))
      return "Há correção aprovada nesta etapa. A coordenação deve verificar a contabilização excepcional no Histórico.";
    if (
      !["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
        t.status,
      )
    )
      return t.status === "PLANNED"
        ? "Aguarde o motorista iniciar a viagem."
        : "Esta viagem não recebe novas confirmações.";
    if (t.service_date > localDate(this.clock.now(), t.timezone))
      return "A data da viagem ainda não chegou.";
    if (!p.active || p.link_status !== "ACTIVE")
      return "Vínculo ou participação inativa; histórico preservado.";
    if (p.disposition !== "EXPECTED")
      return "O transporte precisa revisar a destinação antes de registrar movimentações.";
    return null;
  }
  // Recebe apenas participações já filtradas pelo acesso de TripsService.detail.
  async summaries(
    req: ActorRequest,
    t: any,
    passengers: any[],
    db: Tx = this.db.pool,
  ) {
    const ids = passengers.map((p) => p.id);
    if (!ids.length) return [];
    const movements = (
      await db.query(
        "SELECT * FROM movements WHERE passenger_id=ANY($1::uuid[])",
        [ids],
      )
    ).rows;
    const confirmations = (
      await db.query(
        `SELECT c.* FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=ANY($1::uuid[]) ORDER BY c.received_at,c.id`,
        [ids],
      )
    ).rows;
    const issues = (
      await db.query(
        "SELECT i.*,m.passenger_id FROM movement_issues i JOIN movements m ON m.id=i.movement_id WHERE m.passenger_id=ANY($1::uuid[]) ORDER BY i.detected_at,i.id",
        [ids],
      )
    ).rows;
    const corrections = (
      await db.query(
        `SELECT r.confirmation_id,r.status,m.kind,m.passenger_id FROM confirmation_corrections r JOIN movement_confirmations c ON c.id=r.confirmation_id JOIN movements m ON m.id=c.movement_id WHERE r.passenger_id=ANY($1::uuid[]) AND r.status<>'REJECTED'`,
        [ids],
      )
    ).rows;
    const exceptional = (
      await db.query(
        `SELECT e.* FROM exceptional_resolutions e JOIN trip_passengers p ON p.id=e.passenger_id WHERE e.passenger_id=ANY($1::uuid[]) AND e.safety_revision=p.safety_revision`,
        [ids],
      )
    ).rows;
    const alerts = (
      await db.query(
        `SELECT a.*,v.passenger_id FROM alert_cases a JOIN movements v ON v.id=a.movement_id
      WHERE v.passenger_id=ANY($1::uuid[]) AND a.status<>'RESOLVED' ORDER BY a.level DESC,a.origin_at`,
        [ids],
      )
    ).rows;
    return passengers.map((p) => {
      const resolution = exceptional.find((e) => e.passenger_id === p.id);
      p = {
        ...p,
        exceptionalResolution: resolution
          ? {
              id: resolution.id,
              actorName: resolution.actor_name,
              at: resolution.created_at,
              outcome: resolution.outcome,
              recipientName: resolution.recipient_name,
            }
          : null,
        correctedMovementKinds: corrections
          .filter((r) => r.passenger_id === p.id && r.status === "APPROVED")
          .map((r) => r.kind),
      };
      const events = (["BOARDING", "ALIGHTING"] as const).map((kind) => {
        const m = movements.find(
          (m) => m.passenger_id === p.id && m.kind === kind,
        );
        const records = confirmations.filter((c) => c.movement_id === m?.id);
        const valid = records.filter(
          (c) =>
            !corrections.some(
              (r) => r.confirmation_id === c.id && r.status === "APPROVED",
            ),
        );
        const required = counterpart(t.direction, kind),
          missing = ["DRIVER", "COUNTERPART"].filter(
            (side) => !valid.some((c) => c.side === side),
          );
        const blocked = this.blockReason(req, t, p, kind, records);
        return {
          id: m?.id || null,
          kind,
          counterpartRole: required,
          location: required === "SCHOOL" ? "Escola" : "Casa",
          state:
            valid.length === 2
              ? "VALIDATED"
              : valid.length
                ? "INFORMED"
                : "AWAITING",
          firstAt: records[0]?.received_at || null,
          validatedAt: valid.length === 2 ? valid[1].received_at : null,
          confirmations: records.map((c) => ({
            id: c.id,
            side: c.side,
            actorId: c.actor_id,
            actorName: c.actor_name,
            role: c.role,
            organizationName: c.organization_name,
            membershipId: c.membership_id,
            assignmentId: c.assignment_id,
            receivedAt: c.received_at,
            correctionStatus:
              corrections.find((r) => r.confirmation_id === c.id)?.status ||
              null,
          })),
          missingRoles: missing.map((side) =>
            side === "DRIVER" ? "DRIVER" : required,
          ),
          canConfirm: !blocked,
          blockedReason: blocked,
        };
      });
      const ownIssues = issues
        .filter((i) => i.passenger_id === p.id)
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          status: i.status,
          detectedAt: i.detected_at,
          details: i.details,
        }));
      const state = resolution
        ? "EXCEPTIONALLY_ACCOUNTED"
        : p.disposition === "NOT_TRANSPORTED"
          ? "NOT_TRANSPORTED"
          : events[1].state === "VALIDATED"
            ? "DELIVERED"
            : events[1].state === "INFORMED"
              ? "ALIGHTING_INFORMED"
              : events[0].state === "VALIDATED"
                ? "BOARDING_VALIDATED"
                : events[0].state === "INFORMED"
                  ? "BOARDING_INFORMED"
                  : "AWAITING_BOARDING";
      const ownAlerts = alerts
        .filter((a) => a.passenger_id === p.id)
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          level: a.level,
          status: a.status,
        }));
      const deliveryUnderReview = ownAlerts.some((a) =>
        ["NOT_LOCATED", "RECEIPT_DISPUTED", "CORRECTION_CONFLICT"].includes(
          a.kind,
        ),
      );
      return {
        ...p,
        movementState: state,
        possiblyOnboard: Boolean(
          (!resolution &&
            (p.boarding_informed_at || p.alighting_informed_at) &&
            events[1].state !== "VALIDATED") ||
          deliveryUnderReview,
        ),
        deliveryUnderReview,
        alerts: ownAlerts,
        canReportRisk:
          [
            "IN_PROGRESS",
            "ROUTE_ENDED_OPEN",
            "COMPLETED_REVIEW",
            "COMPLETED",
          ].includes(t.status) &&
          p.active &&
          p.link_status === "ACTIVE" &&
          (req.context!.role !== "DRIVER" ||
            (t.driver_user_id === req.actor.id &&
              t.driver_membership_id === req.context!.id)),
        movements: events,
        issues: ownIssues,
      };
    });
  }
  async confirm(
    req: ActorRequest,
    tripId: string,
    passengerId: string,
    kind: MovementKind,
  ) {
    const candidate = (
      await this.db.pool.query(
        "SELECT t.transport_id,p.plan_id FROM trip_passengers p JOIN trips t ON t.id=p.trip_id WHERE p.id=$1 AND t.id=$2",
        [passengerId, tripId],
      )
    ).rows[0];
    if (!candidate)
      throw new NotFoundException("Participação não disponível nesta viagem.");
    // Autoriza antes de bloquear a operação e valida novamente dentro da transação.
    await this.planning.plan(req, candidate.plan_id, this.db.pool);
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        candidate.transport_id,
      ]);
      const t = (
        await db.query(
          "SELECT *,service_date::text service_date FROM trips WHERE id=$1 FOR UPDATE",
          [tripId],
        )
      ).rows[0];
      await this.planning.plan(req, candidate.plan_id, db, true);
      const membership = (
        await db.query(
          "SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND active FOR UPDATE",
          [req.context!.id, req.actor.id],
        )
      ).rows[0];
      if (!membership)
        throw new ForbiddenException(
          "O contexto foi revogado. Entre novamente.",
        );
      if (req.context!.role === "GUARDIAN") {
        const guardian = (
          await db.query(
            "SELECT g.id FROM guardian_links g JOIN trip_passengers p ON p.student_id=g.student_id WHERE p.id=$1 AND g.user_id=$2 AND g.status='ACTIVE' FOR UPDATE OF g",
            [passengerId, req.actor.id],
          )
        ).rows[0];
        if (!guardian)
          throw new NotFoundException("Vínculo familiar não disponível.");
      }
      const p = (
        await db.query(
          "SELECT p.*,l.status link_status FROM trip_passengers p JOIN operating_links l ON l.id=p.operating_link_id WHERE p.id=$1 AND p.trip_id=$2 FOR UPDATE OF p",
          [passengerId, tripId],
        )
      ).rows[0];
      if (!p)
        throw new NotFoundException(
          "Participação não disponível nesta viagem.",
        );
      const existingMovement = (
        await db.query(
          "SELECT * FROM movements WHERE passenger_id=$1 AND kind=$2",
          [passengerId, kind],
        )
      ).rows[0];
      const records = existingMovement
        ? (
            await db.query(
              "SELECT * FROM movement_confirmations WHERE movement_id=$1 ORDER BY received_at,id",
              [existingMovement.id],
            )
          ).rows
        : [];
      const approved = (
        await db.query(
          `SELECT c.id FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id JOIN confirmation_corrections r ON r.confirmation_id=c.id AND r.status='APPROVED' WHERE m.passenger_id=$1`,
          [passengerId],
        )
      ).rows;
      p.correctedMovementKinds = approved.length
        ? (
            await db.query(
              `SELECT DISTINCT m.kind FROM movements m JOIN movement_confirmations c ON c.movement_id=m.id JOIN confirmation_corrections r ON r.confirmation_id=c.id AND r.status='APPROVED' WHERE m.passenger_id=$1`,
              [passengerId],
            )
          ).rows.map((m) => m.kind)
        : [];
      p.exceptionalResolution = await currentException(db, passengerId);
      const required = counterpart(t.direction, kind),
        role = req.context!.role;
      if (role !== "DRIVER" && role !== required)
        throw new ForbiddenException(
          `Esta ação exige ${roleLabels[required].toLowerCase()} ou motorista.`,
        );
      if (
        role === "DRIVER" &&
        (t.driver_user_id !== req.actor.id ||
          t.driver_membership_id !== req.context!.id)
      )
        throw new ForbiddenException(
          "Somente o motorista atualmente designado confirma pela operação.",
        );
      const side = role === "DRIVER" ? "DRIVER" : "COUNTERPART";
      if (records.some((c) => c.actor_id === req.actor.id && c.side !== side))
        throw new ForbiddenException(
          "A mesma pessoa não pode confirmar os dois lados da movimentação.",
        );
      if (records.some((c) => c.actor_id === req.actor.id && c.side === side))
        return this.confirmationResponse(
          req,
          t,
          passengerId,
          existingMovement.id,
          kind,
          true,
          db,
        );
      const blocked = this.blockReason(req, t, p, kind, records);
      if (blocked) throw new ConflictException(blocked);
      const now = this.clock.now(),
        movementId = existingMovement?.id || randomUUID();
      if (!existingMovement)
        await db.query(
          "INSERT INTO movements(id,passenger_id,kind,counterpart_role,created_at) VALUES($1,$2,$3,$4,$5)",
          [movementId, passengerId, kind, required, now],
        );
      const assignment = (
        await db.query(
          "SELECT id FROM trip_assignments WHERE trip_id=$1 AND id=$2 AND driver_membership_id=$3 AND vehicle_id=$4",
          [
            tripId,
            t.current_assignment_id,
            t.driver_membership_id,
            t.vehicle_id,
          ],
        )
      ).rows[0];
      if (!assignment)
        throw new ConflictException(
          "A viagem precisa de uma atribuição de motorista e veículo.",
        );
      const id = randomUUID();
      await db.query(
        "INSERT INTO movement_confirmations(id,movement_id,side,actor_id,actor_name,membership_id,role,organization_id,organization_name,assignment_id,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          id,
          movementId,
          side,
          req.actor.id,
          req.actor.name,
          req.context!.id,
          role,
          req.context!.organization_id,
          req.context!.organization_name,
          assignment.id,
          now,
        ],
      );
      const current = (
        await db.query(
          "SELECT * FROM movement_confirmations WHERE movement_id=$1 ORDER BY received_at,id",
          [movementId],
        )
      ).rows;
      const first = current[0].received_at,
        validated = current.length === 2 ? current[1].received_at : null;
      if (kind === "BOARDING")
        await db.query(
          "UPDATE trip_passengers SET boarding_informed_at=$2,boarding_validated_at=$3 WHERE id=$1",
          [passengerId, first, validated],
        );
      else {
        await db.query(
          "UPDATE trip_passengers SET alighting_informed_at=$2,delivery_validated_at=$3 WHERE id=$1",
          [passengerId, first, validated],
        );
        const boarding = (
          await db.query(
            "SELECT c.id FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=$1 AND m.kind='BOARDING' AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED')",
            [passengerId],
          )
        ).rows;
        if (boarding.length < 2) {
          const issueId = randomUUID();
          const issue = await db.query(
            "INSERT INTO movement_issues(id,movement_id,kind,detected_by,detected_at,details) VALUES($1,$2,'SEQUENCE_INCOMPLETE',$3,$4,$5) ON CONFLICT(movement_id,kind) DO NOTHING RETURNING id",
            [
              issueId,
              movementId,
              req.actor.id,
              now,
              JSON.stringify({
                boardingConfirmationsAtDetection: boarding.length,
                reason: boarding.length
                  ? "BOARDING_NOT_VALIDATED"
                  : "ALIGHTING_WITHOUT_BOARDING",
              }),
            ],
          );
          if (issue.rows.length) {
            await recordNotificationEvent(db, {
              confirmationId: id,
              movementId,
              passengerId,
              kind: "SEQUENCE_INCOMPLETE",
              state: current.length === 2 ? "VALIDATED" : "INFORMED",
              actorName: req.actor.name,
              actorRole: role,
              occurredAt: now,
            });
            await audit(
              db,
              req.actor.id,
              "MOVEMENT_SEQUENCE_ISSUE_OPENED",
              issueId,
              req.context,
              {
                tripId,
                passengerId,
                movementId,
                boardingConfirmations: boarding.length,
              },
            );
          }
        }
      }
      await invalidateAccounting(db, passengerId);
      await db.query("UPDATE trips SET version=version+1 WHERE id=$1", [
        tripId,
      ]);
      await recordNotificationEvent(db, {
        confirmationId: id,
        movementId,
        passengerId,
        kind: "MOVEMENT_CONFIRMED",
        state: current.length === 2 ? "VALIDATED" : "INFORMED",
        actorName: req.actor.name,
        actorRole: role,
        occurredAt: now,
      });
      await audit(db, req.actor.id, "MOVEMENT_CONFIRMED", id, req.context, {
        tripId,
        passengerId,
        studentId: p.student_id,
        movementId,
        kind,
        side,
        role,
        state: current.length === 2 ? "VALIDATED" : "INFORMED",
        assignmentId: assignment.id,
      });
      await syncPassengerAlerts(db, passengerId, now, {
        id,
        actor_id: req.actor.id,
        actor_name: req.actor.name,
        role,
        membership_id: req.context!.id,
      });
      return this.confirmationResponse(
        req,
        t,
        passengerId,
        movementId,
        kind,
        false,
        db,
      );
    });
  }
  private async confirmationResponse(
    req: ActorRequest,
    t: any,
    passengerId: string,
    movementId: string,
    kind: MovementKind,
    unchanged: boolean,
    db: Tx,
  ) {
    // Relê após as alterações sob o mesmo lock/COMMIT, inclusive no replay.
    const p = (
      await db.query(
        "SELECT p.*,l.status link_status FROM trip_passengers p JOIN operating_links l ON l.id=p.operating_link_id WHERE p.id=$1 AND p.trip_id=$2",
        [passengerId, t.id],
      )
    ).rows[0];
    const currentTrip = (
      await db.query(
        "SELECT *,service_date::text service_date FROM trips WHERE id=$1",
        [t.id],
      )
    ).rows[0];
    const visible = (
      await db.query(
        `SELECT p.*,l.status link_status,dp.routine_revision FROM trip_passengers p JOIN daily_plans dp ON dp.id=p.plan_id
      JOIN operating_links l ON l.id=p.operating_link_id WHERE p.trip_id=$1 AND
      ($2='DRIVER' OR (l.status='ACTIVE' AND (($2='SCHOOL' AND p.school_id=$3) OR
      ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=$4 AND g.status='ACTIVE')))))
      ORDER BY p.student_name,p.id`,
        [t.id, req.context!.role, req.context!.organization_id, req.actor.id],
      )
    ).rows;
    const passengers = await this.summaries(req, currentTrip, visible, db);
    const passenger = passengers.find((item) => item.id === p.id)!;
    return {
      id: movementId,
      state: passenger.movements.find((m: { kind: string }) => m.kind === kind)!
        .state,
      unchanged,
      passenger,
      tripVersion: currentTrip.version,
      tripSummary: await tripSummary(db, req, currentTrip, passengers),
    };
  }
}
