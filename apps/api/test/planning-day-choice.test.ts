import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app";
import { Database } from "../src/db";
import { PlanningClock, localDate, addDays } from "../src/planning-clock";
import { configure } from "../src/bootstrap";
import { seed, demoPassword } from "../src/seed";
let app: INestApplication,
  pg: PGlite,
  linkId = "",
  now = new Date("2026-10-22T15:00:00Z");
const users: Record<string, { token: string; context: string }> = {};
const date = "2026-10-23";
const routineDays = () =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    outbound: weekday >= 1 && weekday <= 5,
    return: weekday >= 1 && weekday <= 5,
  }));
function api(
  who: string,
  method: "get" | "put" | "post" | "patch",
  path: string,
  body?: unknown,
) {
  const u = users[who];
  const r = request(app.getHttpServer())
    [method]("/planning/" + path)
    .auth(u.token, { type: "bearer" })
    .set("X-Context-Id", u.context);
  return body ? r.send(body) : r;
}
async function board() {
  return (await api("responsavel", "get", "day?date=" + date).expect(200)).body;
}
before(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(join(__dirname, "../src/schema.sql"), "utf8"));
  app = await NestFactory.create(AppModule, { logger: false });
  const db = app.get(Database);
  await db.pool.end();
  db.pool = {
    query: (sql: string, v?: unknown[]) => pg.query(sql, v),
    end: async () => {},
  } as unknown as Database["pool"];
  db.transaction = (async (fn: (tx: unknown) => Promise<unknown>) =>
    pg.transaction((tx) =>
      fn({ query: (sql: string, v?: unknown[]) => tx.query(sql, v) }),
    )) as Database["transaction"];
  app.get(PlanningClock).now = () => new Date(now);
  await seed(db);
  configure(app);
  await app.init();
  for (const who of ["escola", "motorista", "responsavel", "outraescola"]) {
    const r = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Client", "mobile")
      .send({ email: who + "@demo.local", password: demoPassword })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .auth(r.body.token, { type: "bearer" })
      .expect(200);
    const ctx =
      who === "responsavel"
        ? me.body.contexts.find((c: any) => c.role === "GUARDIAN")
        : me.body.contexts[0];
    users[who] = { token: r.body.token, context: ctx.id };
  }
  linkId = (await api("responsavel", "get", "options").expect(200)).body
    .links[0].id;
});
after(async () => {
  await app?.close();
  await pg?.close();
});
async function choose(outbound: boolean, returning: boolean, extra: any = {}) {
  const b = await board();
  return api("responsavel", "post", "day/respond", {
    choices: b.plans.map((p: any) => ({
      id: p.id,
      expectedVersion: p.version,
      use: p.direction === "OUTBOUND" ? outbound : returning,
    })),
    ...extra,
  });
}
test("uma confirmação salva ida e volta e replay não duplica alterações", async () => {
  await api("responsavel", "post", "generate", { date, linkId }).expect(201);
  const body = {
    choices: (await board()).plans.map((p: any) => ({
      id: p.id,
      expectedVersion: p.version,
      use: true,
    })),
  };
  await api("responsavel", "post", "day/respond", body).expect(201);
  const saved = await board();
  assert(saved.plans.every((p: any) => p.status === "CONFIRMED"));
  await api("responsavel", "post", "day/respond", body).expect(201);
  assert.deepEqual(
    (await board()).plans.map((p: any) => p.version),
    saved.plans.map((p: any) => p.version),
  );
});
test("só ida e só volta continuam independentes", async () => {
  await choose(true, false).then((r) => assert.equal(r.status, 201));
  let b = await board();
  assert.equal(
    b.plans.find((p: any) => p.direction === "OUTBOUND").status,
    "CONFIRMED",
  );
  assert.equal(
    b.plans.find((p: any) => p.direction === "RETURN").status,
    "NOT_USING",
  );
  await choose(false, true).then((r) => assert.equal(r.status, 201));
  b = await board();
  assert.equal(
    b.plans.find((p: any) => p.direction === "OUTBOUND").status,
    "NOT_USING",
  );
  assert.equal(
    b.plans.find((p: any) => p.direction === "RETURN").status,
    "CONFIRMED",
  );
});
test("conflito no segundo trecho desfaz a primeira alteração", async () => {
  const before = await board(),
    ordered = [...before.plans].sort((a: any, b: any) =>
      a.id.localeCompare(b.id),
    );
  await api("responsavel", "post", "day/respond", {
    choices: ordered.map((p: any, i: number) => ({
      id: p.id,
      use: p.status !== "CONFIRMED",
      expectedVersion: i === 1 ? p.version + 99 : p.version,
    })),
  }).expect(409);
  const after = await board();
  assert.deepEqual(
    after.plans.map((p: any) => [p.id, p.status, p.version]),
    before.plans.map((p: any) => [p.id, p.status, p.version]),
  );
});
test("limite exige motivo e mantém a situação vigente até aceite", async () => {
  now = new Date("2026-10-23T15:00:00Z");
  await choose(true, false).then((r) => assert.equal(r.status, 400));
  const r = await choose(true, false, {
    reason: "Mudança de necessidade familiar para esta data.",
  });
  assert.equal(r.status, 201);
  assert(r.body.awaitingAcceptance);
  const b = await board();
  assert.equal(
    b.plans.find((p: any) => p.direction === "OUTBOUND").status,
    "NOT_USING",
  );
  assert(b.plans.every((p: any) => p.request_id));
});
test("perfil errado e IDs duplicados são rejeitados, bloqueio impede escrita parcial", async () => {
  const b = await board(),
    choices = b.plans.map((p: any) => ({
      id: p.id,
      use: true,
      expectedVersion: p.version,
    }));
  await api("motorista", "post", "day/respond", { choices }).expect(403);
  await api("responsavel", "post", "day/respond", {
    choices: [choices[0], choices[0]],
  }).expect(400);
  const ordered = [...b.plans].sort((a: any, b: any) =>
    a.id.localeCompare(b.id),
  );
  await pg.query("UPDATE daily_plans SET locked_at=now() WHERE id=$1", [
    ordered[1].id,
  ]);
  await api("responsavel", "post", "day/respond", {
    choices,
    reason: "Teste de bloqueio operacional com motivo.",
  }).expect(409);
  assert.equal(
    (await board()).plans.find((p: any) => p.id === ordered[0].id).version,
    ordered[0].version,
  );
});
test("datas diferentes e vínculo revogado não podem ser confirmados juntos", async () => {
  now = new Date("2026-10-22T15:00:00Z");
  await api("responsavel", "post", "generate", {
    date: "2026-10-24",
    linkId,
  }).expect(201);
  const a = (await board()).plans[0],
    b = (await api("responsavel", "get", "day?date=2026-10-24").expect(200))
      .body.plans[1];
  await api("responsavel", "post", "day/respond", {
    choices: [a, b].map((p) => ({
      id: p.id,
      use: true,
      expectedVersion: p.version,
    })),
  }).expect(400);
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [a.student_id],
  );
  await api("responsavel", "post", "day/respond", {
    choices: [{ id: b.id, use: true, expectedVersion: b.version }],
  }).expect(404);
});
