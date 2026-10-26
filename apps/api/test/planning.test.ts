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
test("datas usam o fuso da operação, mesmo quando o dia UTC já mudou", () => {
  assert.equal(
    localDate(new Date("2026-10-23T01:30:00Z"), "America/Sao_Paulo"),
    "2026-10-22",
  );
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("somente responsável verificado edita rotina e IDs de outra escola não liberam acesso", async () => {
  await api("escola", "put", "routines/" + linkId, {
    expectedRevision: 1,
    days: routineDays(),
  }).expect(403);
  await api("outraescola", "get", "routines/" + linkId).expect(404);
  await api("outraescola", "post", "generate", { date, linkId }).expect(404);
  const r = await api("responsavel", "get", "routines/" + linkId).expect(200);
  assert.equal(r.body.days.length, 7);
  await api("responsavel", "put", "routines/" + linkId, {
    expectedRevision: r.body.revision,
    days: routineDays().slice(0, 6),
  }).expect(400);
  await api("responsavel", "put", "routines/" + linkId, {
    expectedRevision: r.body.revision,
    days: routineDays(),
  }).expect(200);
  await api("responsavel", "put", "routines/" + linkId, {
    expectedRevision: r.body.revision,
    days: routineDays(),
  }).expect(409);
});
test("geração é idempotente inclusive em reenvios concorrentes, com prazo convertido para UTC", async () => {
  const responses = await Promise.all([
    api("responsavel", "post", "generate", { date, linkId }),
    api("motorista", "post", "generate", { date, linkId }),
  ]);
  assert.ok(responses.every((r) => r.status === 201));
  assert.equal(
    responses.reduce((n, r) => n + r.body.created, 0),
    2,
  );
  const b = await board();
  assert.equal(b.plans.length, 2);
  assert.equal(b.counts.pending, 2);
  assert.ok(
    b.plans.every(
      (p: any) =>
        p.scheduled &&
        p.status === "PENDING" &&
        p.deadline_at === "2026-10-22T21:00:00.000Z",
    ),
  );
  const log = await pg.query<{ n: number }>(
    "SELECT count(*)::int n FROM audit_events WHERE action='DAILY_PLAN_GENERATED'",
  );
  assert.equal(log.rows[0].n, 2);
});
test("sem limite configurado, o vínculo não recebe prazos ou previsões inventados", async () => {
  const policy = (await pg.query<any>("SELECT * FROM planning_policies"))
    .rows[0];
  await pg.query("DELETE FROM planning_policies WHERE transport_id=$1", [
    policy.transport_id,
  ]);
  const r = await api("responsavel", "post", "generate", {
    date: "2026-10-24",
    linkId,
  }).expect(201);
  assert.equal(r.body.created, 0);
  assert.deepEqual(r.body.skipped, [linkId]);
  await pg.query(
    "INSERT INTO planning_policies(transport_id,cutoff_time,timezone,revision,demo,changed_by) VALUES($1,$2,$3,$4,$5,$6)",
    [
      policy.transport_id,
      policy.cutoff_time,
      policy.timezone,
      policy.revision,
      policy.demo,
      policy.changed_by,
    ],
  );
});
test("confirmar a ida não confirma a volta; repetir a ação não duplica eventos", async () => {
  const outbound = (await board()).plans.find(
    (p: any) => p.direction === "OUTBOUND",
  );
  await api("responsavel", "post", "plans/" + outbound.id + "/respond", {
    use: true,
    expectedVersion: outbound.version,
  }).expect(201);
  await api("responsavel", "post", "plans/" + outbound.id + "/respond", {
    use: true,
    expectedVersion: outbound.version,
  }).expect(201);
  const b = await board();
  assert.equal(
    b.plans.find((p: any) => p.direction === "OUTBOUND").status,
    "CONFIRMED",
  );
  assert.equal(
    b.plans.find((p: any) => p.direction === "RETURN").status,
    "PENDING",
  );
  const log = await pg.query<{ n: number }>(
    "SELECT count(*)::int n FROM audit_events WHERE action='DAILY_PLAN_RESPONDED'",
  );
  assert.equal(log.rows[0].n, 1);
});
test("não uso é uma resposta expressa e não remove a ida confirmada", async () => {
  const p = (await board()).plans.find((p: any) => p.direction === "RETURN");
  await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: false,
    expectedVersion: p.version,
  }).expect(201);
  const b = await board();
  assert.equal(b.counts.confirmed, 1);
  assert.equal(b.counts.notUsing, 1);
  assert.equal(
    b.plans.find((p: any) => p.direction === "RETURN").exception,
    true,
  );
});
test("alterar rotina e limite preserva os estados, a rotina capturada e os prazos das previsões existentes", async () => {
  const before = (await board()).plans;
  const r = await api("responsavel", "get", "routines/" + linkId).expect(200);
  await api("responsavel", "put", "routines/" + linkId, {
    expectedRevision: r.body.revision,
    days: routineDays().map((d) => ({ ...d, outbound: false, return: false })),
  }).expect(200);
  await api("motorista", "put", "policy", {
    cutoffTime: "20:00",
    timezone: "America/Manaus",
    expectedRevision: 1,
  }).expect(200);
  await api("responsavel", "post", "generate", { date, linkId }).expect(201);
  assert.deepEqual(
    (await board()).plans.map((p: any) => [
      p.id,
      p.status,
      p.deadline_at,
      p.routine_revision,
    ]),
    before.map((p: any) => [p.id, p.status, p.deadline_at, p.routine_revision]),
  );
  await api("motorista", "put", "policy", {
    cutoffTime: "18:00",
    timezone: "America/Sao_Paulo",
    expectedRevision: 1,
  }).expect(409);
  await api("escola", "put", "policy", {
    cutoffTime: "18:00",
    timezone: "America/Sao_Paulo",
    expectedRevision: 2,
  }).expect(403);
  await api("motorista", "put", "policy", {
    cutoffTime: "18:00",
    timezone: "Fuso/Inexistente",
    expectedRevision: 2,
  }).expect(400);
});
test("rotina sem uso gera sem previsão; exceção por data não muda a rotina", async () => {
  const today = "2026-10-22";
  await api("responsavel", "post", "generate", { date: today, linkId }).expect(
    201,
  );
  const p = (await api("responsavel", "get", "day?date=" + today).expect(200))
    .body.plans[0];
  assert.equal(p.status, "NOT_EXPECTED");
  assert.equal(p.scheduled, false);
  const future = "2026-10-24";
  await api("responsavel", "post", "generate", { date: future, linkId }).expect(
    201,
  );
  const f = (await api("responsavel", "get", "day?date=" + future).expect(200))
    .body.plans[0];
  await api("responsavel", "post", "plans/" + f.id + "/respond", {
    use: true,
    expectedVersion: f.version,
  }).expect(400);
  const r = await api("responsavel", "get", "routines/" + linkId).expect(200);
  assert.ok(r.body.days.every((d: any) => !d.outbound && !d.return));
});
let pendingId = "";
test("no limite exato, alteração exige motivo e mantém o estado vigente até decisão", async () => {
  now = new Date("2026-10-22T21:00:00Z");
  const p = (await board()).plans.find((p: any) => p.direction === "RETURN");
  await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: true,
    expectedVersion: p.version,
  }).expect(400);
  const response = await api(
    "responsavel",
    "post",
    "plans/" + p.id + "/respond",
    {
      use: true,
      expectedVersion: p.version,
      reason: "Necessidade de usar a volta após alteração familiar",
    },
  ).expect(201);
  pendingId = response.body.requestId;
  const repeat = await api(
    "responsavel",
    "post",
    "plans/" + p.id + "/respond",
    {
      use: true,
      expectedVersion: p.version,
      reason: "Necessidade de usar a volta após alteração familiar",
    },
  ).expect(201);
  assert.equal(repeat.body.requestId, pendingId);
  const current = (await board()).plans.find((x: any) => x.id === p.id);
  assert.equal(current.status, "NOT_USING");
  assert.equal(current.request_id, pendingId);
});
test("escola e responsável não decidem pelo transporte; aceite atualiza o trecho e fica visível aos envolvidos", async () => {
  await api("escola", "patch", "changes/" + pendingId, {
    action: "ACCEPT",
  }).expect(403);
  await api("responsavel", "patch", "changes/" + pendingId, {
    action: "ACCEPT",
  }).expect(403);
  await api("outraescola", "patch", "changes/" + pendingId, {
    action: "ACCEPT",
  }).expect(404);
  await api("motorista", "patch", "changes/" + pendingId, {
    action: "ACCEPT",
  }).expect(200);
  const b = await board();
  const p = b.plans.find((p: any) => p.direction === "RETURN");
  assert.equal(p.status, "CONFIRMED");
  assert.equal(p.request_id, null);
  assert.equal(p.last_change.status, "ACCEPTED");
  assert.equal(
    (
      await api("escola", "get", "day?date=" + date).expect(200)
    ).body.plans.find((s: any) => s.id === p.id).status,
    "CONFIRMED",
  );
  await api("motorista", "patch", "changes/" + pendingId, {
    action: "ACCEPT",
  }).expect(409);
});
test("recusa mantém uso vigente; retirada também não altera a confirmação anterior", async () => {
  let p = (await board()).plans.find((p: any) => p.direction === "OUTBOUND");
  let r = await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: false,
    expectedVersion: p.version,
    reason: "Pedido de cancelamento depois do prazo configurado",
  }).expect(201);
  await api("motorista", "patch", "changes/" + r.body.requestId, {
    action: "REFUSE",
  }).expect(400);
  await api("motorista", "patch", "changes/" + r.body.requestId, {
    action: "REFUSE",
    note: "Transporte já organizado; família contatada para revisão",
  }).expect(200);
  p = (await board()).plans.find((v: any) => v.id === p.id);
  assert.equal(p.status, "CONFIRMED");
  assert.equal(p.last_change.status, "REFUSED");
  r = await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: false,
    expectedVersion: p.version,
    reason: "Nova solicitação da família para não usar o trecho",
  }).expect(201);
  await api("responsavel", "patch", "changes/" + r.body.requestId, {
    action: "WITHDRAW",
  }).expect(200);
  assert.equal(
    (await board()).plans.find((v: any) => v.id === p.id).status,
    "CONFIRMED",
  );
});
test("planejamento bloqueado impede cancelamento e aprovação de alteração, sem apagar pedidos", async () => {
  const p = (await board()).plans.find((p: any) => p.direction === "RETURN");
  const r = await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: false,
    expectedVersion: p.version,
    reason: "Cancelamento solicitado antes do bloqueio da operação",
  }).expect(201);
  await pg.query("UPDATE daily_plans SET locked_at=now() WHERE id=$1", [p.id]);
  await api("responsavel", "post", "plans/" + p.id + "/respond", {
    use: false,
    expectedVersion: p.version,
    reason: "Reenvio após o bloqueio da operação",
  }).expect(409);
  await api("motorista", "patch", "changes/" + r.body.requestId, {
    action: "ACCEPT",
  }).expect(409);
  assert.equal(
    (
      await pg.query<{ status: string }>(
        "SELECT status FROM planning_changes WHERE id=$1",
        [r.body.requestId],
      )
    ).rows[0].status,
    "PENDING",
  );
  await pg.query("UPDATE daily_plans SET locked_at=NULL WHERE id=$1", [p.id]);
});
test("revogar vínculo familiar impede aceite da solicitação e revoga consultas por criança", async () => {
  const p = (await board()).plans.find((p: any) => p.direction === "RETURN");
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id='20000000-0000-4000-8000-000000000001'",
  );
  await api("motorista", "patch", "changes/" + p.request_id, {
    action: "ACCEPT",
  }).expect(409);
  assert.equal(
    (await api("responsavel", "get", "day?date=" + date).expect(200)).body.plans
      .length,
    0,
  );
  await api("responsavel", "get", "routines/" + linkId).expect(404);
  await pg.query(
    "UPDATE guardian_links SET status='ACTIVE' WHERE student_id='20000000-0000-4000-8000-000000000001'",
  );
});
test("data passada não é alterada nem regenerada; falta de resposta segue pendente", async () => {
  now = new Date("2026-10-25T15:00:00Z");
  const old = (
    await api("responsavel", "get", "day?date=2026-10-24").expect(200)
  ).body.plans[0];
  assert.equal(old.status, "NOT_EXPECTED");
  await api("responsavel", "post", "plans/" + old.id + "/respond", {
    use: false,
    expectedVersion: old.version,
    reason: "Tentativa de alterar histórico de planejamento",
  }).expect(409);
  await api("responsavel", "post", "generate", { date, linkId }).expect(400);
  const pendingCount = await pg.query<{ n: number }>(
    "SELECT count(*)::int n FROM planning_changes WHERE status='PENDING'",
  );
  assert.ok(pendingCount.rows[0].n >= 1);
  const routine = await api("responsavel", "get", "routines/" + linkId).expect(
    200,
  );
  await api("responsavel", "put", "routines/" + linkId, {
    expectedRevision: routine.body.revision,
    days: routineDays().map((d) => ({ ...d, return: false })),
  }).expect(200);
  await api("responsavel", "post", "generate", {
    date: "2026-10-26",
    linkId,
  }).expect(201);
  const next = (
    await api("responsavel", "get", "day?date=2026-10-26").expect(200)
  ).body.plans;
  const notExpected = next.find((p: any) => p.direction === "RETURN");
  assert.equal(notExpected.status, "NOT_EXPECTED");
  await api("responsavel", "post", "plans/" + notExpected.id + "/respond", {
    use: true,
    expectedVersion: notExpected.version,
  }).expect(201);
  now = new Date("2026-10-26T15:00:00Z");
  const final = (
    await api("responsavel", "get", "day?date=2026-10-26").expect(200)
  ).body.plans;
  assert.equal(
    final.find((p: any) => p.direction === "OUTBOUND").status,
    "PENDING",
  );
  assert.equal(
    final.find((p: any) => p.direction === "RETURN").exception,
    true,
  );
});
