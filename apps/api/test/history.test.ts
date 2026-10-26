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

async function alertDetail(id: string, who = "responsavel") {
  return (await api(who, "get", "/alerts/" + id).expect(200)).body;
}
const hist = async (f: Fixture, who = "motorista") =>
  (await api(who, "get", "/history/" + f.passenger).expect(200)).body;
const evidence = {
  reason:
    "Correção verificada com as partes, mantendo identificável o registro original da movimentação.",
  contacts:
    "Contato direto de teste com motorista, escola e responsável para identificar os fatos registrados.",
  verification:
    "Verificação física de teste identifica a criança em segurança e a sua destinação com pessoa autorizada.",
};
async function correctionBody(f: Fixture, who = f.driver) {
  const d = await hist(f, who);
  return {
    id: randomUUID(),
    expectedVersion: d.trip.version,
    confirmationId: d.confirmations.find(
      (c: any) => c.actor_id === users[who].id,
    ).id,
    reason: evidence.reason,
    account:
      "O clique foi equivocado; este relato registra os fatos corretos sem editar a confirmação original.",
  };
}
const requestCorrection = (f: Fixture, body: unknown, who = f.driver) =>
  api(who, "post", `/history/${f.passenger}/corrections`, body);
const decideCorrection = (
  f: Fixture,
  id: string,
  body: unknown,
  who = "escola",
) =>
  api(who, "post", `/history/${f.passenger}/corrections/${id}/decision`, body);
async function exceptionBody(f: Fixture, extra: Record<string, unknown> = {}) {
  const d = await hist(f, "escola");
  return {
    id: randomUUID(),
    expectedVersion: d.trip.version,
    ...evidence,
    physicalCheck: true,
    outcome: "DELIVERED",
    recipientId: d.recipients[0]?.id,
    ...extra,
  };
}
const exceptional = (f: Fixture, body: unknown, who = "escola") =>
  api(who, "post", `/history/${f.passenger}/exceptional-resolution`, body);

test("histórico filtra data, criança e viagem e não expõe criança de outra escola ou família", async () => {
  const f = await fixture(),
    foreign = await fixture(
      "RETURN",
      true,
      undefined,
      users.outraescola.organization,
      false,
    );
  await confirm(f, f.driver).expect(201);
  const query = `/history?from=${date}&to=${date}&studentId=${f.student}&tripId=${f.id}`;
  const items = (await api("responsavel", "get", query).expect(200)).body.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, f.passenger);
  await api("responsavel", "get", "/history/" + foreign.passenger).expect(404);
  await api("outraescola", "get", "/history/" + f.passenger).expect(404);
  await api("escola", "get", "/history?from=2026-01-01&to=2026-10-22").expect(
    400,
  );
  await api("escola", "get", "/history?from=2026-10-23&to=2026-10-22").expect(
    400,
  );
  await api(
    "escola",
    "get",
    "/history?from=2026-10-22&to=2026-10-22&offset=-1",
  ).expect(400);
  const original = (await hist(f)).confirmations[0];
  assert.equal(
    original.actor_name,
    users[f.driver] && (await detail(f)).driver_name,
  );
  assert.equal(
    (await hist(f, "responsavel")).confirmations[0].canRequestCorrection,
    false,
  );
});

test("somente o autor solicita correção e replay preserva um pedido, uma ocorrência e a confirmação original", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const original = (await hist(f)).confirmations[0],
    body = await correctionBody(f);
  await requestCorrection(f, body, "responsavel").expect(403);
  await requestCorrection(f, { ...body, actorId: users[f.driver].id }).expect(
    400,
  );
  await requestCorrection(f, body).expect(201);
  await requestCorrection(f, body)
    .expect(201)
    .then((r) => assert.equal(r.body.unchanged, true));
  const d = await hist(f);
  assert.equal(d.corrections.length, 1);
  assert.equal(
    d.alerts.filter((a: any) => a.kind === "CORRECTION_CONFLICT").length,
    1,
  );
  assert.equal(d.confirmations[0].id, original.id);
  assert.equal(d.confirmations[0].actor_name, original.actor_name);
  assert.equal(d.confirmations[0].received_at, original.received_at);
  assert.equal(d.passenger.deliveryUnderReview, true);
  await requestCorrection(f, {
    ...body,
    account: "Outra versão não pode sobrescrever a solicitação original.",
  }).expect(409);
  const a = d.alerts.find((a: any) => a.kind === "CORRECTION_CONFLICT");
  assert.equal(a.level, 3);
  assert.equal(
    (await alertDetail(a.id, "escola")).alert.routing_status,
    "ASSIGNED",
  );
  assert.equal(
    (await alertDetail(a.id, "escola")).alert.actions.canResolve,
    false,
  );
});

test("correção de viagem concluída abre revisão, mantém inspeção original e exige tratamento e nova conferência", async () => {
  const f = await fixture();
  await fullJourney(f);
  await closeTrip(f, await closureBody(f)).expect(201);
  const before = await detail(f),
    body = await correctionBody(f);
  await requestCorrection(f, body).expect(201);
  let d = await hist(f);
  assert.equal(d.trip.status, "COMPLETED_REVIEW");
  assert.equal(d.trip.completed_at, before.completed_at);
  assert.equal(d.inspections.length, 1);
  const input = {
    expectedVersion: d.corrections[0].version,
    decision: "APPROVED",
    ...evidence,
  };
  await decideCorrection(f, body.id, input, f.driver).expect(403);
  await decideCorrection(f, body.id, input, "operacao").expect(403);
  await decideCorrection(f, body.id, input, "outraescola").expect(404);
  await exceptional(f, await exceptionBody(f)).expect(409);
  await decideCorrection(f, body.id, input).expect(201);
  d = await hist(f);
  assert.equal(d.corrections[0].status, "APPROVED");
  const correctedKind = d.confirmations.find(
    (c: any) => c.id === body.confirmationId,
  ).kind;
  assert.equal(
    d.passenger.movements.find((m: any) => m.kind === correctedKind).state,
    "INFORMED",
  );
  assert.equal(d.trip.status, "COMPLETED_REVIEW");
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED_REVIEW"));
  await exceptional(f, await exceptionBody(f)).expect(201);
  let t = await detail(f);
  assert.equal(t.closure.exceptional, 1);
  const updates = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items.filter(
    (n: any) =>
      n.target.passengerId === f.passenger &&
      n.title === "Contabilização excepcional",
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].pending, false);
  assert.match(updates[0].body, /não equivale à dupla confirmação normal/);
  assert.equal(t.closure.delivered, 0);
  assert.equal(t.closure.ready, true);
  assert.equal(t.status, "COMPLETED_REVIEW");
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
  t = await detail(f);
  assert.equal(t.closure.inspections.length, 3);
  assert.equal((await hist(f)).confirmations.length, 4);
  assert.equal(
    (await hist(f)).corrections[0].confirmation_id,
    body.confirmationId,
  );
});

test("rejeição pela coordenação conserva confirmações normais sem concluir automaticamente", async () => {
  const f = await fixture();
  await fullJourney(f);
  await closeTrip(f, await closureBody(f)).expect(201);
  const body = await correctionBody(f, "escola");
  await requestCorrection(f, body, "escola").expect(201);
  const d = await hist(f);
  await decideCorrection(f, body.id, {
    expectedVersion: 1,
    decision: "REJECTED",
    ...evidence,
  }).expect(201);
  const t = await detail(f);
  assert.equal(t.status, "COMPLETED_REVIEW");
  assert.equal(t.closure.ready, true);
  assert.equal(t.closure.exceptional, 0);
  assert.equal(
    (await hist(f)).corrections[0].decision_actor_name,
    "Marina Costa",
  );
  await exceptional(f, await exceptionBody(f)).expect(409);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
});

test("resolução excepcional contabiliza sem fabricar confirmação nem anunciar entrega validada pelas partes", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await closeTrip(f, await closureBody(f)).expect(201);
  const body = await exceptionBody(f);
  await exceptional(f, body, f.driver).expect(403);
  await exceptional(f, body, "operacao").expect(403);
  await exceptional(f, body).expect(201);
  await exceptional(f, body)
    .expect(201)
    .then((r) => assert.equal(r.body.unchanged, true));
  const d = await hist(f),
    t = await detail(f);
  assert.equal(d.confirmations.length, 1);
  assert.equal(d.passenger.delivery_validated_at, null);
  assert.equal(d.passenger.movementState, "EXCEPTIONALLY_ACCOUNTED");
  assert.equal(d.passenger.possiblyOnboard, false);
  assert.equal(t.status, "ROUTE_ENDED_OPEN");
  assert.equal(t.closure.ready, true);
  assert.equal(t.closure.delivered, 0);
  assert.equal(t.closure.exceptional, 1);
  assert(
    d.alerts.every(
      (a: any) =>
        a.status === "RESOLVED" &&
        a.resolution_kind === "EXCEPTIONAL_ACCOUNTING",
    ),
  );
  await confirm(f, "responsavel").expect(409);
  await app.get(AlertsService).sweep();
  assert.equal(
    (await hist(f)).alerts.filter((a: any) => a.status !== "RESOLVED").length,
    0,
  );
  await exceptional(f, {
    ...body,
    reason:
      "Outra justificativa não pode sobrescrever uma resolução excepcional já persistida.",
  }).expect(409);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED"));
});

test("resolução exige evidências, recebedor autorizado e não permite substituir movimentação vigente por ausência", async () => {
  const f = await fixture("RETURN");
  await confirm(f, f.driver).expect(201);
  const body = await exceptionBody(f);
  await exceptional(f, { ...body, physicalCheck: false }).expect(400);
  await exceptional(f, { ...body, contacts: "curto" }).expect(400);
  await exceptional(f, {
    ...body,
    recipientId: users.outraescola.context,
  }).expect(400);
  await exceptional(f, {
    ...body,
    outcome: "NOT_TRANSPORTED",
    recipientId: undefined,
  }).expect(409);
  await exceptional(f, {
    ...body,
    recipientId: users.responsavel.context,
  }).expect(201);
  const d = await hist(f);
  assert.equal(d.resolutions[0].recipient_name, "Ana Menezes");
  assert.equal(d.confirmations.length, 1);
  const absent = await fixture();
  await exceptional(
    absent,
    await exceptionBody(absent, {
      outcome: "NOT_TRANSPORTED",
      recipientId: undefined,
    }),
  ).expect(201);
  assert.equal((await hist(absent)).confirmations.length, 0);
  assert.equal((await detail(absent)).closure.exceptional, 1);
});

test("fato de risco novo invalida contabilização excepcional anterior e mantém ambas as verificações no histórico", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await exceptional(f, await exceptionBody(f)).expect(201);
  const original = (await hist(f)).resolutions[0];
  await api("responsavel", "post", "/alerts/report", {
    id: randomUUID(),
    tripId: f.id,
    passengerId: f.passenger,
    movementKind: "ALIGHTING",
    kind: "RECEIPT_DISPUTED",
    note: "Novo relato de risco após contabilização excepcional exige nova verificação sem apagar a resolução anterior.",
  }).expect(201);
  let d = await hist(f);
  assert.equal(d.resolutions[0].current, false);
  assert.equal(d.resolutions[0].id, original.id);
  assert.equal(d.passenger.exceptionalResolution, null);
  assert.equal(d.passenger.deliveryUnderReview, true);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "ROUTE_ENDED_OPEN"));
  await exceptional(f, await exceptionBody(f)).expect(201);
  d = await hist(f);
  assert.equal(d.resolutions.length, 2);
  assert.equal(d.resolutions[1].current, true);
});

test("autores das duas partes podem solicitar correções independentes da mesma movimentação", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  const first = await correctionBody(f);
  await requestCorrection(f, first).expect(201);
  const second = await correctionBody(f, "responsavel");
  await requestCorrection(f, second, "responsavel").expect(201);
  const d = await hist(f);
  assert.equal(d.corrections.length, 2);
  assert.equal(
    d.alerts.filter((a: any) => a.kind === "CORRECTION_CONFLICT").length,
    2,
  );
  await decideCorrection(f, first.id, {
    expectedVersion: 1,
    decision: "APPROVED",
    ...evidence,
  }).expect(201);
  await decideCorrection(f, second.id, {
    expectedVersion: 1,
    decision: "APPROVED",
    ...evidence,
  }).expect(201);
  await exceptional(
    f,
    await exceptionBody(f, {
      outcome: "NOT_TRANSPORTED",
      recipientId: undefined,
    }),
  ).expect(201);
  assert.equal((await hist(f)).confirmations.length, 2);
  assert.equal((await detail(f)).closure.ready, true);
});

test("decisões e resoluções concorrentes não sobrescrevem autoria nem duplicam contabilização", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const body = await correctionBody(f);
  await requestCorrection(f, body).expect(201);
  const outcomes = await Promise.all([
    decideCorrection(f, body.id, {
      expectedVersion: 1,
      decision: "APPROVED",
      ...evidence,
    }),
    decideCorrection(f, body.id, {
      expectedVersion: 1,
      decision: "REJECTED",
      ...evidence,
    }),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
  const before = await hist(f),
    value = await exceptionBody(f);
  const responses = await Promise.all([
    exceptional(f, value),
    exceptional(f, { ...value, id: randomUUID() }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await hist(f)).resolutions.length, 1);
  assert.equal(
    (await hist(f)).corrections[0].status,
    before.corrections[0].status,
  );
});

test("revogação de coordenação e vínculos bloqueia decisões e histórico sem apagar registros", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  const body = await correctionBody(f);
  await requestCorrection(f, body).expect(201);
  const exceptionalInput = await exceptionBody(f);
  await pg.query("UPDATE memberships SET coordinator=false WHERE id=$1", [
    users.escola.context,
  ]);
  try {
    await decideCorrection(f, body.id, {
      expectedVersion: 1,
      decision: "APPROVED",
      ...evidence,
    }).expect(403);
  } finally {
    await pg.query("UPDATE memberships SET coordinator=true WHERE id=$1", [
      users.escola.context,
    ]);
  }
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [f.student],
  );
  await api("responsavel", "get", "/history/" + f.passenger).expect(404);
  await pg.query("UPDATE operating_links SET status='INACTIVE' WHERE id=$1", [
    f.link,
  ]);
  await api("escola", "get", "/history/" + f.passenger).expect(404);
  assert.equal((await hist(f)).confirmations.length, 1);
  assert.equal((await hist(f)).corrections.length, 1);
  await exceptional(f, exceptionalInput).expect(404);
});

test("revisão histórica não ocupa os recursos de outra viagem atual e opções não inventam contingência ou exportação", async () => {
  const f = await fixture();
  await fullJourney(f);
  await closeTrip(f, await closureBody(f)).expect(201);
  await requestCorrection(f, await correctionBody(f)).expect(201);
  const next = await fixture("RETURN", false),
    t = await detail(next),
    old = await detail(f);
  await api(f.driver, "patch", `/trips/${next.id}/assignment`, {
    expectedVersion: t.version,
    driverId: users[f.driver].context,
    vehicleId: old.vehicle_id,
    reason:
      "Uso de recursos atuais independente da revisão documental de viagem já concluída.",
  }).expect(200);
  await api(f.driver, "post", `/trips/${next.id}/start`, {
    expectedVersion: (await detail(next)).version,
  }).expect(201);
  const opts = (await api("responsavel", "get", "/history/options").expect(200))
    .body;
  assert.equal(opts.canConfigure, false);
  assert.match(opts.retention, /D-11/);
  assert.match(opts.offlineProcedure, /Não há fila offline/);
});

test("filtro de criança usa a identificação estável após mudança de nome, preservando os nomes históricos", async () => {
  const f = await fixture(),
    before = await detail(f),
    name = "Nome atualizado para consulta histórica";
  await pg.query(
    "UPDATE students SET name=$2,normalized_name=lower($2) WHERE id=$1",
    [f.student, name],
  );
  const options = (
    await api(
      "motorista",
      "get",
      `/trips/options?date=${date}&direction=RETURN`,
    ).expect(200)
  ).body;
  const plan = options.plans.find((p: any) => p.student_id === f.student);
  await api("motorista", "post", "/trips", {
    id: randomUUID(),
    date,
    direction: "RETURN",
    driverId: users[f.driver].context,
    vehicleId: before.vehicle_id,
    planIds: [plan.id],
    exceptionReason:
      "Inclusão autorizada em outro trecho após atualização do nome no cadastro.",
  }).expect(201);
  const students = (
    await api("responsavel", "get", "/history/options").expect(200)
  ).body.students.filter((s: any) => s.id === f.student);
  assert.equal(students.length, 1);
  assert.equal(students[0].name, name);
  assert.equal(
    (await hist(f)).passenger.student_name,
    before.passengers[0].student_name,
  );
});

test("responsável pode contestar depois da conclusão excepcional mesmo sem confirmação própria para corrigir", async () => {
  const f = await fixture();
  await exceptional(f, await exceptionBody(f)).expect(201);
  await closeTrip(f, await closureBody(f)).expect(201);
  const before = await detail(f, "responsavel");
  assert.equal(before.status, "COMPLETED");
  assert.equal(before.passengers[0].canReportRisk, true);
  await api("responsavel", "post", "/alerts/report", {
    id: randomUUID(),
    tripId: f.id,
    passengerId: f.passenger,
    movementKind: "ALIGHTING",
    kind: "RECEIPT_DISPUTED",
    note: "Contestação posterior ao encerramento excepcional, sem confirmação do responsável para solicitar retificação.",
  }).expect(201);
  const d = await hist(f);
  assert.equal(d.trip.status, "COMPLETED_REVIEW");
  assert.equal(d.trip.completed_at, before.completed_at);
  assert.equal(d.confirmations.length, 0);
  assert.equal(d.resolutions[0].current, false);
  assert.equal(d.passenger.deliveryUnderReview, true);
  await closeTrip(f, await closureBody(f))
    .expect(201)
    .then((r) => assert.equal(r.body.status, "COMPLETED_REVIEW"));
});
