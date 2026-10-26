import "./environment";
import "reflect-metadata";
import { before, after, afterEach, test } from "node:test";
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
import { NotificationWorker } from "../src/notification-worker";
import { ExpoPush, PushFailure } from "../src/expo-push";
import { AlertsService } from "../src/alerts.service";
import { seed, demoPassword } from "../src/seed";
let app: INestApplication,
  pg: PGlite,
  serial = 0,
  now = new Date("2026-10-22T15:00:00Z");
const date = "2026-10-22";
afterEach(() => {
  now = new Date("2026-10-22T15:00:00Z");
});
type Account = {
  token: string;
  context: string;
  organization: string;
  id: string;
};
const users: Record<string, Account> = {};
type Fixture = {
  id: string;
  passenger: string;
  student: string;
  link: string;
  driver: string;
};
function api(
  who: string,
  method: "get" | "post" | "patch" | "put",
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
async function login(email: string, role: string) {
  const r = await request(app.getHttpServer())
    .post("/auth/login")
    .set("X-Client", "mobile")
    .send({ email, password: demoPassword })
    .expect(201);
  const me = (
    await request(app.getHttpServer())
      .get("/auth/me")
      .auth(r.body.token, { type: "bearer" })
      .expect(200)
  ).body;
  const c = me.contexts.find((c: any) => c.role === role);
  return {
    token: r.body.token,
    context: c.id,
    organization: c.organization_id,
    id: me.user.id,
  };
}
async function newDriver() {
  const n = ++serial,
    id = randomUUID(),
    membership = randomUUID(),
    key = "driver" + n,
    email = key + "@test.local";
  await pg.query(
    "INSERT INTO users(id,name,email,password_hash) SELECT $1,$2,$3,password_hash FROM users WHERE id=$4",
    [id, "Motorista " + n, email, users.motorista.id],
  );
  await pg.query(
    "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'DRIVER')",
    [membership, id, users.motorista.organization],
  );
  users[key] = await login(email, "DRIVER");
  return key;
}
async function fixture(
  direction = "OUTBOUND",
  start = true,
  driverWho?: string,
  schoolId = users.escola.organization,
  family = true,
): Promise<Fixture> {
  const driver = driverWho || (await newDriver()),
    student = randomUUID(),
    link = randomUUID(),
    vehicle = randomUUID();
  await pg.query(
    "INSERT INTO students(id,name,normalized_name,owner_organization_id,created_by) VALUES($1,$2,$3,$4,$5)",
    [
      student,
      "Criança " + serial,
      "crianca " + serial,
      schoolId,
      users.escola.id,
    ],
  );
  await pg.query(
    "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$4,'ACTIVE',$5,$5)",
    [link, student, schoolId, users.motorista.organization, users.motorista.id],
  );
  if (family)
    await pg.query(
      "INSERT INTO guardian_links(id,student_id,email,user_id,status,created_by,verified_by,verification_note,verified_at) VALUES($1,$2,'responsavel@demo.local',$3,'ACTIVE',$4,$4,'Vínculo de teste isolado.',now())",
      [randomUUID(), student, users.responsavel.id, users.escola.id],
    );
  await pg.query(
    "INSERT INTO vehicles(id,organization_id,name,plate,capacity,created_by) VALUES($1,$2,$3,$4,15,$5)",
    [
      vehicle,
      users.motorista.organization,
      "Van " + serial,
      "TST1A" + String(serial).padStart(2, "0"),
      users.motorista.id,
    ],
  );
  await api("motorista", "post", "/planning/generate", {
    date,
    linkId: link,
  }).expect(201);
  const plans = (
    await api(
      "motorista",
      "get",
      `/trips/options?date=${date}&direction=${direction}`,
    ).expect(200)
  ).body.plans;
  const plan = plans.find((p: any) => p.student_id === student),
    id = randomUUID();
  await api("motorista", "post", "/trips", {
    id,
    date,
    direction,
    driverId: users[driver].context,
    vehicleId: vehicle,
    planIds: [plan.id],
    exceptionReason: "Inclusão autorizada para cenário de teste isolado.",
  }).expect(201);
  const t = (await api("motorista", "get", "/trips/" + id).expect(200)).body;
  if (start)
    await api(driver, "post", `/trips/${id}/start`, {
      expectedVersion: t.version,
    }).expect(201);
  return { id, passenger: t.passengers[0].id, student, link, driver };
}
function confirm(
  f: Fixture,
  who: string,
  kind = "BOARDING",
  body: unknown = {},
) {
  return api(
    who,
    "post",
    `/trips/${f.id}/passengers/${f.passenger}/movements/${kind}/confirm`,
    body,
  );
}
async function detail(f: Fixture, who = "motorista") {
  return (await api(who, "get", "/trips/" + f.id).expect(200)).body;
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
  for (const who of [
    "motorista",
    "escola",
    "operacao",
    "responsavel",
    "outraescola",
  ])
    users[who] = await login(
      who + "@demo.local",
      who === "responsavel"
        ? "GUARDIAN"
        : who === "motorista"
          ? "DRIVER"
          : "SCHOOL",
    );
  const membership = randomUUID();
  await pg.query(
    "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'DRIVER')",
    [membership, users.responsavel.id, users.motorista.organization],
  );
  users.anaDriver = {
    ...users.responsavel,
    context: membership,
    organization: users.motorista.organization,
  };
});
after(async () => {
  await app?.close();
  await pg?.close();
});

test("matriz da ida: ordem livre, primeira informada, segunda validada e desembarque exige escola", async () => {
  const f = await fixture();
  await confirm(f, "escola").expect(403);
  await confirm(f, "responsavel", "ALIGHTING").expect(403);
  await confirm(f, "motorista").expect(403);
  await confirm(f, "responsavel").expect(201);
  let t = await detail(f);
  let p = t.passengers[0];
  assert.equal(p.movementState, "BOARDING_INFORMED");
  assert.equal(p.possiblyOnboard, true);
  assert.equal(t.counts.boardingInformed, 1);
  assert.equal(t.counts.pendingDelivery, 1);
  assert.deepEqual(p.movements[0].missingRoles, ["DRIVER"]);
  assert.equal(
    (await confirm(f, f.driver).expect(201)).body.state,
    "VALIDATED",
  );
  t = await detail(f);
  assert.equal(t.counts.boardingInformed, 0);
  assert.equal(t.counts.boardingValidated, 1);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  t = await detail(f);
  assert.equal(t.passengers[0].movementState, "ALIGHTING_INFORMED");
  assert.equal(t.counts.pendingDelivery, 1);
  assert.equal(t.counts.delivered, 0);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  t = await detail(f);
  assert.equal(t.passengers[0].movementState, "DELIVERED");
  assert.equal(t.passengers[0].possiblyOnboard, false);
  assert.equal(t.counts.pendingDelivery, 0);
  assert.equal(t.counts.delivered, 1);
  assert.equal(t.status, "IN_PROGRESS");
  assert.equal(t.counts.openIssues, 0);
});
test("matriz da volta: escola entrega, motorista informa primeiro e responsável recebe antes do motorista", async () => {
  const f = await fixture("RETURN");
  await confirm(f, "responsavel").expect(403);
  await confirm(f, "escola", "ALIGHTING").expect(403);
  await confirm(f, f.driver).expect(201);
  await confirm(f, "escola").expect(201);
  await confirm(f, "responsavel", "ALIGHTING").expect(201);
  let t = await detail(f);
  assert.deepEqual(t.passengers[0].movements[1].missingRoles, ["DRIVER"]);
  assert.equal(t.counts.pendingDelivery, 1);
  assert.equal(t.counts.delivered, 0);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  t = await detail(f);
  assert.equal(t.counts.delivered, 1);
  assert.equal(t.counts.openIssues, 0);
});
test("confirmações simultâneas e reenvios preservam dois autores, uma movimentação e horários originais", async () => {
  const f = await fixture();
  const results = await Promise.all([
    confirm(f, "responsavel"),
    confirm(f, f.driver),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  const before = (await detail(f)).passengers[0].movements[0];
  assert.equal(before.state, "VALIDATED");
  assert.equal(
    new Set(before.confirmations.map((c: any) => c.actorId)).size,
    2,
  );
  now = new Date("2026-10-22T15:01:00Z");
  const retries = await Promise.all([
    confirm(f, "responsavel"),
    confirm(f, f.driver),
    confirm(f, "responsavel"),
  ]);
  assert.ok(retries.every((r) => r.status === 201 && r.body.unchanged));
  const after = (await detail(f)).passengers[0].movements[0];
  assert.deepEqual(after, before);
  const counts = (
    await pg.query<any>(
      "SELECT count(*)::int n FROM movement_confirmations WHERE movement_id=$1",
      [before.id],
    )
  ).rows[0].n;
  assert.equal(counts, 2);
  const log = (
    await pg.query<any>(
      "SELECT count(*)::int n FROM audit_events WHERE action='MOVEMENT_CONFIRMED' AND details->>'movementId'=$1",
      [before.id],
    )
  ).rows[0].n;
  assert.equal(log, 2);
  now = new Date("2026-10-22T15:00:00Z");
});
test("a mesma pessoa com perfis de responsável e motorista não supre os dois lados", async () => {
  // Número exclusivo para a placa desta viagem, pois o motorista não é criado pelo helper.
  serial++;
  const f = await fixture("OUTBOUND", true, "anaDriver");
  await confirm(f, "responsavel").expect(201);
  await confirm(f, "anaDriver").expect(403);
  let t = await detail(f);
  assert.equal(t.passengers[0].movements[0].confirmations.length, 1);
  assert.equal(t.passengers[0].movements[0].canConfirm, false);
  await api("motorista", "patch", `/trips/${f.id}/assignment`, {
    expectedVersion: t.version,
    driverId: users.motorista.context,
    vehicleId: t.vehicle_id,
    reason: "Outra pessoa assume para fornecer o segundo lado real.",
  }).expect(200);
  await confirm(f, "motorista").expect(201);
  t = await detail(f);
  assert.equal(t.passengers[0].movements[0].state, "VALIDATED");
  assert.equal(
    new Set(
      t.passengers[0].movements[0].confirmations.map((c: any) => c.actorId),
    ).size,
    2,
  );
});
test("dois responsáveis não validam entre si o lado do motorista", async () => {
  const f = await fixture();
  const person = await newDriver();
  const org = randomUUID(),
    membership = randomUUID();
  await pg.query(
    "INSERT INTO organizations(id,name,kind) VALUES($1,'Família de teste','FAMILY')",
    [org],
  );
  await pg.query(
    "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'GUARDIAN')",
    [membership, users[person].id, org],
  );
  users.secondGuardian = {
    ...users[person],
    context: membership,
    organization: org,
  };
  await pg.query(
    "INSERT INTO guardian_links(id,student_id,email,user_id,status,created_by,verified_by,verified_at) VALUES($1,$2,'segundo@test.local',$3,'ACTIVE',$4,$4,now())",
    [randomUUID(), f.student, users[person].id, users.escola.id],
  );
  const results = await Promise.all([
    confirm(f, "responsavel"),
    confirm(f, "secondGuardian"),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const p = (await detail(f)).passengers[0];
  assert.equal(p.movements[0].state, "INFORMED");
  assert.deepEqual(p.movements[0].missingRoles, ["DRIVER"]);
});
test("desembarque sem embarque gera ocorrência única sem fabricar etapa anterior", async () => {
  const f = await fixture();
  await confirm(f, "escola", "ALIGHTING").expect(201);
  let t = await detail(f),
    p = t.passengers[0];
  assert.equal(p.boarding_informed_at, null);
  assert.equal(p.movements[0].confirmations.length, 0);
  assert.equal(p.possiblyOnboard, true);
  assert.equal(t.counts.pendingDelivery, 1);
  assert.equal(t.counts.openIssues, 1);
  assert.equal(p.issues[0].details.boardingConfirmationsAtDetection, 0);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  t = await detail(f);
  assert.equal(t.counts.delivered, 1);
  assert.equal(t.counts.openIssues, 1);
  assert.equal(t.passengers[0].boarding_informed_at, null);
  assert.equal(t.passengers[0].possiblyOnboard, false);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  await confirm(f, "responsavel").expect(201);
  await confirm(f, f.driver).expect(201);
  t = await detail(f);
  assert.equal(t.counts.openIssues, 1);
  assert.equal(t.passengers[0].issues.length, 1);
  assert.equal(t.passengers[0].issues[0].status, "OPEN");
  assert.equal(t.status, "IN_PROGRESS");
});
test("embarque de uma parte seguido de desembarque mantém a etapa anterior incompleta visível", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  const p = (await detail(f)).passengers[0];
  assert.equal(p.movements[0].state, "INFORMED");
  assert.equal(p.movements[1].state, "INFORMED");
  assert.equal(p.issues[0].details.boardingConfirmationsAtDetection, 1);
  assert.equal(p.issues[0].details.reason, "BOARDING_NOT_VALIDATED");
});
test("embarque real bloqueia ausência, resposta de planejamento e cancelamento", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const t = await detail(f),
    p = t.passengers[0];
  await api(f.driver, "patch", `/trips/${f.id}/passengers/${p.id}`, {
    expectedVersion: t.version,
    disposition: "NOT_TRANSPORTED",
    reason: "Não é permitido apagar um embarque informado.",
  }).expect(409);
  await api(f.driver, "post", `/trips/${f.id}/cancel`, {
    expectedVersion: t.version,
    reason: "Não é permitido cancelar após iniciar e embarcar.",
  }).expect(409);
  const plan = (
    await pg.query<any>("SELECT * FROM daily_plans WHERE id=$1", [p.plan_id])
  ).rows[0];
  await api("responsavel", "post", `/planning/plans/${plan.id}/respond`, {
    expectedVersion: plan.version,
    use: false,
    reason: "Embarque impede cancelamento pelo planejamento.",
  }).expect(409);
  await api("responsavel", "put", `/planning/routines/${f.link}`, {
    expectedRevision: 0,
    days: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      outbound: false,
      return: false,
    })),
  }).expect(200);
  assert.equal(
    (await detail(f)).passengers[0].boarding_informed_at,
    p.boarding_informed_at,
  );
});
test("substituição mantém os autores e atribuições anteriores, e revoga a ação do motorista anterior", async () => {
  const f = await fixture("RETURN");
  await confirm(f, f.driver).expect(201);
  const old = (await detail(f)).passengers[0].movements[0].confirmations[0];
  const nextDriver = await newDriver(),
    t = await detail(f);
  await api("motorista", "patch", `/trips/${f.id}/assignment`, {
    expectedVersion: t.version,
    driverId: users[nextDriver].context,
    vehicleId: t.vehicle_id,
    reason: "Substituição durante viagem com registro anterior preservado.",
  }).expect(200);
  await confirm(f, f.driver, "ALIGHTING").expect(403);
  await confirm(f, "escola").expect(201);
  await confirm(f, nextDriver, "ALIGHTING").expect(201);
  const p = (await detail(f)).passengers[0];
  assert.deepEqual(
    p.movements[0].confirmations.find((c: any) => c.side === "DRIVER"),
    old,
  );
  assert.notEqual(
    p.movements[1].confirmations[0].assignmentId,
    old.assignmentId,
  );
  assert.equal(p.movements[1].confirmations[0].actorId, users[nextDriver].id);
});
test("IDs e corpo da requisição não permitem escolher autor, lado, outra criança ou confirmação em lote", async () => {
  const f = await fixture();
  await confirm(f, "outraescola").expect(404);
  const alien = await fixture(
    "OUTBOUND",
    true,
    undefined,
    users.outraescola.organization,
    false,
  );
  await confirm(alien, "responsavel").expect(404);
  await confirm(alien, "escola", "ALIGHTING").expect(404);
  for (const body of [
    { actorId: users.escola.id },
    { side: "DRIVER" },
    { passengerIds: [f.passenger, alien.passenger] },
  ])
    await confirm(f, "responsavel", "BOARDING", body).expect(400);
  await confirm(f, "responsavel", "INVALID").expect(400);
  await api(
    "responsavel",
    "post",
    `/trips/${f.id}/passengers/${alien.passenger}/movements/BOARDING/confirm`,
    {},
  ).expect(404);
  assert.equal(
    (await detail(f)).passengers[0].movements[0].confirmations.length,
    0,
  );
});
test("viagem planejada, cancelada e destinação não transportada não recebem movimentações novas", async () => {
  const f = await fixture("OUTBOUND", false);
  await confirm(f, "responsavel").expect(409);
  let t = await detail(f);
  await api("motorista", "patch", `/trips/${f.id}/passengers/${f.passenger}`, {
    expectedVersion: t.version,
    disposition: "NOT_TRANSPORTED",
    reason: "Ausência registrada antes do início desta viagem.",
  }).expect(200);
  t = await detail(f);
  await api("motorista", "post", `/trips/${f.id}/cancel`, {
    expectedVersion: t.version,
    reason: "Viagem cancelada, nenhuma movimentação pode ser criada.",
  }).expect(201);
  await confirm(f, "responsavel").expect(409);
  const g = await fixture();
  t = await detail(g);
  await api(g.driver, "patch", `/trips/${g.id}/passengers/${g.passenger}`, {
    expectedVersion: t.version,
    disposition: "NOT_TRANSPORTED",
    reason: "Família informou ausência após o início, sem embarque.",
  }).expect(200);
  await confirm(g, "responsavel").expect(409);
});
test("revogação de vínculo mantém registros anteriores sem autorizar novas confirmações", async () => {
  const f = await fixture();
  await confirm(f, "responsavel").expect(201);
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [f.student],
  );
  await confirm(f, "responsavel").expect(404);
  let p = (await detail(f)).passengers[0];
  assert.equal(p.movements[0].confirmations[0].actorId, users.responsavel.id);
  await pg.query("UPDATE operating_links SET status='INACTIVE' WHERE id=$1", [
    f.link,
  ]);
  await confirm(f, f.driver).expect(404);
  p = (await detail(f)).passengers[0];
  assert.equal(p.movements[0].confirmations.length, 1);
  assert.equal(p.movements[0].canConfirm, false);
});
test("corrida entre ausência e embarque mantém somente uma destinação compatível", async () => {
  const f = await fixture(),
    t = await detail(f);
  const results = await Promise.all([
    confirm(f, "responsavel"),
    api(f.driver, "patch", `/trips/${f.id}/passengers/${f.passenger}`, {
      expectedVersion: t.version,
      disposition: "NOT_TRANSPORTED",
      reason: "Ausência concorrente com relato individual de embarque.",
    }),
  ]);
  assert.equal(
    results.filter((r) => r.status >= 200 && r.status < 300).length,
    1,
  );
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const p = (await detail(f)).passengers[0];
  assert.equal(
    Boolean(p.boarding_informed_at) && p.disposition === "NOT_TRANSPORTED",
    false,
  );
});

test("pendência de viagem ainda aberta admite confirmação recebida depois da meia-noite sem retroagir o horário", async () => {
  const f = await fixture();
  now = new Date("2026-10-23T12:00:00Z");
  await confirm(f, "responsavel").expect(201);
  const t = await detail(f),
    p = t.passengers[0];
  assert.equal(t.service_date, "2026-10-22");
  assert.equal(
    p.movements[0].confirmations[0].receivedAt,
    "2026-10-23T12:00:00.000Z",
  );
  now = new Date("2026-10-22T15:00:00Z");
});

test("notificações distinguem informado e validado, reenvio não duplica eventos e leitura não confirma", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  let list = (await api("responsavel", "get", "/notifications").expect(200))
    .body;
  const first = list.items.find(
    (n: any) => n.target.passengerId === f.passenger,
  );
  assert.equal(first.title, "Embarque informado");
  assert.equal(first.purpose, "ACTION");
  assert.equal(first.pending, true);
  assert.match(first.body, /Motorista/);
  assert.match(first.body, /outra parte ainda não havia/);
  const count = (
    await pg.query<{ count: number }>(
      "SELECT count(*)::int count FROM notification_events WHERE passenger_id=$1",
      [f.passenger],
    )
  ).rows[0].count;
  await confirm(f, f.driver).expect(201);
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int count FROM notification_events WHERE passenger_id=$1",
        [f.passenger],
      )
    ).rows[0].count,
    count,
  );
  await api(
    "responsavel",
    "post",
    `/notifications/${first.id}/read`,
    {},
  ).expect(201);
  await api(
    "responsavel",
    "post",
    `/notifications/${first.id}/read`,
    {},
  ).expect(201);
  assert.equal(
    (await detail(f)).passengers[0].movements[0].confirmations.length,
    1,
  );
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int count FROM audit_events WHERE action='NOTIFICATION_READ' AND target_id=$1",
        [first.id],
      )
    ).rows[0].count,
    1,
  );
  await confirm(f, "responsavel").expect(201);
  list = (await api("responsavel", "get", "/notifications").expect(200)).body;
  const own = list.items.filter(
    (n: any) => n.target.passengerId === f.passenger,
  );
  assert.equal(own.length, 2);
  assert(own.some((n: any) => n.title === "Embarque validado"));
  assert(own.every((n: any) => !n.pending));
  const detailResult = (
    await api("responsavel", "get", "/notifications/" + first.id).expect(200)
  ).body;
  assert.equal(detailResult.passenger.id, f.passenger);
  assert.equal(detailResult.trip.passengers.length, 1);
  assert.equal(detailResult.timeline.length, 2);
  assert.equal(detailResult.timeline[0].title, "Embarque informado");
  assert.equal(detailResult.timeline[1].title, "Embarque validado");
});

test("cobrança vai ao motorista designado quando responsável registrou primeiro", async () => {
  const f = await fixture();
  await confirm(f, "responsavel").expect(201);
  const driver = (
    await api(f.driver, "get", "/notifications").expect(200)
  ).body.items.find((n: any) => n.target.passengerId === f.passenger);
  const family = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.find((n: any) => n.target.passengerId === f.passenger);
  assert.equal(driver.pending, true);
  assert.equal(driver.purpose, "ACTION");
  assert.equal(family.pending, false);
  assert.equal(family.purpose, "UPDATE");
  const other = (await api("motorista", "get", "/notifications").expect(200))
    .body.items;
  assert(!other.some((n: any) => n.target.passengerId === f.passenger));
});

test("centrais e links verificam destinatário, contexto, filho e revogação", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const n = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.find((n: any) => n.target.passengerId === f.passenger);
  await api("outraescola", "get", "/notifications/" + n.id).expect(404);
  await api("escola", "get", "/notifications/" + n.id).expect(404);
  await api(
    "outraescola",
    "get",
    "/notifications/children/" + f.passenger,
  ).expect(404);
  await api("outraescola", "post", `/notifications/${n.id}/read`, {}).expect(
    404,
  );
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [f.student],
  );
  await api("responsavel", "get", "/notifications/" + n.id).expect(404);
  await api(
    "responsavel",
    "get",
    "/notifications/children/" + f.passenger,
  ).expect(404);
  assert(
    !(
      await api("responsavel", "get", "/notifications").expect(200)
    ).body.items.some((x: any) => x.id === n.id),
  );
  assert(
    !(
      await api("responsavel", "get", "/notifications/home").expect(200)
    ).body.children.some((x: any) => x.id === f.student),
  );
});

test("ocorrência produz atualização persistente; ler mantém ocorrência aberta", async () => {
  const f = await fixture();
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  const list = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.filter((n: any) => n.target.passengerId === f.passenger);
  const issue = list.find((n: any) => n.title === "Sequência incompleta");
  assert(issue);
  assert.equal(issue.pending, false);
  assert(list.every((n: any) => !n.pending)); // Escola é a contraparte deste desembarque.
  const school = (
    await api("escola", "get", "/notifications").expect(200)
  ).body.items.find(
    (n: any) =>
      n.target.passengerId === f.passenger &&
      n.title === "Desembarque informado",
  );
  assert.equal(school.pending, true);
  await api(
    "responsavel",
    "post",
    `/notifications/${issue.id}/read`,
    {},
  ).expect(201);
  const result = (
    await api("responsavel", "get", "/notifications/" + issue.id).expect(200)
  ).body;
  assert.equal(result.passenger.issues[0].status, "OPEN");
  assert.equal(result.passenger.delivery_validated_at, null);
  const home = (
    await api("responsavel", "get", "/notifications/home").expect(200)
  ).body.children.find((x: any) => x.id === f.student);
  assert.equal(home.current.state, "ALIGHTING_INFORMED");
  assert.equal(home.current.openIssues, 1);
});

test("rollback da movimentação também desfaz os eventos e a caixa de saída", async () => {
  const f = await fixture(),
    db = app.get(Database),
    original = db.transaction.bind(db);
  db.transaction = ((fn) =>
    original(async (tx) => {
      await fn(tx);
      throw new Error("Falha após gravação para testar rollback");
    })) as Database["transaction"];
  try {
    await confirm(f, f.driver).expect(500);
  } finally {
    db.transaction = original;
  }
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int count FROM notification_events WHERE passenger_id=$1",
        [f.passenger],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await detail(f)).passengers[0].movements[0].confirmations.length,
    0,
  );
});

async function queuedNotification(direction = "OUTBOUND") {
  const f = await fixture(direction),
    installationId = randomUUID();
  await api("responsavel", "post", "/notifications/devices", {
    installationId,
    token: "ExpoPushToken[test_" + installationId.replaceAll("-", "") + "]",
  }).expect(201);
  await pg.query(
    "UPDATE push_devices SET registered_at='2026-10-22T00:00:00Z' WHERE installation_id=$1",
    [installationId],
  );
  await confirm(f, f.driver).expect(201);
  const worker = app.get(NotificationWorker),
    push = app.get(ExpoPush);
  push.enabled = () => true;
  while (await worker.dispatch()) {}
  const row = (
    await pg.query<any>(
      `SELECT d.*,n.id notice_id FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id
    JOIN notification_events e ON e.id=n.event_id JOIN push_devices v ON v.id=d.device_id WHERE e.passenger_id=$1 AND v.installation_id=$2`,
      [f.passenger, installationId],
    )
  ).rows[0];
  assert(row);
  return { f, row, worker, push, installationId };
}

test("falha temporária registra tentativa, retry aceita ticket sem reenviar e recibo não significa leitura", async () => {
  const { f, row, worker, push } = await queuedNotification();
  let sent = 0;
  push.send = async () => {
    sent++;
    if (sent === 1) throw new PushFailure("HTTP_503");
    return "ticket-test";
  };
  push.receipt = async () => true;
  await assert.rejects(worker.process(row.id));
  let stored = (
    await pg.query<any>("SELECT * FROM notification_deliveries WHERE id=$1", [
      row.id,
    ])
  ).rows[0];
  assert.equal(stored.status, "RETRY");
  assert.equal(stored.attempts, 1);
  assert.equal(
    (await detail(f)).passengers[0].movements[0].confirmations.length,
    1,
  );
  await pg.query(
    "UPDATE notification_deliveries SET next_attempt_at=now() WHERE id=$1",
    [row.id],
  );
  await worker.process(row.id);
  await worker.process(row.id);
  assert.equal(sent, 2);
  stored = (
    await pg.query<any>("SELECT * FROM notification_deliveries WHERE id=$1", [
      row.id,
    ])
  ).rows[0];
  assert.equal(stored.status, "ACCEPTED");
  assert.equal(stored.ticket_id, "ticket-test");
  await pg.query(
    "UPDATE notification_deliveries SET next_attempt_at=now() WHERE id=$1",
    [row.id],
  );
  await worker.process(row.id, true);
  await worker.process(row.id, true);
  stored = (
    await pg.query<any>("SELECT * FROM notification_deliveries WHERE id=$1", [
      row.id,
    ])
  ).rows[0];
  assert.equal(stored.status, "PROVIDER_ACCEPTED");
  assert.equal(stored.receipt_attempts, 1);
  const n = (
    await api("responsavel", "get", "/notifications/" + row.notice_id).expect(
      200,
    )
  ).body.notification;
  assert.equal(n.readAt, null);
  assert.equal(n.pending, true);
  assert.equal(n.deliveries[0].attempts >= 0, true);
});

test("três falhas encerram envio e preservam pendência e histórico de tentativas", async () => {
  const { f, row, worker, push } = await queuedNotification();
  let sent = 0;
  push.send = async () => {
    sent++;
    throw new PushFailure("HTTP_503");
  };
  for (let i = 0; i < 3; i++) {
    await pg.query(
      "UPDATE notification_deliveries SET next_attempt_at=now() WHERE id=$1",
      [row.id],
    );
    if (i < 2) await assert.rejects(worker.process(row.id));
    else await worker.process(row.id);
  }
  await worker.process(row.id);
  assert.equal(sent, 3);
  const stored = (
    await pg.query<any>("SELECT * FROM notification_deliveries WHERE id=$1", [
      row.id,
    ])
  ).rows[0];
  assert.equal(stored.status, "FAILED");
  assert.equal(stored.attempts, 3);
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int count FROM notification_attempts WHERE delivery_id=$1",
        [row.id],
      )
    ).rows[0].count,
    3,
  );
  assert.equal((await detail(f)).passengers[0].delivery_validated_at, null);
});

test("reavaliação dispensa cobrança já atendida e acesso revogado antes do envio", async () => {
  const first = await queuedNotification();
  let sent = 0;
  first.push.send = async () => {
    sent++;
    return "ticket";
  };
  await confirm(first.f, "responsavel").expect(201);
  await first.worker.process(first.row.id);
  assert.equal(sent, 0);
  assert.equal(
    (
      await pg.query<any>(
        "SELECT status FROM notification_deliveries WHERE id=$1",
        [first.row.id],
      )
    ).rows[0].status,
    "SUPPRESSED",
  );
  const second = await queuedNotification();
  second.push.send = first.push.send;
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [second.f.student],
  );
  await second.worker.process(second.row.id);
  assert.equal(sent, 0);
  assert.equal(
    (
      await pg.query<any>(
        "SELECT status FROM notification_deliveries WHERE id=$1",
        [second.row.id],
      )
    ).rows[0].status,
    "SUPPRESSED",
  );
});

test("token inválido desativa aparelho e troca de conta não herda envios antigos", async () => {
  const first = await queuedNotification();
  first.push.send = async () => {
    throw new PushFailure("DeviceNotRegistered", false);
  };
  await first.worker.process(first.row.id);
  assert.equal(
    (
      await pg.query<any>(
        "SELECT active FROM push_devices WHERE installation_id=$1",
        [first.installationId],
      )
    ).rows[0].active,
    false,
  );
  const second = await queuedNotification();
  let sent = 0;
  second.push.send = async () => {
    sent++;
    return "ticket";
  };
  const device = (
    await pg.query<any>("SELECT * FROM push_devices WHERE installation_id=$1", [
      second.installationId,
    ])
  ).rows[0];
  await api("escola", "post", "/notifications/devices", {
    installationId: second.installationId,
    token: device.token,
  }).expect(201);
  await second.worker.process(second.row.id);
  assert.equal(sent, 0);
  assert.equal(
    (
      await pg.query<any>(
        "SELECT status FROM notification_deliveries WHERE id=$1",
        [second.row.id],
      )
    ).rows[0].status,
    "SUPPRESSED",
  );
  await api("responsavel", "post", "/notifications/devices", {
    installationId: randomUUID(),
    token: "https://attacker.test",
  }).expect(400);
});

test("dispositivo sem sessão vigente não recebe envio e registro repetido preserva sua geração", async () => {
  const { row, worker, push, installationId } = await queuedNotification();
  let sent = 0;
  push.send = async () => {
    sent++;
    return "ticket";
  };
  const device = (
    await pg.query<any>("SELECT * FROM push_devices WHERE installation_id=$1", [
      installationId,
    ])
  ).rows[0];
  await api("responsavel", "post", "/notifications/devices", {
    installationId,
    token: device.token,
  }).expect(201);
  const repeated = (
    await pg.query<any>("SELECT * FROM push_devices WHERE installation_id=$1", [
      installationId,
    ])
  ).rows[0];
  assert.equal(
    new Date(repeated.registered_at).getTime(),
    new Date(device.registered_at).getTime(),
  );
  await pg.query(
    "UPDATE push_devices SET session_hash='revoked-test-session' WHERE installation_id=$1",
    [installationId],
  );
  await worker.process(row.id);
  assert.equal(sent, 0);
});

test("dois contextos da mesma pessoa preservam suas caixas, com um push por evento e aparelho", async () => {
  const { f, row } = await queuedNotification("RETURN");
  const notifications = (
    await pg.query<any>(
      `SELECT n.id,m.role,n.purpose FROM notifications n
    JOIN notification_events e ON e.id=n.event_id JOIN memberships m ON m.id=n.membership_id
    WHERE e.passenger_id=$1 AND n.user_id=$2`,
      [f.passenger, users.responsavel.id],
    )
  ).rows;
  assert.equal(notifications.length, 2);
  assert(notifications.some((n) => n.role === "GUARDIAN"));
  assert(notifications.some((n) => n.role === "SCHOOL"));
  const count = (
    await pg.query<{ count: number }>(
      "SELECT count(*)::int count FROM notification_deliveries WHERE event_id=$1 AND device_id=$2",
      [row.event_id, row.device_id],
    )
  ).rows[0].count;
  assert.equal(count, 1);
  const chosen = notifications.find((n) => n.id === row.notice_id);
  assert.equal(chosen.role, "SCHOOL");
  assert.equal(chosen.purpose, "ACTION");
});

test("recibo ausente tem tentativas limitadas e estado desconhecido sem reenviar a mensagem", async () => {
  const { row, worker, push } = await queuedNotification();
  let sends = 0;
  push.send = async () => {
    sends++;
    return "ticket-without-receipt";
  };
  push.receipt = async () => null;
  await worker.process(row.id);
  for (let i = 0; i < 4; i++) {
    await pg.query(
      "UPDATE notification_deliveries SET next_attempt_at=now() WHERE id=$1",
      [row.id],
    );
    if (i < 3) await assert.rejects(worker.process(row.id, true));
    else await worker.process(row.id, true);
  }
  await worker.process(row.id, true);
  assert.equal(sends, 1);
  const stored = (
    await pg.query<any>(
      "SELECT status,receipt_attempts FROM notification_deliveries WHERE id=$1",
      [row.id],
    )
  ).rows[0];
  assert.equal(stored.status, "RECEIPT_UNKNOWN");
  assert.equal(stored.receipt_attempts, 4);
});

test("push desabilitado mantém a atualização na central sem anunciar envio", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  app.get(ExpoPush).enabled = () => false;
  while (await app.get(NotificationWorker).dispatch()) {}
  const n = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.find((n: any) => n.target.passengerId === f.passenger);
  assert.equal(n.pushNote, "DISABLED");
  assert.equal(n.deliveries.length, 0);
  assert.equal(n.pending, true);
  assert.equal(n.readAt, null);
});

async function alertPolicy(
  reminderMinutes = 5,
  attentionMinutes = 10,
  criticalMinutes = 15,
) {
  const opts = (await api("motorista", "get", "/alerts/options").expect(200))
    .body;
  return (
    await api("motorista", "post", "/alerts/policy", {
      expectedRevision: opts.policy?.revision || 0,
      reminderMinutes,
      attentionMinutes,
      criticalMinutes,
    }).expect(201)
  ).body;
}
async function alertsFor(f: Fixture, who = "responsavel", closed = false) {
  return (
    await api(who, "get", "/alerts?closed=" + closed).expect(200)
  ).body.items.filter((a: any) => a.passenger_id === f.passenger);
}
async function alertDetail(id: string, who = "responsavel") {
  return (await api(who, "get", "/alerts/" + id).expect(200)).body;
}
function alertAction(
  id: string,
  who: string,
  type: string,
  note = "Contato de teste realizado com as partes envolvidas e fatos verificados presencialmente.",
) {
  return {
    expect: async (status: number) => {
      const detail = await alertDetail(id, who);
      return api(who, "post", `/alerts/${id}/actions`, {
        expectedVersion: detail.alert.version,
        type,
        note,
      }).expect(status);
    },
  };
}
function advance(minutes: number) {
  now = new Date(new Date("2026-10-22T15:00:00Z").getTime() + minutes * 60000);
  return app.get(AlertsService).sweep();
}

test("intervalos exigem transporte, valores crescentes e revisão; nenhuma ausência total é inferida", async () => {
  now = new Date("2026-10-22T15:00:00Z");
  const input = {
    expectedRevision: 0,
    reminderMinutes: 5,
    attentionMinutes: 10,
    criticalMinutes: 15,
  };
  await api("escola", "post", "/alerts/policy", input).expect(403);
  await api("responsavel", "post", "/alerts/policy", input).expect(403);
  await api("motorista", "post", "/alerts/policy", {
    ...input,
    attentionMinutes: 5,
  }).expect(400);
  await alertPolicy();
  await api("motorista", "post", "/alerts/policy", input).expect(409);
  const f = await fixture();
  await advance(60);
  assert.equal((await alertsFor(f)).length, 0);
  now = new Date("2026-10-22T15:00:00Z");
});

test("5/10/15 minutos, leitura e atendimento não reiniciam relógio; replay e processamento não duplicam níveis", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  let a = (await alertsFor(f)).find(
    (a: any) => a.kind === "CONFIRMATION_PENDING",
  );
  assert(a);
  const origin = a.origin_at;
  await advance(4);
  assert.equal((await alertDetail(a.id)).alert.level, 0);
  await advance(5);
  let d = await alertDetail(a.id);
  assert.equal(d.alert.level, 1);
  const list = (await api("responsavel", "get", "/notifications").expect(200))
    .body.items;
  const n = list.find((n: any) => n.target.alertId === a.id);
  assert(n);
  assert.equal(n.pending, true);
  await api("responsavel", "post", `/notifications/${n.id}/read`, {}).expect(
    201,
  );
  await alertAction(a.id, "responsavel", "ASSUMED").expect(201);
  await advance(10);
  d = await alertDetail(a.id);
  assert.equal(d.alert.level, 2);
  assert.equal(d.alert.status, "IN_REVIEW");
  assert.equal(d.alert.origin_at, origin);
  await advance(15);
  d = await alertDetail(a.id);
  assert.equal(d.alert.level, 3);
  assert.equal(d.alert.routing_status, "UNDEFINED_BOARDING");
  const version = d.alert.version;
  await confirm(f, f.driver).expect(201);
  await app.get(AlertsService).sweep();
  await app.get(AlertsService).sweep();
  d = await alertDetail(a.id);
  assert.equal(d.alert.version, version);
  assert.equal(
    d.history.filter((e: any) => e.type === "LEVEL_REACHED").length,
    3,
  );
  assert.equal(d.alert.origin_at, origin);
  now = new Date("2026-10-22T15:00:00Z");
});

test("crítico na escola alcança coordenação; responsável que já agiu não é cobrado pelo motorista", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  await confirm(f, "operacao", "ALIGHTING").expect(201);
  await advance(15);
  const a = (await alertsFor(f)).find(
    (a: any) =>
      a.kind === "CONFIRMATION_PENDING" && a.movement_kind === "ALIGHTING",
  );
  assert.equal(a.routing_status, "ASSIGNED");
  const coord = (
    await api("escola", "get", "/notifications").expect(200)
  ).body.items.find(
    (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
  );
  assert(coord);
  assert.equal(coord.pending, false);
  const operation = (await api("operacao", "get", "/notifications").expect(200))
    .body.items;
  assert(
    !operation.some(
      (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
    ),
  );
  const driver = (
    await api(f.driver, "get", "/notifications").expect(200)
  ).body.items.find(
    (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
  );
  assert.equal(driver.pending, true);
  await alertAction(a.id, "operacao", "ASSUMED").expect(403);
  await alertAction(a.id, "escola", "ASSUMED").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  const d = await alertDetail(a.id);
  assert.equal(d.alert.status, "RESOLVED");
  assert.equal(d.alert.resolution_kind, "NORMAL_CONFIRMATIONS");
  const n = (
    await api("escola", "get", "/notifications/" + coord.id).expect(200)
  ).body.notification;
  assert.equal(n.pending, false);
  now = new Date("2026-10-22T15:00:00Z");
});

test("crítico em casa atualiza responsável que já recebeu e cobra somente motorista faltante", async () => {
  const f = await fixture("RETURN");
  await confirm(f, f.driver).expect(201);
  await confirm(f, "escola").expect(201);
  await confirm(f, "responsavel", "ALIGHTING").expect(201);
  await advance(15);
  const a = (await alertsFor(f)).find(
    (a: any) =>
      a.kind === "CONFIRMATION_PENDING" && a.movement_kind === "ALIGHTING",
  );
  assert.equal(a.routing_status, "ASSIGNED");
  const n = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.find(
    (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
  );
  assert(n);
  assert.equal(n.pending, false);
  assert.match(n.body, /motorista/);
  const driver = (
    await api(f.driver, "get", "/notifications").expect(200)
  ).body.items.find(
    (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
  );
  assert.equal(driver.pending, true);
  now = new Date("2026-10-22T15:00:00Z");
});

test("configuração nova não altera prazo capturado; reconciliação usa o primeiro fato mesmo após reinício", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  let a = (await alertsFor(f))[0];
  const due = a.next_due_at;
  await alertPolicy(6, 12, 18);
  a = (await alertDetail(a.id)).alert;
  assert.equal(a.next_due_at, due);
  assert.equal(a.policy_snapshot.critical_minutes, 15);
  // Simula perda do agendamento Redis: o estado e os prazos continuam no PostgreSQL.
  await advance(16);
  assert.equal((await alertDetail(a.id)).alert.level, 3);
  now = new Date("2026-10-22T15:00:00Z");
  await alertPolicy();
});

test("contato e leitura não resolvem sequência incompleta; encerramento exige fatos e coordenação", async () => {
  const f = await fixture();
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  let a = (await alertsFor(f)).find(
    (a: any) => a.kind === "SEQUENCE_INCOMPLETE",
  );
  assert(a);
  await alertAction(a.id, "escola", "RESOLVED").expect(403);
  await alertAction(a.id, "escola", "CONTACT").expect(201);
  await alertAction(a.id, "escola", "VERIFICATION").expect(201);
  await alertAction(a.id, "escola", "RESOLVED").expect(403);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  assert.equal((await alertDetail(a.id)).alert.status, "OPEN");
  await alertAction(a.id, "operacao", "RESOLVED").expect(403);
  await alertAction(
    a.id,
    "escola",
    "RESOLVED",
    "Recebimento e embarque validados pelas partes; contato e verificação física registrados para encerrar o acompanhamento.",
  ).expect(201);
  const d = await alertDetail(a.id);
  assert.equal(d.alert.status, "RESOLVED");
  assert.equal(d.journey.passenger.issues[0].status, "RESOLVED");
  assert.equal(d.journey.passenger.movements[0].confirmations.length, 2);
});

test("relato manual abre crítico imediato, é idempotente e mantém recebimento sob verificação", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  const body = {
    id: randomUUID(),
    tripId: f.id,
    passengerId: f.passenger,
    movementKind: "ALIGHTING",
    kind: "RECEIPT_DISPUTED",
    note: "Recebimento contestado em teste isolado; preservar todas as confirmações anteriores para apuração.",
  };
  await api("responsavel", "post", "/alerts/report", body).expect(201);
  assert.equal(
    (await api("responsavel", "post", "/alerts/report", body).expect(201)).body
      .unchanged,
    true,
  );
  const d = await alertDetail(body.id);
  assert.equal(d.alert.level, 3);
  assert.equal(d.alert.status, "OPEN");
  assert.equal(d.journey.passenger.deliveryUnderReview, true);
  assert.equal(d.journey.passenger.possiblyOnboard, true);
  assert.equal(d.journey.passenger.movements[1].confirmations.length, 2);
  assert.equal((await detail(f)).counts.pendingDelivery, 1);
  assert.equal(d.history.filter((e: any) => e.type === "REPORTED").length, 1);
  await api("responsavel", "post", "/alerts/report", {
    ...body,
    id: randomUUID(),
  }).expect(409);
  await api("outraescola", "get", "/alerts/" + body.id).expect(404);
  await alertAction(body.id, "responsavel", "RESOLVED").expect(403);
});

test("risco sem confirmações não fabrica eventos, e revogação bloqueia leitura e ação", async () => {
  const f = await fixture();
  const body = {
    id: randomUUID(),
    tripId: f.id,
    passengerId: f.passenger,
    movementKind: "ALIGHTING",
    kind: "NOT_LOCATED",
    note: "Criança não localizada após contato e busca presencial no cenário isolado de teste.",
  };
  await api("responsavel", "post", "/alerts/report", body).expect(201);
  const d = await alertDetail(body.id);
  assert.equal(d.alert.level, 3);
  assert.equal(d.journey.passenger.movements[1].confirmations.length, 0);
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [f.student],
  );
  await api("responsavel", "get", "/alerts/" + body.id).expect(404);
  await api("responsavel", "post", `/alerts/${body.id}/actions`, {
    expectedVersion: 1,
    type: "CONTACT",
    note: body.note,
  }).expect(404);
  assert(
    !(await api("responsavel", "get", "/alerts").expect(200)).body.items.some(
      (a: any) => a.id === body.id,
    ),
  );
});

test("corrida entre vencimento e segunda confirmação deixa caso resolvido sem cobrança ativa", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const a = (await alertsFor(f))[0];
  now = new Date("2026-10-22T15:15:00Z");
  await Promise.all([
    app.get(AlertsService).evaluate(a.id),
    confirm(f, "responsavel").expect(201),
  ]);
  const d = await alertDetail(a.id);
  assert.equal(d.alert.status, "RESOLVED");
  const list = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.filter((n: any) => n.target.alertId === a.id);
  assert(list.every((n: any) => !n.pending));
  now = new Date("2026-10-22T15:00:00Z");
});

test("sem coordenação ativa registra falta de destinatário, e habilitação posterior reencaminha sem reiniciar prazo", async () => {
  const members = (
    await pg.query<any>(
      "SELECT id,coordinator FROM memberships WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    )
  ).rows;
  const f = await fixture();
  await confirm(f, "operacao", "ALIGHTING").expect(201);
  try {
    await pg.query(
      "UPDATE memberships SET coordinator=false WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    );
    await advance(15);
    const a = (await alertsFor(f)).find(
      (a: any) => a.kind === "CONFIRMATION_PENDING",
    );
    assert.equal(a.routing_status, "NO_CRITICAL_RECIPIENT");
    const original = a.origin_at;
    await pg.query("UPDATE memberships SET coordinator=true WHERE id=$1", [
      users.escola.context,
    ]);
    await app.get(AlertsService).evaluate(a.id);
    const current = (await alertDetail(a.id)).alert;
    assert.equal(current.routing_status, "ASSIGNED");
    assert.equal(current.origin_at, original);
    assert.equal(current.level, 3);
    const events = (await alertDetail(a.id)).history;
    assert(events.some((e: any) => e.details.reason === "RECIPIENTS_UPDATED"));
    await app.get(AlertsService).evaluate(a.id);
    assert.equal((await alertDetail(a.id)).history.length, events.length);
  } finally {
    for (const m of members)
      await pg.query("UPDATE memberships SET coordinator=$2 WHERE id=$1", [
        m.id,
        m.coordinator,
      ]);
  }
});

test("motorista substituto recebe crítico vigente e autor anterior perde o envio, preservando origem", async () => {
  const f = await fixture("RETURN");
  await confirm(f, "responsavel", "ALIGHTING").expect(201);
  await advance(15);
  const a = (await alertsFor(f)).find(
      (a: any) => a.kind === "CONFIRMATION_PENDING",
    ),
    replacement = await newDriver(),
    t = await detail(f);
  await api(f.driver, "patch", `/trips/${f.id}/assignment`, {
    expectedVersion: t.version,
    driverId: users[replacement].context,
    vehicleId: t.vehicle_id,
    reason:
      "Substituição justificada durante acompanhamento de alerta crítico no teste isolado.",
  }).expect(200);
  await app.get(AlertsService).evaluate(a.id);
  const list = (await api(replacement, "get", "/notifications").expect(200))
    .body.items;
  const n = list.find(
    (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
  );
  assert(n);
  assert.equal(n.pending, true);
  const d = await alertDetail(a.id);
  assert.equal(d.alert.origin_at, a.origin_at);
  assert.equal(d.alert.level, 3);
});

test("duas pessoas não sobrescrevem atendimento assumido concorrente", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const a = (await alertsFor(f))[0];
  const body = {
    expectedVersion: a.version,
    type: "ASSUMED",
    note: "Assumo o acompanhamento com contato direto e verificação dos fatos registrados nesta ocorrência.",
  };
  const responses = await Promise.all([
    api("responsavel", "post", `/alerts/${a.id}/actions`, body),
    api(f.driver, "post", `/alerts/${a.id}/actions`, body),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await alertDetail(a.id)).history.filter((e: any) => e.type === "ASSUMED")
      .length,
    1,
  );
});

test("relato crítico continua reavaliando destinatários mesmo sem política de tempo configurada", async () => {
  const policy = (
    await pg.query<any>("SELECT * FROM alert_policies WHERE transport_id=$1", [
      users.motorista.organization,
    ])
  ).rows[0];
  const members = (
    await pg.query<any>(
      "SELECT id,coordinator FROM memberships WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    )
  ).rows;
  try {
    await pg.query("DELETE FROM alert_policies WHERE transport_id=$1", [
      users.motorista.organization,
    ]);
    await pg.query(
      "UPDATE memberships SET coordinator=false WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    );
    const f = await fixture(),
      body = {
        id: randomUUID(),
        tripId: f.id,
        passengerId: f.passenger,
        movementKind: "ALIGHTING",
        kind: "NOT_LOCATED",
        note: "Relato crítico de teste sem configuração de intervalo; as verificações continuam em acompanhamento.",
      };
    await api("responsavel", "post", "/alerts/report", body).expect(201);
    assert.equal(
      (await alertDetail(body.id)).alert.routing_status,
      "NO_CRITICAL_RECIPIENT",
    );
    await pg.query("UPDATE memberships SET coordinator=true WHERE id=$1", [
      users.escola.context,
    ]);
    await app.get(AlertsService).sweep();
    const d = await alertDetail(body.id);
    assert.equal(d.alert.routing_status, "ASSIGNED");
    assert.equal(d.alert.level, 3);
    assert.equal(d.alert.policy_snapshot, null);
  } finally {
    for (const m of members)
      await pg.query("UPDATE memberships SET coordinator=$2 WHERE id=$1", [
        m.id,
        m.coordinator,
      ]);
    await pg.query(
      "INSERT INTO alert_policies(transport_id,reminder_minutes,attention_minutes,critical_minutes,revision,changed_by,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        policy.transport_id,
        policy.reminder_minutes,
        policy.attention_minutes,
        policy.critical_minutes,
        policy.revision,
        policy.changed_by,
        policy.changed_at,
      ],
    );
  }
});

async function closureBody(f: Fixture, extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    expectedVersion: (await detail(f)).version,
    walkedInterior: true,
    checkedSeats: true,
    checkedHidingPlaces: true,
    vanEmpty: true,
    ...extra,
  };
}
const closeTrip = (f: Fixture, body: unknown, who = f.driver) =>
  api(who, "post", `/trips/${f.id}/close`, body);
async function fullJourney(f: Fixture) {
  const returning = (await detail(f)).direction === "RETURN";
  await confirm(f, f.driver).expect(201);
  await confirm(f, returning ? "escola" : "responsavel").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  await confirm(f, returning ? "responsavel" : "escola", "ALIGHTING").expect(
    201,
  );
}

test("encerrar sem eventos preserva pendência individual e cria crítico imediato sem inventar confirmação", async () => {
  const f = await fixture();
  const body = await closureBody(f);
  const r = await closeTrip(f, body).expect(201);
  assert.equal(r.body.status, "ROUTE_ENDED_OPEN");
  const t = await detail(f);
  assert.equal(t.closure.ready, false);
  assert.equal(t.closure.pending.length, 1);
  assert.equal(t.closure.pending[0].accounted, false);
  assert.equal(
    t.passengers[0].movements.reduce(
      (n: number, m: any) => n + m.confirmations.length,
      0,
    ),
    0,
  );
  const a = (await alertsFor(f)).find(
    (a: any) => a.kind === "ROUTE_END_PENDING",
  );
  assert.equal(a.level, 3);
  assert.equal(a.routing_status, "ASSIGNED");
  assert.equal((await alertDetail(a.id)).alert.actions.canResolve, false);
  const notices = (await api("escola", "get", "/notifications").expect(200))
    .body.items;
  assert(
    notices.some(
      (n: any) => n.target.alertId === a.id && n.title.startsWith("Crítico"),
    ),
  );
  const replay = await closeTrip(f, body).expect(201);
  assert.equal(replay.body.unchanged, true);
  assert.equal((await detail(f)).closure.inspections.length, 1);
  await closeTrip(f, {
    ...body,
    note: "Não pode alterar a conferência que já foi registrada.",
  }).expect(409);
  await app.get(AlertsService).sweep();
  assert.equal((await alertDetail(a.id)).alert.status, "OPEN");
});

test("quatro confirmações e conferência física concluem sem liberar a reserva da criança nem reescrever autores", async () => {
  const f = await fixture();
  await fullJourney(f);
  const before = await detail(f);
  assert.equal(before.closure.ready, true);
  assert.equal(before.status, "IN_PROGRESS");
  const body = await closureBody(f);
  await closeTrip(f, body)
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
  const t = await detail(f);
  assert.equal(t.completed_at, now.toISOString());
  assert.equal(t.closure.inspections[0].actor_name, before.driver_name);
  assert.equal(t.passengers[0].active, true);
  assert.deepEqual(
    t.passengers[0].movements.map((m: any) => m.confirmations),
    before.passengers[0].movements.map((m: any) => m.confirmations),
  );
  assert(t.passengers[0].movements.every((m: any) => !m.canConfirm));
  assert(
    (
      await pg.query<any>("SELECT locked_at FROM daily_plans WHERE id=$1", [
        t.passengers[0].plan_id,
      ])
    ).rows[0].locked_at,
  );
  await closeTrip(f, await closureBody(f)).expect(409);
  await closeTrip(f, body).expect(201);
});

test("uma confirmação de desembarque impede conclusão e van vazia não apaga divergência", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  const first = await detail(f);
  await closeTrip(f, await closureBody(f)).expect(201);
  let t = await detail(f);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.passengers[0].delivery_validated_at, null);
  const a = (await alertsFor(f)).find(
    (a: any) => a.kind === "CONFIRMATION_PENDING",
  );
  assert.equal(a.level, 3);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  t = await detail(f);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.ready, true);
  assert.equal(t.closure.inspections.length, 1);
  const originalConfirmation =
    first.passengers[0].movements[1].confirmations[0];
  assert.deepEqual(
    t.passengers[0].movements[1].confirmations.find(
      (c: any) => c.id === originalConfirmation.id,
    ),
    originalConfirmation,
  );
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
});

test("ausência verificada após término contabiliza criança sem evento e exige nova conferência, inclusive após meia-noite", async () => {
  const f = await fixture();
  await closeTrip(f, await closureBody(f)).expect(201);
  const before = await detail(f),
    original = before.closure.inspections[0];
  now = new Date("2026-10-23T05:00:00Z");
  await api(f.driver, "patch", `/trips/${f.id}/passengers/${f.passenger}`, {
    expectedVersion: before.version,
    disposition: "NOT_TRANSPORTED",
    reason:
      "Ausência verificada diretamente com a família e sem qualquer transporte desta criança.",
  }).expect(200);
  let t = await detail(f);
  assert.equal(t.closure.ready, true);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.inspections[0].result, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.inspections[0].id, original.id);
  const a = (await alertsFor(f, "responsavel", true)).find(
    (a: any) => a.kind === "ROUTE_END_PENDING",
  );
  assert.equal(a.resolution_kind, "VERIFIED_ABSENCE");
  await closeTrip(f, await closureBody(f)).expect(201);
  t = await detail(f);
  assert.equal(t.status, "COMPLETED");
  assert.equal(t.route_ended_at, before.route_ended_at);
  assert.equal(t.closure.inspections.length, 2);
  assert.equal(t.closure.notTransported, 1);
  assert.equal(
    t.passengers[0].movements.reduce(
      (n: number, m: any) => n + m.confirmations.length,
      0,
    ),
    0,
  );
});

test("conferência incompleta, contexto indevido, versão vencida e viagem não iniciada são rejeitados", async () => {
  const f = await fixture(),
    body = await closureBody(f);
  await closeTrip(f, { ...body, checkedSeats: false }).expect(400);
  await closeTrip(f, { ...body, walkedInterior: false }).expect(400);
  await closeTrip(f, { ...body, checkedHidingPlaces: false }).expect(400);
  await closeTrip(f, { ...body, vanEmpty: false }).expect(400);
  await closeTrip(f, body, "responsavel").expect(403);
  await closeTrip(f, body, "escola").expect(403);
  await closeTrip(f, body, "motorista").expect(403);
  await closeTrip(f, body, "outraescola").expect(403);
  await confirm(f, f.driver).expect(201);
  await closeTrip(f, body).expect(409);
  assert.equal((await detail(f)).closure.inspections.length, 0);
  const planned = await fixture("OUTBOUND", false);
  await closeTrip(planned, await closureBody(planned)).expect(409);
});

test("van com segurança não assegurada mantém trajeto aberto mesmo com todas as entregas validadas", async () => {
  const f = await fixture();
  await fullJourney(f);
  await closeTrip(
    f,
    await closureBody(f, {
      vanEmpty: false,
      note: "Verificação física ainda não assegurou que o interior está livre de crianças.",
    }),
  ).expect(201);
  let t = await detail(f);
  assert.equal(t.closure.ready, true);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.inspections[0].van_empty, false);
  await closeTrip(f, await closureBody(f)).expect(201);
  t = await detail(f);
  assert.equal(t.status, "COMPLETED");
  assert.equal(t.closure.inspections[1].van_empty, false);
});

test("confirmações recebidas após término não concluem automaticamente nem permitem substituir embarque por ausência", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await closeTrip(f, await closureBody(f)).expect(201);
  await api(f.driver, "patch", `/trips/${f.id}/passengers/${f.passenger}`, {
    expectedVersion: (await detail(f)).version,
    disposition: "NOT_TRANSPORTED",
    reason: "Ausência não pode apagar o embarque já registrado pelo motorista.",
  }).expect(409);
  now = new Date("2026-10-23T05:00:00Z");
  await confirm(f, "responsavel").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  await confirm(f, "escola", "ALIGHTING").expect(201);
  const t = await detail(f);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.ready, true);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
});

test("recebimento contestado e sequência incompleta impedem conclusão apesar das quatro confirmações", async () => {
  const f = await fixture();
  await confirm(f, "escola", "ALIGHTING").expect(201);
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  await api("responsavel", "post", "/alerts/report", {
    id: randomUUID(),
    tripId: f.id,
    passengerId: f.passenger,
    movementKind: "ALIGHTING",
    kind: "RECEIPT_DISPUTED",
    note: "Cenário isolado de recebimento contestado para validar bloqueio da conclusão normal da viagem.",
  }).expect(201);
  await closeTrip(f, await closureBody(f)).expect(201);
  const t = await detail(f);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.pending[0].accounted, true);
  assert.equal(t.passengers[0].deliveryUnderReview, true);
  const alerts = await alertsFor(f);
  assert(alerts.every((a: any) => a.level === 3));
  assert(alerts.some((a: any) => a.kind === "SEQUENCE_INCOMPLETE"));
  assert(alerts.some((a: any) => a.kind === "RECEIPT_DISPUTED"));
  const family = await detail(f, "responsavel");
  assert.equal(family.closure.canInspect, false);
  assert.equal(family.closure.inspections[0].note, undefined);
});

test("encerramentos concorrentes não duplicam conferência nem alertas", async () => {
  const f = await fixture(),
    body = await closureBody(f);
  const responses = await Promise.all([
    closeTrip(f, body),
    closeTrip(f, { ...body, id: randomUUID() }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await detail(f)).closure.inspections.length, 1);
  assert.equal(
    (await alertsFor(f)).filter((a: any) => a.kind === "ROUTE_END_PENDING")
      .length,
    1,
  );
});

test("recursos permanecem reservados no trajeto aberto e ficam disponíveis após conclusão", async () => {
  const f = await fixture("RETURN");
  const next = await fixture("OUTBOUND", false),
    original = await detail(f),
    planned = await detail(next);
  await api(f.driver, "patch", `/trips/${next.id}/assignment`, {
    expectedVersion: planned.version,
    driverId: users[f.driver].context,
    vehicleId: original.vehicle_id,
    reason:
      "Planejamento de outro trecho com os mesmos recursos para validar liberação somente após conclusão.",
  }).expect(200);
  await closeTrip(f, await closureBody(f)).expect(201);
  let t = await detail(next);
  await api(f.driver, "post", `/trips/${next.id}/start`, {
    expectedVersion: t.version,
  }).expect(409);
  const a = (await alertsFor(f)).find(
    (a: any) => a.kind === "ROUTE_END_PENDING",
  );
  assert.equal(a.counterpart_role, "GUARDIAN");
  assert.equal(a.routing_status, "ASSIGNED");
  await fullJourney(f);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
  t = await detail(next);
  await api(f.driver, "post", `/trips/${next.id}/start`, {
    expectedVersion: t.version,
  }).expect(201);
});

test("resumo final filtra crianças e notas de conferência pela escola e pelo vínculo familiar", async () => {
  const f = await fixture(),
    foreign = await fixture(
      "OUTBOUND",
      false,
      undefined,
      users.outraescola.organization,
      false,
    );
  const other = await detail(foreign),
    privateName = other.passengers[0].student_name;
  await api(foreign.driver, "post", `/trips/${foreign.id}/cancel`, {
    expectedVersion: other.version,
    reason:
      "Cancelamento da preparação isolada para incluir o passageiro em viagem com escolas diferentes.",
  }).expect(201);
  await api(f.driver, "post", `/trips/${f.id}/passengers`, {
    expectedVersion: (await detail(f)).version,
    planId: other.passengers[0].plan_id,
    reason:
      "Inclusão excepcional de outra escola em viagem compartilhada para validar isolamento do resumo final.",
  }).expect(201);
  await closeTrip(
    f,
    await closureBody(f, {
      note: `Observação reservada ao transporte sobre ${privateName}, sem dados visíveis à outra família.`,
    }),
  ).expect(201);
  assert.equal((await detail(f)).closure.total, 2);
  for (const who of ["responsavel", "escola", "outraescola"]) {
    const scoped = await detail(f, who);
    assert.equal(scoped.closure.total, 1);
    assert.equal(scoped.closure.pending.length, 1);
    assert.equal(scoped.closure.inspections[0].note, undefined);
    assert.equal(scoped.closure.canInspect, false);
  }
  const family = await detail(f, "responsavel");
  assert.equal(family.closure.pending[0].id, f.passenger);
  assert(!JSON.stringify(family).includes(privateName));
});
