import { driverPreparation } from "./driver-preparation";
import { pendingResolutionCount } from "./resolution-receipts";
import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { z } from "zod";
import { ActorRequest, AuthGuard, ContextGuard, parse } from "./auth";
import { Database } from "./db";
import { PlanningClock, addDays, localDate } from "./planning-clock";
import { alertJoin, alertScope } from "./alerts-domain";

@Controller("driver")
@UseGuards(AuthGuard, ContextGuard)
export class DriverDayController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlanningClock) private clock: PlanningClock,
  ) {}

  @Get("day")
  async day(@Req() req: ActorRequest, @Query() query: unknown) {
    if (req.context!.role !== "DRIVER")
      throw new ForbiddenException("Selecione o contexto do motorista.");
    const q = parse(
      z
        .object({
          date: z.iso.date().optional(),
          preparationDirection: z
            .enum(["OUTBOUND", "RETURN"])
            .default("OUTBOUND"),
          preparationPage: z.coerce.number().int().min(0).max(10000).default(0),
          page: z.coerce.number().int().min(0).max(10000).default(0),
          openPage: z.coerce.number().int().min(0).max(10000).default(0),
          attentionPage: z.coerce.number().int().min(0).max(10000).default(0),
        })
        .strict(),
      query,
    );
    const c = req.context!,
      now = this.clock.now();
    const timezone =
      (
        await this.db.pool.query(
          "SELECT timezone FROM planning_policies WHERE transport_id=$1",
          [c.organization_id],
        )
      ).rows[0]?.timezone || "America/Sao_Paulo";
    const today = localDate(now, timezone),
      date = q.date || today;
    const membership = `EXISTS(SELECT 1 FROM memberships mm WHERE mm.id=$2 AND mm.user_id=$3 AND mm.active AND mm.role='DRIVER' AND mm.organization_id=$1)`;
    const cards = async (otherDates: boolean, page: number) => {
      const result = (
        await this.db.pool.query(
          `WITH scoped AS (
        SELECT t.id,t.service_date::text service_date,t.direction,t.status,t.version,t.driver_membership_id,
          t.driver_name,t.vehicle_name,t.vehicle_plate,t.driver_membership_id=$2 mine,
          (SELECT count(*)::int FROM trip_passengers p WHERE p.trip_id=t.id AND p.active) total,
          (SELECT count(*)::int FROM trip_passengers p WHERE p.trip_id=t.id AND p.active AND p.disposition='REVIEW_REQUIRED') review
        FROM trips t WHERE t.transport_id=$1 AND ${membership} AND ${
          otherDates
            ? "t.service_date<>$4::date AND t.driver_membership_id=$2 AND t.status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED_REVIEW')"
            : "t.service_date=$4::date"
        })
        SELECT (SELECT count(*)::int FROM scoped) total,
          COALESCE((SELECT jsonb_agg(to_jsonb(items)) FROM (SELECT * FROM scoped ORDER BY mine DESC,
            CASE WHEN status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED_REVIEW') THEN 0 ELSE 1 END,
            service_date,direction,id LIMIT 20 OFFSET $5) items),'[]'::jsonb) items`,
          [c.organization_id, c.id, req.actor.id, date, page * 20],
        )
      ).rows[0];
      return { ...result, page, hasMore: (page + 1) * 20 < result.total };
    };
    const trips = await cards(false, q.page),
      openTrips = await cards(true, q.openPage);
    const attention = (
      await this.db.pool.query(
        `WITH scoped AS (
      SELECT a.id,a.kind,a.level,a.status,t.service_date::text date,p.student_name "studentName",p.student_id "studentId",
        t.id "tripId",p.id "passengerId",a.origin_at
      ${alertJoin} WHERE ${alertScope} AND a.status<>'RESOLVED'
        AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.id=$5 AND mm.user_id=$3 AND mm.active AND mm.organization_id=$1 AND mm.role='DRIVER'))
      SELECT (SELECT count(*)::int FROM scoped) total,
        (SELECT count(*)::int FROM scoped WHERE level=3) "criticalCount",
        (SELECT count(*)::int FROM scoped WHERE date<>$4) "otherDatesCount",
        COALESCE((SELECT jsonb_agg(to_jsonb(items)-'origin_at') FROM (SELECT * FROM scoped ORDER BY level DESC,origin_at,id LIMIT 20 OFFSET $6) items),'[]'::jsonb) items`,
        [
          c.organization_id,
          c.role,
          req.actor.id,
          date,
          c.id,
          q.attentionPage * 20,
        ],
      )
    ).rows[0];
    return {
      date,
      today,
      tomorrow: addDays(today, 1),
      serverNow: now.toISOString(),
      pendingAcknowledgements: await pendingResolutionCount(
        this.db.pool,
        req.actor.id,
        req.context!.id,
      ),
      preparation: await driverPreparation(
        this.db,
        c.organization_id,
        c.id,
        req.actor.id,
        date,
        today,
        q.preparationDirection,
        q.preparationPage,
      ),
      trips,
      openTrips,
      attention: {
        ...attention,
        page: q.attentionPage,
        hasMore: (q.attentionPage + 1) * 20 < attention.total,
      },
    };
  }
}
