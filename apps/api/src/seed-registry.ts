import { randomUUID } from "node:crypto";
import { Database, audit } from "./db";
export async function seedRegistry(db: Database) {
  await db.transaction(async (tx) => {
    const school = "10000000-0000-4000-8000-000000000001",
      transport = "10000000-0000-4000-8000-000000000002",
      other = "10000000-0000-4000-8000-000000000004";
    const actor = (
      await tx.query(
        "SELECT m.*,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='escola@demo.local' AND m.organization_id=$1",
        [school],
      )
    ).rows[0];
    const driver = (
      await tx.query(
        "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='motorista@demo.local' AND m.organization_id=$1",
        [transport],
      )
    ).rows[0];
    const guardian = (
      await tx.query(
        "SELECT id FROM users WHERE email='responsavel@demo.local'",
      )
    ).rows[0];
    const otherActor = (
      await tx.query(
        "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='outraescola@demo.local'",
        [],
      )
    ).rows[0];
    const sofia = "20000000-0000-4000-8000-000000000001",
      lucas = "20000000-0000-4000-8000-000000000002";
    for (const [id, name, normalized, birth, owner, author] of [
      [sofia, "Sofia Menezes", "sofia menezes", "2018-03-14", school, actor],
      [
        lucas,
        "Lucas Ferreira",
        "lucas ferreira",
        "2017-07-09",
        transport,
        driver,
      ],
      [
        "20000000-0000-4000-8000-000000000003",
        "Sofia Menezes",
        "sofia menezes",
        "2019-09-04",
        other,
        otherActor,
      ],
    ] as const) {
      const r = await tx.query(
        "INSERT INTO students(id,name,normalized_name,birth_date,owner_organization_id,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [id, name, normalized, birth, owner, author.user_id],
      );
      if (r.rows[0])
        await audit(tx, author.user_id, "STUDENT_CREATED", id, author, {
          demo: true,
        });
    }
    for (const [student, status, initiator, author] of [
      [sofia, "ACTIVE", school, actor],
      [lucas, "PENDING", transport, driver],
    ] as const) {
      const id = randomUUID();
      const r = await tx.query(
        "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT DO NOTHING RETURNING id",
        [id, student, school, transport, initiator, status, author.user_id],
      );
      if (r.rows[0])
        await audit(
          tx,
          author.user_id,
          "OPERATING_LINK_" + status,
          id,
          author,
          { demo: true },
        );
    }
    const guardianLink = await tx.query(
      "INSERT INTO guardian_links(id,student_id,email,user_id,status,created_by,verified_by,verification_note,verified_at) VALUES($1,$2,'responsavel@demo.local',$3,'ACTIVE',$4,$4,'Demonstração local: vínculo familiar fictício pré-configurado',now()) ON CONFLICT DO NOTHING RETURNING id",
      [randomUUID(), sofia, guardian.id, actor.user_id],
    );
    if (guardianLink.rows[0])
      await audit(
        tx,
        actor.user_id,
        "GUARDIAN_VERIFIED",
        guardianLink.rows[0].id,
        actor,
        { demo: true },
      );
    const vehicle = await tx.query(
      "INSERT INTO vehicles(id,organization_id,name,plate,capacity,created_by) VALUES($1,$2,'Van 01','ABC1D23',15,$3) ON CONFLICT DO NOTHING RETURNING id",
      [randomUUID(), transport, driver.user_id],
    );
    if (vehicle.rows[0])
      await audit(
        tx,
        driver.user_id,
        "VEHICLE_CREATED",
        vehicle.rows[0].id,
        driver,
        { demo: true },
      );
  });
}
