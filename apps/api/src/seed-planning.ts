import { randomUUID } from "node:crypto";
import { Database, audit } from "./db";
export async function seedPlanning(db: Database) {
  await db.transaction(async (tx) => {
    const transport = "10000000-0000-4000-8000-000000000002";
    const driver = (
      await tx.query(
        "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='motorista@demo.local' AND m.organization_id=$1 AND m.role='DRIVER'",
        [transport],
      )
    ).rows[0];
    const policy = await tx.query(
      "INSERT INTO planning_policies(transport_id,cutoff_time,timezone,demo,changed_by) VALUES($1,'18:00','America/Sao_Paulo',true,$2) ON CONFLICT DO NOTHING RETURNING transport_id",
      [transport, driver.user_id],
    );
    if (policy.rows[0])
      await audit(
        tx,
        driver.user_id,
        "PLANNING_POLICY_UPDATED",
        transport,
        driver,
        { demo: true, cutoffTime: "18:00", timezone: "America/Sao_Paulo" },
      );
    const guardian = (
      await tx.query(
        "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='responsavel@demo.local' AND m.role='GUARDIAN' AND m.active=true",
      )
    ).rows[0];
    const link = (
      await tx.query(
        "SELECT l.id FROM operating_links l JOIN guardian_links g ON g.student_id=l.student_id WHERE l.student_id='20000000-0000-4000-8000-000000000001' AND l.transport_id=$1 AND l.status='ACTIVE' AND g.user_id=$2 AND g.status='ACTIVE'",
        [transport, guardian?.user_id || null],
      )
    ).rows[0];
    if (!link || !guardian) return;
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      outbound: weekday >= 1 && weekday <= 5,
      return: weekday >= 1 && weekday <= 5,
    }));
    const id = randomUUID();
    const routine = await tx.query(
      "INSERT INTO weekly_routines(id,operating_link_id,revision,days,changed_by) VALUES($1,$2,1,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [id, link.id, JSON.stringify(days), guardian.user_id],
    );
    if (routine.rows[0])
      await audit(
        tx,
        guardian.user_id,
        "WEEKLY_ROUTINE_UPDATED",
        id,
        guardian,
        { demo: true, linkId: link.id, days },
      );
  });
}
