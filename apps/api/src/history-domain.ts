import type { Tx } from "./alerts-domain";
export const historyScope = `(($2='DRIVER' AND t.transport_id=$1) OR (l.status='ACTIVE' AND (($2='SCHOOL' AND p.school_id=$1) OR
 ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=$3 AND g.status='ACTIVE')))))`;
export const historyJoin = `FROM trip_passengers p JOIN trips t ON t.id=p.trip_id JOIN operating_links l ON l.id=p.operating_link_id`;
export async function currentException(db: Tx, passengerId: string) {
  return (
    await db.query(
      `SELECT e.* FROM exceptional_resolutions e JOIN trip_passengers p ON p.id=e.passenger_id
  WHERE p.id=$1 AND e.safety_revision=p.safety_revision`,
      [passengerId],
    )
  ).rows[0];
}
export async function invalidateAccounting(db: Tx, passengerId: string) {
  await db.query(
    "UPDATE trip_passengers SET safety_revision=safety_revision+1 WHERE id=$1",
    [passengerId],
  );
}
