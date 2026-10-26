import { randomUUID } from "node:crypto";
import { Database, audit } from "./db";
import { hashPassword } from "./security";
import { seedRegistry } from "./seed-registry";
import { seedPlanning } from "./seed-planning";
export const demoPassword = "Caminho@2026!";
export async function seed(db: Database) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Dados de demonstração não podem ser criados em produção.");
  const hash = await hashPassword(demoPassword);
  await db.transaction(async (tx) => {
    const school = "10000000-0000-4000-8000-000000000001";
    const transport = "10000000-0000-4000-8000-000000000002";
    const family = "10000000-0000-4000-8000-000000000003";
    const other = "10000000-0000-4000-8000-000000000004";
    for (const [id, name, kind] of [
      [school, "Escola Horizonte", "SCHOOL"],
      [transport, "Transporte Boa Viagem", "TRANSPORT"],
      [family, "Contexto familiar de Ana", "FAMILY"],
      [other, "Escola Ipê", "SCHOOL"],
    ]) {
      await tx.query(
        "INSERT INTO organizations(id,name,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, name, kind],
      );
    }
    const entries = [
      {
        email: "escola@demo.local",
        name: "Marina Costa",
        org: school,
        role: "SCHOOL",
        manager: true,
        coordinator: true,
      },
      {
        email: "operacao@demo.local",
        name: "Pedro Lima",
        org: school,
        role: "SCHOOL",
        manager: false,
        coordinator: false,
      },
      {
        email: "motorista@demo.local",
        name: "Carlos Souza",
        org: transport,
        role: "DRIVER",
        manager: false,
        coordinator: false,
      },
      {
        email: "responsavel@demo.local",
        name: "Ana Menezes",
        org: family,
        role: "GUARDIAN",
        manager: false,
        coordinator: false,
      },
      {
        email: "outraescola@demo.local",
        name: "Joana Alves",
        org: other,
        role: "SCHOOL",
        manager: true,
        coordinator: true,
      },
    ];
    for (const item of entries) {
      const user = await tx.query(
        "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id",
        [randomUUID(), item.name, item.email, hash],
      );
      if (!user.rows[0]) continue;
      const membership = await tx.query(
        "INSERT INTO memberships(id,user_id,organization_id,role,coordinator,manage_team) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          user.rows[0].id,
          item.org,
          item.role,
          item.coordinator,
          item.manager,
        ],
      );
      await audit(
        tx,
        user.rows[0].id,
        "DEMO_ACCOUNT_CREATED",
        user.rows[0].id,
        membership.rows[0],
      );
    }
    const guardian = await tx.query(
      "SELECT id FROM users WHERE email='responsavel@demo.local'",
    );
    const extra = await tx.query(
      "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'SCHOOL') ON CONFLICT DO NOTHING RETURNING *",
      [randomUUID(), guardian.rows[0].id, school],
    );
    if (extra.rows[0])
      await audit(
        tx,
        guardian.rows[0].id,
        "DEMO_CONTEXT_CREATED",
        extra.rows[0].id,
        extra.rows[0],
      );
  });
  await seedRegistry(db);
  await seedPlanning(db);
}
if (require.main === module) {
  const db = new Database();
  seed(db)
    .then(() => console.log("Contas demo criadas. Senha: " + demoPassword))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.onApplicationShutdown());
}
