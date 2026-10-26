import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app";
import { Database } from "../src/db";
import { PlanningClock } from "../src/planning-clock";
import { configure } from "../src/bootstrap";
import { seed, demoPassword } from "../src/seed";
let app: INestApplication, pg: PGlite;
let now = new Date("2026-10-22T15:00:00Z");
const users: Record<
  string,
  { token: string; context: string; organization: string; id: string }
> = {};
let tripId = "",
  secondTrip = "",
  vehicleId = "",
  driverId = "",
  planId = "",
  linkId = "",
  foreignLink = "";
function api(
  who: string,
  method: "get" | "post" | "patch",
  path: string,
  body?: unknown,
) {
  const u = users[who];
  const r = request(app.getHttpServer())
    [method](path)
    .auth(u.token, { type: "bearer" })
    .set("X-Context-Id", u.context);
  return body ? r.send(body) : r;
}
async function detail(id = tripId, who = "motorista") {
  return (await api(who, "get", "/trips/" + id).expect(200)).body;
}
async function options(date = "2026-10-22", direction = "OUTBOUND") {
  return (
    await api(
      "motorista",
      "get",
      `/trips/options?date=${date}&direction=${direction}`,
    ).expect(200)
  ).body;
}
function createBody(
  plans: string[],
  date = "2026-10-22",
  direction = "OUTBOUND",
  vehicle = vehicleId,
) {
  return {
    id: randomUUID(),
    date,
    direction,
    vehicleId: vehicle,
    driverId,
    planIds: plans,
  };
}
before(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(join(__dirname, "../src/schema.sql"), "utf8"));
  app = await NestFactory.create(AppModule, { logger: false });
  const db = app.get(Database);
  await db.pool.end();
  db.pool = {
    query: (s: string, v?: unknown[]) => pg.query(s, v),
    end: async () => {},
  } as unknown as Database["pool"];
  db.transaction = (async (fn: (tx: unknown) => Promise<unknown>) =>
    pg.transaction((tx) =>
      fn({ query: (s: string, v?: unknown[]) => tx.query(s, v) }),
    )) as Database["transaction"];
  app.get(PlanningClock).now = () => new Date(now);
  await seed(db);
  configure(app);
  await app.init();
  for (const who of ["motorista", "escola", "responsavel", "outraescola"]) {
    const r = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Client", "mobile")
      .send({ email: who + "@demo.local", password: demoPassword })
      .expect(201);
    const me = (
      await request(app.getHttpServer())
        .get("/auth/me")
        .auth(r.body.token, { type: "bearer" })
        .expect(200)
    ).body;
    const c =
      who === "responsavel"
        ? me.contexts.find((c: any) => c.role === "GUARDIAN")
        : me.contexts[0];
    users[who] = {
      token: r.body.token,
      context: c.id,
      organization: c.organization_id,
      id: me.user.id,
    };
  }
  driverId = users.motorista.context;
  vehicleId = (await options()).vehicles[0].id;
  linkId = (await api("motorista", "get", "/planning/options").expect(200)).body
    .links[0].id;
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-22",
  }).expect(201);
  planId = (await options()).plans[0].id;
});
after(async () => {
  await app?.close();
  await pg?.close();
});

test("escola e responsável consultam, mas não preparam ou alteram viagens; IDs não contornam o escopo", async () => {
  const body = createBody([planId]);
  await api("escola", "post", "/trips", body).expect(403);
  await api("responsavel", "post", "/trips", body).expect(403);
  await api("outraescola", "get", "/trips/" + body.id).expect(404);
  assert.equal(
    (
      await api(
        "outraescola",
        "get",
        "/trips/options?date=2026-10-22&direction=OUTBOUND",
      ).expect(200)
    ).body.plans.length,
    0,
  );
});
test("preparação idempotente reserva uma participação e preserva previsão pendente para revisão", async () => {
  const body = createBody([planId]);
  tripId = body.id;
  const responses = await Promise.all([
    api("motorista", "post", "/trips", body),
    api("motorista", "post", "/trips", body),
  ]);
  assert.ok(responses.every((r) => r.status === 201));
  assert.ok(responses.some((r) => r.body.unchanged));
  const t = await detail();
  assert.equal(t.passengers.length, 1);
  assert.equal(t.counts.review, 1);
  assert.equal(t.counts.boardingInformed, 0);
  assert.equal(t.passengers[0].planning_status, "PENDING");
  await api("motorista", "post", "/trips", createBody([planId])).expect(409);
  await api("motorista", "post", "/trips", {
    ...body,
    direction: "RETURN",
  }).expect(409);
  const p = (
    await pg.query<any>("SELECT * FROM daily_plans WHERE id=$1", [planId])
  ).rows[0];
  assert.ok(p.locked_at);
  assert.equal(p.status, "PENDING");
  await api("responsavel", "post", "/planning/plans/" + planId + "/respond", {
    use: true,
    expectedVersion: p.version,
    reason: "Necessidade de utilizar transporte.",
  }).expect(409);
  await api("motorista", "post", `/trips/${tripId}/start`, {
    expectedVersion: t.version,
  }).expect(409);
});
test("decisão explícita permite iniciar; revisão concorrente não sobrescreve a decisão", async () => {
  const t = await detail(),
    p = t.passengers[0];
  await api("motorista", "patch", `/trips/${tripId}/passengers/${p.id}`, {
    expectedVersion: t.version,
    disposition: "EXPECTED",
    reason: "Uso verificado com a família por contato.",
  }).expect(200);
  await api("motorista", "patch", `/trips/${tripId}/passengers/${p.id}`, {
    expectedVersion: t.version,
    disposition: "NOT_TRANSPORTED",
    reason: "Tentativa com versão antiga.",
  }).expect(409);
  const next = await detail();
  assert.equal(next.counts.review, 0);
  assert.equal(next.counts.expected, 1);
  assert.equal(next.passengers[0].planning_status, "PENDING");
  assert.equal(next.passengers[0].exceptional, true);
  await api("motorista", "post", `/trips/${tripId}/start`, {
    expectedVersion: next.version,
  }).expect(201);
  const started = await detail();
  assert.equal(started.status, "IN_PROGRESS");
  assert.equal(started.counts.boardingInformed, 0);
  await api("motorista", "post", `/trips/${tripId}/cancel`, {
    expectedVersion: started.version,
    reason: "Não pode cancelar uma viagem iniciada.",
  }).expect(409);
  await api("motorista", "post", `/trips/${tripId}/complete`, {
    expectedVersion: started.version,
  }).expect(404);
});
test("embarque informado impede ausência; substituição conserva histórico e autoria", async () => {
  const t = await detail();
  const boarding = "2026-10-22T15:05:00Z";
  // Contrato de integração: não existe endpoint de embarque na Parte 4.
  await pg.query(
    "UPDATE trip_passengers SET boarding_informed_at=$2 WHERE id=$1",
    [t.passengers[0].id, boarding],
  );
  await api(
    "motorista",
    "patch",
    `/trips/${tripId}/passengers/${t.passengers[0].id}`,
    {
      expectedVersion: t.version,
      disposition: "NOT_TRANSPORTED",
      reason: "Tentativa de retirar após embarque informado.",
    },
  ).expect(409);
  const replacement = randomUUID();
  await pg.query(
    "INSERT INTO vehicles(id,organization_id,name,plate,capacity,created_by) VALUES($1,$2,$3,$4,10,$5)",
    [
      replacement,
      users.motorista.organization,
      "Van reserva",
      "XYZ1D23",
      users.motorista.id,
    ],
  );
  await api("motorista", "patch", `/trips/${tripId}/assignment`, {
    expectedVersion: t.version,
    driverId,
    vehicleId: replacement,
    reason: "Troca de veículo por manutenção preventiva.",
  }).expect(200);
  const next = await detail();
  assert.equal(next.assignments.length, 2);
  assert.equal(next.passengers[0].added_by, users.motorista.id);
  assert.ok(next.passengers[0].boarding_informed_at);
  assert.equal(next.counts.pendingDelivery, 1);
  assert.equal(next.counts.notTransported, 0);
  const log = (
    await pg.query<any>(
      "SELECT * FROM audit_events WHERE action='TRIP_STARTED' AND target_id=$1",
      [tripId],
    )
  ).rows[0];
  assert.equal(log.actor_id, users.motorista.id);
});
test("capacidade, escolas distintas e totais respeitam cada escopo, sem expor homônimos", async () => {
  const otherStudent = (
    await pg.query<any>(
      "SELECT id FROM students WHERE owner_organization_id=$1",
      [users.outraescola.organization],
    )
  ).rows[0].id;
  foreignLink = randomUUID();
  await pg.query(
    "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$4,'ACTIVE',$5,$5)",
    [
      foreignLink,
      otherStudent,
      users.outraescola.organization,
      users.motorista.organization,
      users.motorista.id,
    ],
  );
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-23",
  }).expect(201);
  const opts = await options("2026-10-23", "RETURN");
  await pg.query(
    "UPDATE daily_plans SET status='CONFIRMED' WHERE service_date='2026-10-23' AND direction='RETURN'",
  );
  const small = randomUUID();
  await pg.query(
    "INSERT INTO vehicles(id,organization_id,name,plate,capacity,created_by) VALUES($1,$2,$3,$4,1,$5)",
    [
      small,
      users.motorista.organization,
      "Uma vaga",
      "ABC1D24",
      users.motorista.id,
    ],
  );
  const ids = opts.plans.map((p: any) => p.id);
  const failed = createBody(ids, "2026-10-23", "RETURN", small);
  await api("motorista", "post", "/trips", failed).expect(409);
  assert.equal(
    (
      await pg.query<any>(
        "SELECT count(*)::int n FROM trip_passengers WHERE trip_id=$1",
        [failed.id],
      )
    ).rows[0].n,
    0,
  );
  assert.ok(
    (await options("2026-10-23", "RETURN")).plans.every(
      (p: any) => !p.locked_at,
    ),
  );
  const body = createBody(ids, "2026-10-23", "RETURN");
  secondTrip = body.id;
  await api("motorista", "post", "/trips", body).expect(201);
  assert.equal((await detail(secondTrip)).counts.total, 2);
  const school = await detail(secondTrip, "escola"),
    family = await detail(secondTrip, "responsavel"),
    other = await detail(secondTrip, "outraescola");
  assert.equal(school.passengers.length, 1);
  assert.equal(family.counts.total, 1);
  assert.equal(other.counts.total, 1);
  assert.notEqual(
    school.passengers[0].student_id,
    other.passengers[0].student_id,
  );
  await api("motorista", "post", `/trips/${secondTrip}/start`, {
    expectedVersion: 1,
  }).expect(409);
});
test("não uso é destinação expressa; cancelamento preserva linhas e permite outra reserva", async () => {
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-24",
  }).expect(201);
  const opts = await options("2026-10-24");
  const p = opts.plans.find(
    (p: any) => p.school_id === users.escola.organization,
  );
  await pg.query("UPDATE daily_plans SET status='NOT_USING' WHERE id=$1", [
    p.id,
  ]);
  const body = createBody([p.id], "2026-10-24");
  await api("motorista", "post", "/trips", body).expect(201);
  const t = await detail(body.id);
  assert.equal(t.counts.notTransported, 1);
  assert.equal(t.counts.review, 0);
  await api("motorista", "post", `/trips/${t.id}/cancel`, {
    expectedVersion: 1,
    reason: "Família informou que não utilizará este trecho.",
  }).expect(201);
  const cancelled = await detail(t.id);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.passengers.length, 1);
  assert.equal(cancelled.passengers[0].active, false);
  assert.equal(
    (
      await pg.query<any>("SELECT locked_at FROM daily_plans WHERE id=$1", [
        p.id,
      ])
    ).rows[0].locked_at,
    null,
  );
  await api(
    "motorista",
    "post",
    "/trips",
    createBody([p.id], "2026-10-24"),
  ).expect(201);
});
test("inclusão excepcional exige motivo, vínculo ativo e preserva a intenção do planejamento", async () => {
  const t = await detail();
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-22",
  }).expect(201);
  const opts = await options();
  const p = opts.plans.find(
    (p: any) => p.school_id === users.outraescola.organization,
  );
  assert.equal(p.status, "NOT_EXPECTED");
  await api("escola", "post", `/trips/${tripId}/passengers`, {
    expectedVersion: t.version,
    planId: p.id,
    reason: "Escola não autoriza em nome do transporte.",
  }).expect(403);
  await api("motorista", "post", `/trips/${tripId}/passengers`, {
    expectedVersion: t.version,
    planId: p.id,
    reason: "curto",
  }).expect(400);
  await api("motorista", "post", `/trips/${tripId}/passengers`, {
    expectedVersion: t.version,
    planId: p.id,
    reason: "Inclusão autorizada pelo transporte com contato registrado.",
  }).expect(201);
  const next = await detail();
  assert.equal(next.passengers.length, 2);
  assert.equal(
    next.passengers.find((a: any) => a.plan_id === p.id).exceptional,
    true,
  );
  assert.equal(
    (await pg.query<any>("SELECT status FROM daily_plans WHERE id=$1", [p.id]))
      .rows[0].status,
    "NOT_EXPECTED",
  );
  const n = next.version;
  await pg.query("UPDATE operating_links SET status='INACTIVE' WHERE id=$1", [
    foreignLink,
  ]);
  await api(
    "motorista",
    "patch",
    `/trips/${tripId}/passengers/${next.passengers.find((a: any) => a.plan_id === p.id).id}`,
    {
      expectedVersion: n,
      disposition: "NOT_TRANSPORTED",
      reason: "Vínculo inativo deve revogar novas ações.",
    },
  ).expect(404);
  await api("outraescola", "get", "/trips/" + tripId).expect(404);
  assert.equal((await detail()).passengers.length, 2);
});
test("recursos não iniciam duas viagens; apenas o motorista designado pode iniciar após substituição", async () => {
  const p = (await options("2026-10-22", "RETURN")).plans.find(
    (p: any) => p.school_id === users.escola.organization,
  );
  const body = createBody([p.id], "2026-10-22", "RETURN");
  await api("motorista", "post", "/trips", body).expect(201);
  let t = await detail(body.id);
  await api(
    "motorista",
    "patch",
    `/trips/${t.id}/passengers/${t.passengers[0].id}`,
    {
      expectedVersion: t.version,
      disposition: "EXPECTED",
      reason: "Uso revisado com a família antes da viagem.",
    },
  ).expect(200);
  t = await detail(t.id);
  await api("motorista", "post", `/trips/${t.id}/start`, {
    expectedVersion: t.version,
  }).expect(409);
  const userId = randomUUID(),
    membershipId = randomUUID();
  await pg.query(
    "INSERT INTO users(id,name,email,password_hash) SELECT $1,'Motorista reserva','reserva@demo.local',password_hash FROM users WHERE id=$2",
    [userId, users.motorista.id],
  );
  await pg.query(
    "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'DRIVER')",
    [membershipId, userId, users.motorista.organization],
  );
  await api("motorista", "patch", `/trips/${t.id}/assignment`, {
    expectedVersion: t.version,
    driverId: membershipId,
    vehicleId,
    reason: "Motorista reserva assume a segunda viagem.",
  }).expect(200);
  t = await detail(t.id);
  await api("motorista", "post", `/trips/${t.id}/start`, {
    expectedVersion: t.version,
  }).expect(403);
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .set("X-Client", "mobile")
    .send({ email: "reserva@demo.local", password: demoPassword })
    .expect(201);
  users.reserva = {
    token: login.body.token,
    context: membershipId,
    organization: users.motorista.organization,
    id: userId,
  };
  await api("reserva", "post", `/trips/${t.id}/start`, {
    expectedVersion: t.version,
  }).expect(201);
  const started = await detail(t.id);
  assert.equal(started.status, "IN_PROGRESS");
  assert.equal(started.driver_user_id, userId);
  assert.equal(started.started_by, userId);
  await api(
    "motorista",
    "patch",
    `/trips/${t.id}/passengers/${t.passengers[0].id}`,
    {
      expectedVersion: started.version,
      disposition: "NOT_TRANSPORTED",
      reason: "Motorista anterior não atua pelo substituto.",
    },
  ).expect(403);
});

test("pedido em análise impede reserva; dados de outro escopo e ausência de previsão não autorizam preparação", async () => {
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-25",
  }).expect(201);
  const p = (await options("2026-10-25")).plans[0];
  await api(
    "motorista",
    "post",
    "/trips",
    createBody([p.id], "2026-10-25"),
  ).expect(400);
  await pg.query(
    "UPDATE daily_plans SET status='PENDING',scheduled=true WHERE id=$1",
    [p.id],
  );
  await pg.query(
    "INSERT INTO planning_changes(id,plan_id,requested_usage,previous_status,reason,status,requested_by) VALUES($1,$2,true,'PENDING','Pedido em análise para teste de reserva.','PENDING',$3)",
    [randomUUID(), p.id, users.responsavel.id],
  );
  await api(
    "motorista",
    "post",
    "/trips",
    createBody([p.id], "2026-10-25"),
  ).expect(409);
  await api("motorista", "post", "/trips", {
    ...createBody([p.id], "2026-10-25"),
    driverId: users.escola.context,
  }).expect(400);
  await api("motorista", "post", "/trips", {
    ...createBody([p.id], "2026-10-25"),
    vehicleId: randomUUID(),
  }).expect(400);
  await api(
    "motorista",
    "post",
    "/trips",
    createBody([randomUUID()], "2026-10-25"),
  ).expect(404);
});

test("a primeira viagem pode ter somente inclusão excepcional sem fabricar confirmação familiar", async () => {
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-31",
  }).expect(201);
  const p = (await options("2026-10-31")).plans[0];
  assert.equal(p.status, "NOT_EXPECTED");
  const body = {
    ...createBody([p.id], "2026-10-31"),
    exceptionReason: "Inclusão autorizada para atividade escolar no sábado.",
  };
  await api("motorista", "post", "/trips", body).expect(201);
  const t = await detail(body.id);
  assert.equal(t.counts.expected, 1);
  assert.equal(t.counts.review, 0);
  assert.equal(t.passengers[0].planning_status, "NOT_EXPECTED");
  assert.equal(t.passengers[0].exceptional, true);
  await api("motorista", "post", "/trips", body).expect(201);
});

test("vínculos diferentes da mesma criança não duplicam a reserva na data e trecho", async () => {
  const link = (
    await pg.query<any>("SELECT * FROM operating_links WHERE id=$1", [linkId])
  ).rows[0];
  const duplicateLink = randomUUID();
  await pg.query(
    "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$4,'ACTIVE',$5,$5)",
    [
      duplicateLink,
      link.student_id,
      users.outraescola.organization,
      users.motorista.organization,
      users.motorista.id,
    ],
  );
  await api("motorista", "post", "/planning/generate", {
    date: "2026-10-31",
    linkId: duplicateLink,
  }).expect(201);
  const p = (await options("2026-10-31")).plans.find(
    (p: any) => p.school_id === users.outraescola.organization,
  );
  await api("motorista", "post", "/trips", {
    ...createBody([p.id], "2026-10-31"),
    exceptionReason: "Segunda associação não duplica a reserva da criança.",
  }).expect(409);
});

test("viagens passadas são somente leitura e vínculos familiares inativos revogam consulta", async () => {
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE user_id=$1",
    [users.responsavel.id],
  );
  await api("responsavel", "get", "/trips/" + tripId).expect(404);
  now = new Date("2026-10-24T15:00:00Z");
  const t = await detail();
  await api("motorista", "patch", `/trips/${tripId}/assignment`, {
    expectedVersion: t.version,
    driverId,
    vehicleId,
    reason: "Tentativa de reescrever viagem de data passada.",
  }).expect(409);
});
