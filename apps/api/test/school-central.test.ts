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

async function approveBoardingCorrection(f: Fixture) {
  const d = await hist(f, f.driver);
  const original = d.confirmations.find(
    (c: any) => c.actor_id === users[f.driver].id && c.kind === "BOARDING",
  );
  assert(original, "confirmação original de embarque disponível");
  const body = {
    id: randomUUID(),
    expectedVersion: d.trip.version,
    confirmationId: original.id,
    reason: evidence.reason,
    account:
      "Este embarque foi informado por engano; o fato original deve permanecer visível no histórico.",
  };
  await requestCorrection(f, body).expect(201);
  await decideCorrection(f, body.id, {
    expectedVersion: 1,
    decision: "APPROVED",
    ...evidence,
  }).expect(201);
  return original.id;
}
async function action(id: string, type: string, status = 201) {
  const d = await alertDetail(id, "escola");
  return api("escola", "post", `/alerts/${id}/actions`, {
    expectedVersion: d.alert.version,
    type,
    note: evidence.verification,
  }).expect(status);
}
async function alertRow(f: Fixture, kind: string, movementKind = "ALIGHTING") {
  const rows = (
    await pg.query<any>(
      `SELECT a.* FROM alert_cases a JOIN movements m ON m.id=a.movement_id
     WHERE m.passenger_id=$1 AND a.kind=$2 AND m.kind=$3 AND a.status<>'RESOLVED'`,
      [f.passenger, kind, movementKind],
    )
  ).rows;
  assert.equal(rows.length, 1);
  return rows[0];
}
async function criticalNotifications(caseId: string) {
  return (
    await pg.query<any>(
      `SELECT n.*,e.details FROM notifications n JOIN notification_events e ON e.id=n.event_id
     WHERE e.alert_id=$1 AND e.kind='ALERT_LEVEL' AND (e.details->>'level')::int=3`,
      [caseId],
    )
  ).rows;
}
async function critical(f: Fixture) {
  await pg.query(
    `INSERT INTO alert_policies(transport_id,reminder_minutes,attention_minutes,critical_minutes,changed_by)
     VALUES($1,5,10,15,$2) ON CONFLICT(transport_id) DO NOTHING`,
    [users.motorista.organization, users.motorista.id],
  );
  await confirm(f, "operacao").expect(201);
  now = new Date("2026-10-22T15:15:00Z");
  await app.get(AlertsService).sweep();
  return alertRow(f, "CONFIRMATION_PENDING", "BOARDING");
}

test("central escolar recebe primeiro em um POST e replay devolve resumo vigente sem duplicar fatos", async () => {
  const f = await fixture();
  const first = (await confirm(f, "operacao", "ALIGHTING").expect(201)).body;
  assert.equal(first.unchanged, false);
  assert.equal(first.state, "INFORMED");
  assert.equal(first.passenger.id, f.passenger);
  assert.equal(
    first.passenger.movements[1].confirmations[0].actorId,
    users.operacao.id,
  );
  assert.equal(first.passenger.movements[1].canConfirm, false);
  assert.equal(first.passenger.movements[0].confirmations.length, 0);
  assert.equal(first.passenger.issues[0].kind, "SEQUENCE_INCOMPLETE");
  const originalTime = first.passenger.alighting_informed_at;
  const replay = (await confirm(f, "operacao", "ALIGHTING").expect(201)).body;
  assert.equal(replay.unchanged, true);
  assert.equal(replay.id, first.id);
  assert.equal(replay.tripVersion, first.tripVersion);
  assert.equal(replay.passenger.alighting_informed_at, originalTime);
  assert.equal(replay.passenger.movements[1].confirmations.length, 1);
  await confirm(f, "escola", "ALIGHTING").expect(409);
  const second = (await confirm(f, f.driver, "ALIGHTING").expect(201)).body;
  assert.equal(second.state, "VALIDATED");
  assert.equal(second.tripVersion, first.tripVersion + 1);
  assert.equal(second.passenger.movements[1].confirmations.length, 2);
  assert.equal(second.passenger.issues[0].status, "OPEN");
  assert.equal(
    (
      await pg.query<any>(
        "SELECT count(*)::int n FROM movement_confirmations WHERE movement_id=$1",
        [first.id],
      )
    ).rows[0].n,
    2,
  );
});

test("escola entrega primeiro na volta e somente o motorista completa o outro lado", async () => {
  const f = await fixture("RETURN");
  const first = (await confirm(f, "operacao").expect(201)).body;
  assert.equal(first.passenger.movements[0].counterpartRole, "SCHOOL");
  assert.deepEqual(first.passenger.movements[0].missingRoles, ["DRIVER"]);
  await confirm(f, "escola").expect(409);
  const second = (await confirm(f, f.driver).expect(201)).body;
  assert.equal(second.state, "VALIDATED");
  const replay = (await confirm(f, "operacao").expect(201)).body;
  assert.equal(replay.state, "VALIDATED");
  assert.equal(replay.tripVersion, second.tripVersion);
  const planned = await fixture("RETURN", false);
  const p = (await detail(planned, "operacao")).passengers[0];
  assert.equal(p.movements[0].canConfirm, false);
  assert.match(p.movements[0].blockedReason, /motorista iniciar/);
  await confirm(planned, "operacao").expect(409);
});

test("desembarque após correção de embarque usa confirmações vigentes e abre sequência incompleta", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  const original = await approveBoardingCorrection(f);
  const first = (await confirm(f, "operacao", "ALIGHTING").expect(201)).body;
  assert(first.passenger.boarding_validated_at, "data original preservada");
  assert.equal(first.passenger.movements[0].state, "INFORMED");
  assert.equal(
    first.passenger.movements[0].confirmations.find(
      (c: any) => c.id === original,
    ).correctionStatus,
    "APPROVED",
  );
  assert.equal(first.passenger.issues.length, 1);
  assert.equal(
    first.passenger.issues[0].details.boardingConfirmationsAtDetection,
    1,
  );
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  const a = await alertRow(f, "SEQUENCE_INCOMPLETE");
  await action(a.id, "CONTACT");
  await action(a.id, "VERIFICATION");
  assert.equal(
    (await alertDetail(a.id, "escola")).alert.actions.canResolve,
    false,
  );
  await action(a.id, "RESOLVED", 403);
  assert.equal((await detail(f)).closure.ready, false);
});

test("correção posterior impede encerramento normal apesar das duas datas históricas e mostra invalidação na jornada", async () => {
  const f = await fixture();
  await confirm(f, "operacao", "ALIGHTING").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  await confirm(f, f.driver).expect(201);
  await confirm(f, "responsavel").expect(201);
  const a = await alertRow(f, "SEQUENCE_INCOMPLETE");
  await action(a.id, "CONTACT");
  await action(a.id, "VERIFICATION");
  assert.equal(
    (await alertDetail(a.id, "escola")).alert.actions.canResolve,
    true,
  );
  await approveBoardingCorrection(f);
  const d = await alertDetail(a.id, "escola");
  assert(d.alert.boarding_validated_at);
  assert(d.alert.delivery_validated_at);
  assert.equal(d.alert.actions.canResolve, false);
  assert(
    d.journey.timeline.some(
      (item: any) => item.title === "Confirmação invalidada por correção",
    ),
  );
  await action(a.id, "RESOLVED", 403);
});

test("contabilização excepcional fica fora das entregas normais mesmo com desembarque validado", async () => {
  const f = await fixture();
  await confirm(f, "operacao", "ALIGHTING").expect(201);
  await confirm(f, f.driver, "ALIGHTING").expect(201);
  assert.equal((await detail(f)).counts.delivered, 1);
  await exceptional(f, await exceptionBody(f)).expect(201);
  const d = await detail(f);
  assert.equal(d.passengers[0].movements[1].state, "VALIDATED");
  assert.equal(d.counts.delivered, 0);
  assert.equal(d.closure.exceptional, 1);
  const replay = (await confirm(f, "operacao", "ALIGHTING").expect(201)).body;
  assert.equal(replay.unchanged, true);
  assert.equal(replay.passenger.movementState, "EXCEPTIONALLY_ACCOUNTED");
  assert.equal(replay.tripVersion, d.version);
});

test("crítico de embarque na volta acompanha coordenação própria e cobra somente motorista faltante", async () => {
  const f = await fixture("RETURN");
  const a = await critical(f);
  assert.equal(a.routing_status, "ASSIGNED");
  const ns = await criticalNotifications(a.id);
  const coord = ns.find((n: any) => n.membership_id === users.escola.context);
  assert(coord);
  assert.equal(coord.purpose, "UPDATE");
  assert.equal(coord.requires_coordination, true);
  assert.equal(
    ns.find((n: any) => n.membership_id === users[f.driver].context).purpose,
    "ACTION",
  );
  assert(!ns.some((n: any) => n.membership_id === users.operacao.context));
  assert(!ns.some((n: any) => n.membership_id === users.outraescola.context));
  const version = a.version;
  await app.get(AlertsService).evaluate(a.id);
  assert.equal(
    (await alertRow(f, "CONFIRMATION_PENDING", "BOARDING")).version,
    version,
  );
  assert.equal((await criticalNotifications(a.id)).length, ns.length);
});

test("encaminhamento antigo é atualizado com a mesma impressão de destinatários sem duplicar avisos ou reiniciar prazo", async () => {
  const f = await fixture("RETURN");
  const a = await critical(f);
  await pg.query(
    "UPDATE alert_cases SET routing_status='UNDEFINED_BOARDING' WHERE id=$1",
    [a.id],
  );
  await pg.query(
    "DELETE FROM notifications n USING notification_events e WHERE n.event_id=e.id AND e.alert_id=$1 AND n.membership_id=$2 AND (e.details->>'level')::int=3",
    [a.id, users.escola.context],
  );
  const before = await criticalNotifications(a.id);
  assert.equal(
    before.filter((n: any) => n.membership_id === users[f.driver].context)
      .length,
    1,
  );
  await app.get(AlertsService).evaluate(a.id);
  const updated = await alertRow(f, "CONFIRMATION_PENDING", "BOARDING");
  assert.equal(updated.routing_status, "ASSIGNED");
  assert.equal(String(updated.origin_at), String(a.origin_at));
  assert.equal(updated.recipient_fingerprint, a.recipient_fingerprint);
  assert.equal(updated.level, a.level);
  assert.equal(updated.next_due_at, a.next_due_at);
  const ns = await criticalNotifications(a.id);
  assert.equal(
    ns.filter((n: any) => n.membership_id === users[f.driver].context).length,
    1,
  );
  assert.equal(
    ns.filter((n: any) => n.membership_id === users.escola.context).length,
    1,
  );
  const count = ns.length;
  await app.get(AlertsService).evaluate(a.id);
  assert.equal((await criticalNotifications(a.id)).length, count);
});

test("ausência e revogação da coordenação sinalizam destinatário faltante sem parar cobrança ao motorista", async () => {
  const members = (
    await pg.query<any>(
      "SELECT id,coordinator FROM memberships WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    )
  ).rows;
  try {
    await pg.query(
      "UPDATE memberships SET coordinator=false WHERE organization_id=$1 AND role='SCHOOL'",
      [users.escola.organization],
    );
    const f = await fixture("RETURN"),
      a = await critical(f);
    assert.equal(a.routing_status, "NO_CRITICAL_RECIPIENT");
    const ns = await criticalNotifications(a.id);
    assert.equal(
      ns.find((n: any) => n.membership_id === users[f.driver].context).purpose,
      "ACTION",
    );
    await pg.query("UPDATE memberships SET coordinator=true WHERE id=$1", [
      users.escola.context,
    ]);
    await app.get(AlertsService).evaluate(a.id);
    const updated = await alertRow(f, "CONFIRMATION_PENDING", "BOARDING");
    assert.equal(updated.routing_status, "ASSIGNED");
    assert.equal(String(updated.origin_at), String(a.origin_at));
    const notices = await criticalNotifications(a.id),
      coord = notices.find(
        (n: any) => n.membership_id === users.escola.context,
      );
    assert(coord);
    assert.equal(
      notices.filter((n: any) => n.membership_id === users[f.driver].context)
        .length,
      1,
    );
    await pg.query("UPDATE memberships SET coordinator=false WHERE id=$1", [
      users.escola.context,
    ]);
    await app.get(AlertsService).evaluate(a.id);
    assert.equal(
      (await alertRow(f, "CONFIRMATION_PENDING", "BOARDING")).routing_status,
      "NO_CRITICAL_RECIPIENT",
    );
    await api("escola", "get", `/notifications/${coord.id}`).expect(404);
  } finally {
    for (const m of members)
      await pg.query("UPDATE memberships SET coordinator=$2 WHERE id=$1", [
        m.id,
        m.coordinator,
      ]);
  }
});
