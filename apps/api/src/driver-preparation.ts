import type { Database } from "./db";
/** Read-only preview: projections never materialize plans or confirm family use. */
export async function driverPreparation(
  db: Database,
  transportId: string,
  membershipId: string,
  userId: string,
  date: string,
  today: string,
  direction: string,
  page: number,
) {
  const result = (
    await db.pool.query(
      `WITH source AS (
 SELECT l.id "linkId",s.id "studentId",s.name "studentName",sc.name "schoolName",dp.status "planningStatus",
 pc.id "requestId",pc.requested_usage "requestedUsage",part.trip_id "tripId",part.disposition,
 CASE WHEN part.disposition='NOT_TRANSPORTED' THEN 'NOT_GOING'
 WHEN part.disposition='REVIEW_REQUIRED' THEN 'PENDING'
 WHEN part.disposition='EXPECTED' OR dp.status='CONFIRMED' THEN 'GOING'
 WHEN dp.status='NOT_USING' THEN 'NOT_GOING'
 WHEN dp.status='PENDING' THEN 'PENDING'
 WHEN dp.status='NOT_EXPECTED' THEN CASE WHEN dp.routine_revision IS NULL THEN CASE WHEN r.id IS NULL THEN 'UNCONFIGURED' ELSE 'SNAPSHOT_UNCONFIGURED' END ELSE 'NO_FORECAST' END
 WHEN $4::date<$5::date THEN 'NO_RECORD'
 WHEN r.id IS NULL THEN 'UNCONFIGURED'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.days) wd WHERE (wd->>'weekday')::int=extract(dow FROM $4::date)::int AND (wd->>CASE WHEN $6='OUTBOUND' THEN 'outbound' ELSE 'return' END)::boolean) THEN 'FORECAST'
 ELSE 'NO_FORECAST' END bucket
 FROM operating_links l JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id
 LEFT JOIN daily_plans dp ON dp.operating_link_id=l.id AND dp.service_date=$4::date AND dp.direction=$6
 LEFT JOIN weekly_routines r ON r.operating_link_id=l.id
 LEFT JOIN planning_changes pc ON pc.plan_id=dp.id AND pc.status='PENDING'
 LEFT JOIN LATERAL(SELECT p.trip_id,p.disposition FROM trip_passengers p JOIN trips t ON t.id=p.trip_id WHERE p.operating_link_id=l.id AND p.active AND t.service_date=$4::date AND t.direction=$6 AND t.status<>'CANCELLED' LIMIT 1)part ON true
 WHERE l.transport_id=$1 AND l.status='ACTIVE' AND EXISTS(SELECT 1 FROM memberships m WHERE m.id=$2 AND m.user_id=$3 AND m.active AND m.role='DRIVER' AND m.organization_id=$1)
 ) SELECT count(*)::int total,count(*) FILTER(WHERE bucket='GOING')::int going,count(*) FILTER(WHERE bucket='NOT_GOING')::int "notGoing",
 count(*) FILTER(WHERE bucket NOT IN ('GOING','NOT_GOING'))::int pending,
 count(*) FILTER(WHERE "requestId" IS NOT NULL)::int "awaitingChanges",
 COALESCE((SELECT jsonb_agg(to_jsonb(items)-'position') FROM(SELECT * FROM (SELECT source.*,row_number() OVER(PARTITION BY CASE WHEN bucket IN ('GOING','NOT_GOING') THEN bucket ELSE 'PENDING' END ORDER BY "studentName","studentId","linkId") position FROM source) ranked WHERE position>$7 AND position<=$7+20 ORDER BY "studentName","studentId","linkId")items),'[]'::jsonb) items FROM source`,
      [transportId, membershipId, userId, date, today, direction, page * 20],
    )
  ).rows[0];
  return {
    ...result,
    direction,
    page,
    hasMore:
      (page + 1) * 20 < Math.max(result.going, result.notGoing, result.pending),
  };
}
