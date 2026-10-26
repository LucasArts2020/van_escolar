import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ActorRequest } from "./auth";
import { Database } from "./db";
import { PlanningService, RoutineDay, accessSql } from "./planning.service";
import { PlanningClock, addDays, localDate } from "./planning-clock";
import { TripsService } from "./trips.service";
import { alertJoin, alertScope } from "./alerts-domain";

const fallbackTimezone = "America/Sao_Paulo";
type PlanningSummary = {
  source: "PERSISTED" | "ROUTINE" | "UNAVAILABLE";
  status:
    | "CONFIRMED"
    | "AWAITING_RESPONSE"
    | "ROUTINE_EXPECTED"
    | "NOT_USING"
    | "NOT_EXPECTED"
    | "MISSING_CONFIGURATION"
    | "NO_HISTORICAL_PLAN";
  scheduled: boolean | null;
  planId: string | null;
  version: number | null;
  deadlineAt: string | null;
  missingConfiguration: ("POLICY" | "ROUTINE")[];
  pendingChange: {
    id: string;
    requestedUsage: boolean;
    reason: string;
    requestedAt: string;
  } | null;
};

@Injectable()
export class SchoolDayService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningService) private planning: PlanningService,
    @Inject(PlanningClock) private clock: PlanningClock,
    @Inject(TripsService) private trips: TripsService,
  ) {}

  async day(req: ActorRequest, requestedDate?: string) {
    if (req.context!.role !== "SCHOOL")
      throw new ForbiddenException(
        "Selecione o contexto da escola para abrir sua central.",
      );
    const now = this.clock.now();
    const today = localDate(now, fallbackTimezone);
    const date = requestedDate || today;

    // Reuse the existing scoped movement summaries and their current permission checks.
    // The final link read also removes forecast rows revoked while the trip read was in flight.
    const { trips } = await this.trips.list(req, date);
    const snapshots = (
      await this.db.pool.query(
        `SELECT l.id operating_link_id,l.student_id,l.school_id,l.transport_id,
          s.name student_name,sc.name school_name,t.name transport_name,d.direction,
          pp.timezone policy_timezone,pp.revision current_policy_revision,
          r.revision current_routine_revision,r.days routine_days,
          p.id plan_id,p.status plan_status,p.scheduled,p.version plan_version,
          p.routine_revision,p.timezone plan_timezone,p.deadline_at,
          pc.id change_id,pc.requested_usage,pc.reason change_reason,pc.requested_at
        FROM operating_links l
        JOIN students s ON s.id=l.student_id
        JOIN organizations sc ON sc.id=l.school_id
        JOIN organizations t ON t.id=l.transport_id
        CROSS JOIN (VALUES ('OUTBOUND'),('RETURN')) d(direction)
        LEFT JOIN planning_policies pp ON pp.transport_id=l.transport_id
        LEFT JOIN weekly_routines r ON r.operating_link_id=l.id
        LEFT JOIN daily_plans p ON p.operating_link_id=l.id AND p.service_date=$4 AND p.direction=d.direction
        LEFT JOIN planning_changes pc ON pc.plan_id=p.id AND pc.status='PENDING'
        WHERE ${accessSql}
          AND EXISTS(SELECT 1 FROM memberships m WHERE m.id=$5 AND m.active AND m.user_id=$3 AND m.organization_id=$1 AND m.role='SCHOOL')
        ORDER BY s.name,l.id,d.direction`,
        [...this.planning.params(req), date, req.context!.id],
      )
    ).rows;

    const planIds = new Set(snapshots.map((p) => p.plan_id).filter(Boolean));
    // Do not leak a revoked link through the already loaded trip DTO, including its counters.
    const authorizedTrips = trips
      .map((t) => ({
        ...t,
        passengers: t.passengers.filter((p: { plan_id: string }) =>
          planIds.has(p.plan_id),
        ),
      }))
      .filter((t) => t.passengers.length > 0);
    // Trip list is already scoped; if access changed during these reads, remove the affected
    // trip rather than returning counters or closure facts computed for the previous scope.
    const safeTrips = authorizedTrips.filter((t) => {
      const original = trips.find((candidate) => candidate.id === t.id)!;
      return original.passengers.length === t.passengers.length;
    });
    const currentParticipants = new Map<
      string,
      { tripId: string; passengerId: string }
    >();
    for (const trip of safeTrips) {
      if (trip.status === "CANCELLED") continue;
      for (const passenger of trip.passengers) {
        if (passenger.active)
          currentParticipants.set(passenger.plan_id, {
            tripId: trip.id,
            passengerId: passenger.id,
          });
      }
    }

    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const rows = snapshots.map((p) => {
      const rowToday = localDate(
        now,
        p.plan_timezone || p.policy_timezone || fallbackTimezone,
      );
      let planning: PlanningSummary;
      if (p.plan_id) {
        const status =
          p.plan_status === "PENDING"
            ? "AWAITING_RESPONSE"
            : p.plan_status === "NOT_EXPECTED" && !p.routine_revision
              ? "MISSING_CONFIGURATION"
              : p.plan_status;
        planning = {
          source: "PERSISTED",
          status,
          scheduled: p.scheduled,
          planId: p.plan_id,
          version: p.plan_version,
          deadlineAt: p.deadline_at,
          missingConfiguration: !p.routine_revision ? ["ROUTINE"] : [],
          pendingChange: p.change_id
            ? {
                id: p.change_id,
                requestedUsage: p.requested_usage,
                reason: p.change_reason,
                requestedAt: p.requested_at,
              }
            : null,
        };
      } else {
        const missing: PlanningSummary["missingConfiguration"] = [];
        if (!p.current_policy_revision) missing.push("POLICY");
        // Today's routine can describe a future estimate, never a historical fact.
        const day = (p.routine_days as RoutineDay[] | null)?.find(
          (d) => d.weekday === weekday,
        );
        if (!p.current_routine_revision || !day) missing.push("ROUTINE");
        const scheduled = day
          ? Boolean(day[p.direction === "OUTBOUND" ? "outbound" : "return"])
          : null;
        const isPast = date < rowToday;
        planning = {
          source: isPast || missing.length ? "UNAVAILABLE" : "ROUTINE",
          status: isPast
            ? "NO_HISTORICAL_PLAN"
            : missing.length
              ? "MISSING_CONFIGURATION"
              : scheduled
                ? "ROUTINE_EXPECTED"
                : "NOT_EXPECTED",
          scheduled: isPast ? null : scheduled,
          planId: null,
          version: null,
          deadlineAt: null,
          missingConfiguration: isPast ? [] : missing,
          pendingChange: null,
        };
      }
      const participant = currentParticipants.get(p.plan_id);
      return {
        id: `${p.operating_link_id}:${date}:${p.direction}`,
        operating_link_id: p.operating_link_id,
        student_id: p.student_id,
        student_name: p.student_name,
        school_id: p.school_id,
        school_name: p.school_name,
        transport_id: p.transport_id,
        transport_name: p.transport_name,
        direction: p.direction,
        today: rowToday,
        planning,
        trip_id: participant?.tripId || null,
        passenger_id: participant?.passengerId || null,
      };
    });
    // One batched preview across all dates. Window counts cover the complete authorized
    // set before LIMIT, without loading the detailed journey or event history per case.
    const attentionRows = (
      await this.db.pool.query(
        `SELECT a.id,a.kind,a.level,a.status,t.service_date::text date,
          p.student_name "studentName",p.student_id "studentId",t.id "tripId",p.id "passengerId",
          (count(*) OVER())::int "openCount",
          (count(*) FILTER(WHERE a.level=3) OVER())::int "criticalCount",
          (count(*) FILTER(WHERE t.service_date<>$4::date) OVER())::int "otherDatesCount"
        ${alertJoin}
        WHERE ${alertScope} AND a.status<>'RESOLVED'
          AND EXISTS(SELECT 1 FROM memberships m WHERE m.id=$5 AND m.active AND m.user_id=$3 AND m.organization_id=$1 AND m.role='SCHOOL')
        ORDER BY a.level DESC,a.origin_at,a.id LIMIT 5`,
        [...this.planning.params(req), date, req.context!.id],
      )
    ).rows;
    const attention = {
      openCount: attentionRows[0]?.openCount || 0,
      criticalCount: attentionRows[0]?.criticalCount || 0,
      otherDatesCount: attentionRows[0]?.otherDatesCount || 0,
      items: attentionRows.map(
        ({ openCount, criticalCount, otherDatesCount, ...item }) => item,
      ),
    };
    return {
      date,
      serverNow: now.toISOString(),
      today,
      tomorrow: addDays(today, 1),
      rows,
      trips: safeTrips,
      attention,
    };
  }
}
