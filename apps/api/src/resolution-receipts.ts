import type { Tx } from "./alerts-domain";
import type { ActorRequest } from "./auth";
import { audit } from "./db";

// Only memberships captured at resolution can satisfy this receipt. A later
// replacement never inherits another person's request for acknowledgement.
export const receiptEligible = `EXISTS(SELECT 1 FROM memberships rm WHERE rm.active AND rm.user_id=rr.user_id
 AND rr.memberships @> jsonb_build_array(jsonb_build_object('id',rm.id::text)) AND (
 (rm.role='DRIVER' AND rm.id=t.driver_membership_id AND rm.user_id=t.driver_user_id) OR
 (rm.role='SCHOOL' AND rm.organization_id=p.school_id AND rm.coordinator) OR
 (rm.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links rg WHERE rg.student_id=p.student_id AND rg.user_id=rm.user_id AND rg.status='ACTIVE'))))`;
export const receiptJoin = `FROM alert_resolution_recipients rr JOIN alert_resolution_receipts ar ON ar.event_id=rr.event_id
 JOIN alert_cases a ON a.id=ar.case_id JOIN movements v ON v.id=a.movement_id JOIN trip_passengers p ON p.id=v.passenger_id
 JOIN trips t ON t.id=p.trip_id JOIN operating_links l ON l.id=p.operating_link_id`;
export const pendingReceipt = `rr.acknowledged_at IS NULL AND rr.revoked_at IS NULL AND p.active AND l.status='ACTIVE' AND ${receiptEligible}`;
export async function createResolutionReceipts(
  db: Tx,
  a: any,
  eventId: string,
  now: Date,
) {
  const critical =
    a.level === 3 ||
    (
      await db.query(
        "SELECT 1 FROM alert_events WHERE case_id=$1 AND type='LEVEL_REACHED' AND (details->>'level')::int=3 LIMIT 1",
        [a.id],
      )
    ).rows.length > 0;
  if (!critical) return null;
  const recipients = (
    await db.query(
      `SELECT m.*,u.name FROM memberships m JOIN users u ON u.id=m.user_id
 JOIN trip_passengers p ON p.id=$1 JOIN operating_links l ON l.id=p.operating_link_id
 WHERE m.active AND p.active AND l.status='ACTIVE' AND (
 (m.id=$2 AND m.user_id=$3 AND m.role='DRIVER') OR (m.role='SCHOOL' AND m.organization_id=p.school_id AND m.coordinator) OR
 (m.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=m.user_id AND g.status='ACTIVE'))) ORDER BY m.id`,
      [a.passenger_id, a.driver_membership_id, a.driver_user_id],
    )
  ).rows;
  const missing = ["DRIVER", "GUARDIAN", "SCHOOL"].filter(
    (role) => !recipients.some((m) => m.role === role),
  );
  const inserted = await db.query(
    "INSERT INTO alert_resolution_receipts(event_id,case_id,created_at,missing_roles) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
    [eventId, a.id, now, JSON.stringify(missing)],
  );
  if (!inserted.rows.length) return recipients;
  const event = (
    await db.query(
      "SELECT actor_id,membership_id FROM alert_events WHERE id=$1",
      [eventId],
    )
  ).rows[0];
  for (const userId of new Set(recipients.map((m) => m.user_id))) {
    const memberships = recipients.filter((m) => m.user_id === userId);
    const author = event.actor_id === userId;
    await db.query(
      "INSERT INTO alert_resolution_recipients(event_id,user_id,name,memberships,acknowledged_at,acknowledged_membership_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        eventId,
        userId,
        memberships[0].name,
        JSON.stringify(memberships.map((m) => ({ id: m.id, role: m.role }))),
        author ? now : null,
        author ? event.membership_id : null,
      ],
    );
  }
  return recipients;
}
export async function resolutionReceipt(
  db: Tx,
  a: any,
  req: ActorRequest,
  now: Date,
) {
  const header = (
    await db.query(
      "SELECT * FROM alert_resolution_receipts WHERE case_id=$1 ORDER BY created_at DESC,event_id DESC LIMIT 1",
      [a.id],
    )
  ).rows[0];
  if (!header) return null;
  await db.query(
    `UPDATE alert_resolution_recipients SET revoked_at=$2 WHERE event_id=$1 AND acknowledged_at IS NULL AND revoked_at IS NULL AND user_id IN
 (SELECT rr.user_id ${receiptJoin} WHERE rr.event_id=$1 AND (NOT p.active OR l.status<>'ACTIVE' OR NOT ${receiptEligible}))`,
    [header.event_id, now],
  );
  const recipients = (
    await db.query(
      "SELECT user_id,name,memberships,acknowledged_at,acknowledged_membership_id,revoked_at FROM alert_resolution_recipients WHERE event_id=$1 ORDER BY name,user_id",
      [header.event_id],
    )
  ).rows;
  const me = recipients.find((r) => r.user_id === req.actor.id);
  const contextEligible =
    (
      await db.query(
        `SELECT rr.user_id ${receiptJoin} WHERE rr.event_id=$1 AND rr.user_id=$2 AND ${receiptEligible.replace("rm.active", "rm.active AND rm.id=$3")}`,
        [header.event_id, req.actor.id, req.context!.id],
      )
    ).rows.length > 0;
  return {
    eventId: header.event_id,
    missingRoles: header.missing_roles,
    recipients: recipients.map((r) => ({
      name: r.name,
      roles: [...new Set(r.memberships.map((m: any) => m.role))],
      acknowledgedAt: r.acknowledged_at,
      revokedAt: r.revoked_at,
      isMe: r.user_id === req.actor.id,
    })),
    pendingCount: recipients.filter((r) => !r.acknowledged_at && !r.revoked_at)
      .length,
    canAcknowledge:
      contextEligible &&
      !!me &&
      !me.acknowledged_at &&
      !me.revoked_at &&
      me.memberships.some((m: any) => m.id === req.context!.id),
  };
}
export async function acknowledgeResolution(
  db: Tx,
  a: any,
  req: ActorRequest,
  eventId: string,
  now: Date,
) {
  const latest = (
    await db.query(
      "SELECT id FROM alert_events WHERE case_id=$1 AND type='RESOLVED' ORDER BY position DESC LIMIT 1",
      [a.id],
    )
  ).rows[0];
  if (a.status !== "RESOLVED" || latest?.id !== eventId) return false;
  await resolutionReceipt(db, a, req, now);
  const valid = (
    await db.query(
      `SELECT rr.user_id ${receiptJoin} WHERE rr.event_id=$1 AND rr.user_id=$2 AND rr.revoked_at IS NULL AND p.active AND l.status='ACTIVE' AND ${receiptEligible.replace("rm.active", "rm.active AND rm.id=$4")}
 AND rr.memberships @> $3::jsonb`,
      [
        eventId,
        req.actor.id,
        JSON.stringify([{ id: req.context!.id }]),
        req.context!.id,
      ],
    )
  ).rows.length;
  if (!valid) return false;
  const changed = await db.query(
    "UPDATE alert_resolution_recipients SET acknowledged_at=$3,acknowledged_membership_id=$4 WHERE event_id=$1 AND user_id=$2 AND acknowledged_at IS NULL RETURNING user_id",
    [eventId, req.actor.id, now, req.context!.id],
  );
  if (changed.rows.length)
    await audit(
      db,
      req.actor.id,
      "ALERT_RESOLUTION_ACKNOWLEDGED",
      a.id,
      req.context!,
      { eventId },
    );
  return true;
}

export async function pendingResolutionCount(
  db: Tx,
  userId: string,
  membershipId: string,
) {
  return Number(
    (
      await db.query(
        `SELECT count(DISTINCT ar.event_id) count ${receiptJoin} WHERE rr.user_id=$1 AND ${pendingReceipt} AND ${receiptEligible.replace("rm.active", "rm.active AND rm.id=$2")}`,
        [userId, membershipId],
      )
    ).rows[0].count,
  );
}
