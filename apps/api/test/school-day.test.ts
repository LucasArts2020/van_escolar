import "./environment";
import "reflect-metadata";
import { after, afterEach, before, test } from "node:test";
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
import type { SchoolDay } from "../../shared/school-day";

let app: INestApplication,
  pg: PGlite,
  linkId = "",
  studentId = "";
let now = new Date("2026-10-22T15:00:00Z");
const date = "2026-10-23";
type Account = {
  token: string;
  context: string;
  organization: string;
  id: string;
};
const users: Record<string, Account> = {};
const days = (outbound = true, returning = true) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    outbound,
    return: returning,
  }));

function api(
  who: string,
  method: "get" | "post" | "put" | "patch",
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
async function day(dayDate = date, who = "escola"): Promise<SchoolDay> {
  return (await api(who, "get", "/school/day?date=" + dayDate).expect(200))
    .body;
}
const row = (result: SchoolDay, link = linkId, direction = "OUTBOUND") => {
  const found = result.rows.find(
    (r) => r.operating_link_id === link && r.direction === direction,
  );
  assert(found, "linha autorizada do vínculo e trecho está disponível");
  return found;
};
async function extraLink(
  school = users.escola.organization,
  transport = users.motorista.organization,
) {
  const student = randomUUID(),
    link = randomUUID();
  await pg.query(
    "INSERT INTO students(id,name,normalized_name,owner_organization_id,created_by) VALUES($1,'Sofia Menezes','sofia menezes',$2,$3)",
    [student, school, users.escola.id],
  );
  await pg.query(
    "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$3,'ACTIVE',$5,$5)",
    [link, student, school, transport, users.escola.id],
  );
  return { student, link };
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
  for (const who of [
    "escola",
    "operacao",
    "motorista",
    "responsavel",
    "outraescola",
  ]) {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Client", "mobile")
      .send({ email: who + "@demo.local", password: demoPassword })
      .expect(201);
    const me = (
      await request(app.getHttpServer())
        .get("/auth/me")
        .auth(login.body.token, { type: "bearer" })
        .expect(200)
    ).body;
    const context =
      who === "responsavel"
        ? me.contexts.find((c: any) => c.role === "GUARDIAN")
        : me.contexts[0];
    users[who] = {
      token: login.body.token,
      context: context.id,
      organization: context.organization_id,
      id: me.user.id,
    };
  }
  const link = (
    await api("responsavel", "get", "/planning/options").expect(200)
  ).body.links[0];
  linkId = link.id;
  studentId = link.student_id;
});
afterEach(() => {
  now = new Date("2026-10-22T15:00:00Z");
});
after(async () => {
  await app?.close();
  await pg?.close();
});

test("central usa a data do servidor e prevê a rotina sem gerar fatos, viagens ou veículos", async () => {
  const initial = (
    await pg.query<any>(
      "SELECT (SELECT count(*)::int FROM daily_plans) plans,(SELECT count(*)::int FROM audit_events) events",
    )
  ).rows[0];
  const board = (await api("operacao", "get", "/school/day").expect(200))
    .body as SchoolDay;
  assert.equal(board.date, "2026-10-22");
  assert.equal(board.today, "2026-10-22");
  assert.equal(board.tomorrow, date);
  assert.equal(board.serverNow, now.toISOString());
  assert.equal(board.trips.length, 0);
  const predicted = row(board);
  assert.equal(predicted.planning.source, "ROUTINE");
  assert.equal(predicted.planning.status, "ROUTINE_EXPECTED");
  assert.equal(predicted.planning.planId, null);
  assert.equal(predicted.trip_id, null);
  assert.equal(predicted.passenger_id, null);
  assert(!("vehicle_id" in predicted));
  assert(!("canConfirm" in predicted));
  const final = (
    await pg.query<any>(
      "SELECT (SELECT count(*)::int FROM daily_plans) plans,(SELECT count(*)::int FROM audit_events) events",
    )
  ).rows[0];
  assert.deepEqual(final, initial);
  await api("escola", "get", "/school/day?date=2026-02-31").expect(400);
  await api("motorista", "get", "/school/day").expect(403);
  await api("responsavel", "get", "/school/day").expect(403);
});

test("persistência prevalece sobre rotina atual; ida e volta mantêm respostas independentes", async () => {
  const prior = row(await day());
  const generated = await Promise.all([
    api("motorista", "post", "/planning/generate", { date, linkId }),
    api("responsavel", "post", "/planning/generate", { date, linkId }),
  ]);
  assert(generated.every((r) => r.status === 201));
  assert.equal(
    generated.reduce((n, r) => n + r.body.created, 0),
    2,
  );
  const current = await day();
  const outbound = row(current);
  assert.equal(outbound.id, prior.id);
  assert.equal(outbound.planning.source, "PERSISTED");
  assert.equal(outbound.planning.status, "AWAITING_RESPONSE");
  await api(
    "responsavel",
    "post",
    `/planning/plans/${outbound.planning.planId}/respond`,
    { use: true, expectedVersion: outbound.planning.version },
  ).expect(201);
  const routine = (
    await api("responsavel", "get", "/planning/routines/" + linkId).expect(200)
  ).body;
  await api("responsavel", "put", "/planning/routines/" + linkId, {
    expectedRevision: routine.revision,
    days: days(false, false),
  }).expect(200);
  const refreshed = await day();
  assert.equal(row(refreshed).planning.status, "CONFIRMED");
  assert.equal(row(refreshed).planning.scheduled, true);
  assert.equal(
    row(refreshed, linkId, "RETURN").planning.status,
    "AWAITING_RESPONSE",
  );
  assert.equal(row(refreshed, linkId, "RETURN").planning.scheduled, true);
  const future = row(await day("2026-10-24"));
  assert.equal(future.planning.source, "ROUTINE");
  assert.equal(future.planning.status, "NOT_EXPECTED");
  assert.equal(future.planning.scheduled, false);
});

test("pedido tardio é exibido sem substituir o uso vigente nem criar decisão escolar", async () => {
  now = new Date("2026-10-22T22:00:00Z");
  const existing = row(await day());
  await api(
    "responsavel",
    "post",
    `/planning/plans/${existing.planning.planId}/respond`,
    {
      use: false,
      expectedVersion: existing.planning.version,
      reason: "Mudança familiar a verificar pelo transporte autorizado.",
    },
  ).expect(201);
  const pending = row(await day());
  assert.equal(pending.planning.status, "CONFIRMED");
  assert.equal(pending.planning.pendingChange?.requestedUsage, false);
  assert(pending.planning.pendingChange?.requestedAt);
  await api(
    "operacao",
    "patch",
    "/planning/changes/" + pending.planning.pendingChange!.id,
    { action: "ACCEPT" },
  ).expect(403);
  assert.equal(row(await day()).planning.status, "CONFIRMED");
});

test("passado sem registro não usa a rotina atual; planejamento histórico permanece consultável", async () => {
  const past = row(await day("2026-10-21"));
  assert.equal(past.planning.source, "UNAVAILABLE");
  assert.equal(past.planning.status, "NO_HISTORICAL_PLAN");
  assert.equal(past.planning.scheduled, null);
  now = new Date("2026-10-24T15:00:00Z");
  const historical = row(await day(date));
  assert.equal(historical.planning.source, "PERSISTED");
  assert.equal(historical.planning.status, "CONFIRMED");
  assert.equal(historical.planning.scheduled, true);
  assert(historical.planning.pendingChange);
});

test("não uso expresso é distinto de rotina sem previsão e o relógio considera o fuso da operação", async () => {
  now = new Date("2026-10-23T01:30:00Z");
  const local = (await api("escola", "get", "/school/day").expect(200)).body;
  assert.equal(local.today, "2026-10-22");
  assert.equal(row(local).today, "2026-10-22");
  now = new Date("2026-10-23T15:00:00Z");
  const future = "2026-10-24";
  await api("responsavel", "post", "/planning/generate", {
    date: future,
    linkId,
  }).expect(201);
  const before = row(await day(future));
  assert.equal(before.planning.status, "NOT_EXPECTED");
  await api(
    "responsavel",
    "post",
    `/planning/plans/${before.planning.planId}/respond`,
    { use: false, expectedVersion: before.planning.version },
  ).expect(201);
  const after = row(await day(future));
  assert.equal(after.planning.status, "NOT_USING");
  assert.equal(after.planning.source, "PERSISTED");
  assert.equal(
    row(await day(future), linkId, "RETURN").planning.status,
    "NOT_EXPECTED",
  );
});

test("ausência de rotina e de política não equivale a resposta negativa ou sem uso previsto", async () => {
  const missingRoutine = await extraLink();
  let board = await day();
  assert.equal(
    row(board, missingRoutine.link).planning.status,
    "MISSING_CONFIGURATION",
  );
  assert.deepEqual(
    row(board, missingRoutine.link).planning.missingConfiguration,
    ["ROUTINE"],
  );
  await api("motorista", "post", "/planning/generate", {
    date,
    linkId: missingRoutine.link,
  }).expect(201);
  board = await day();
  const persisted = row(board, missingRoutine.link);
  assert.equal(persisted.planning.source, "PERSISTED");
  assert.equal(persisted.planning.status, "MISSING_CONFIGURATION");
  const unconfiguredTransport = randomUUID();
  await pg.query(
    "INSERT INTO organizations(id,name,kind) VALUES($1,'Transporte sem política','TRANSPORT')",
    [unconfiguredTransport],
  );
  const missingPolicy = await extraLink(
    users.escola.organization,
    unconfiguredTransport,
  );
  await pg.query(
    "INSERT INTO weekly_routines(id,operating_link_id,revision,days,changed_by) VALUES($1,$2,1,$3,$4)",
    [
      randomUUID(),
      missingPolicy.link,
      JSON.stringify(days()),
      users.responsavel.id,
    ],
  );
  const noPolicy = row(await day(), missingPolicy.link);
  assert.equal(noPolicy.planning.status, "MISSING_CONFIGURATION");
  assert.deepEqual(noPolicy.planning.missingConfiguration, ["POLICY"]);
  assert.equal(noPolicy.planning.planId, null);
});

test("homônimos e vínculos de transportes diferentes têm identidade distinta e escolas isoladas", async () => {
  const foreign = await extraLink(users.outraescola.organization);
  const secondTransport = randomUUID();
  await pg.query(
    "INSERT INTO organizations(id,name,kind) VALUES($1,'Outro transporte','TRANSPORT')",
    [secondTransport],
  );
  const sameChildLink = randomUUID();
  await pg.query(
    "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$3,'ACTIVE',$5,$5)",
    [
      sameChildLink,
      studentId,
      users.escola.organization,
      secondTransport,
      users.escola.id,
    ],
  );
  const board = await day();
  assert(!board.rows.some((r) => r.operating_link_id === foreign.link));
  const sameChild = board.rows.filter(
    (r) => r.student_id === studentId && r.direction === "OUTBOUND",
  );
  assert.equal(sameChild.length, 2);
  assert.notEqual(sameChild[0].id, sameChild[1].id);
  assert.equal(new Set(board.rows.map((r) => r.id)).size, board.rows.length);
  const foreignBoard = await day(date, "outraescola");
  assert.equal(foreignBoard.rows.length, 2);
  assert(foreignBoard.rows.every((r) => r.operating_link_id === foreign.link));
});

test("preparação preenche a mesma linha com van real e confirmações mantêm permissões e ocorrências", async () => {
  now = new Date("2026-10-23T15:00:00Z");
  const outstanding = row(await day()).planning.pendingChange;
  await api("responsavel", "patch", "/planning/changes/" + outstanding!.id, {
    action: "WITHDRAW",
  }).expect(200);
  const before = row(await day());
  const vehicle = (
    await api(
      "motorista",
      "get",
      `/trips/options?date=${date}&direction=OUTBOUND`,
    ).expect(200)
  ).body.vehicles[0];
  const id = randomUUID();
  await api("motorista", "post", "/trips", {
    id,
    date,
    direction: "OUTBOUND",
    driverId: users.motorista.context,
    vehicleId: vehicle.id,
    planIds: [before.planning.planId],
  }).expect(201);
  const prepared = await day();
  const assigned = row(prepared);
  assert.equal(assigned.id, before.id);
  assert.equal(prepared.rows.filter((r) => r.id === before.id).length, 1);
  assert.equal(assigned.trip_id, id);
  assert(assigned.passenger_id);
  const trip = prepared.trips.find((t) => t.id === id)!;
  assert.equal(trip.vehicle_id, vehicle.id);
  assert.equal(trip.vehicle_plate, vehicle.plate);
  assert.equal(trip.passengers[0].movements[1].canConfirm, false);
  assert.match(
    trip.passengers[0].movements[1].blockedReason!,
    /motorista iniciar/,
  );
  await api("operacao", "post", `/trips/${id}/start`, {
    expectedVersion: trip.version,
  }).expect(403);
  await api("motorista", "post", `/trips/${id}/start`, {
    expectedVersion: trip.version,
  }).expect(201);
  const response = await api(
    "operacao",
    "post",
    `/trips/${id}/passengers/${assigned.passenger_id}/movements/ALIGHTING/confirm`,
    {},
  ).expect(201);
  const refreshed = await day();
  const passenger = refreshed.trips
    .find((t) => t.id === id)!
    .passengers.find((p) => p.id === assigned.passenger_id)!;
  assert.deepEqual(passenger.movements, response.body.passenger.movements);
  assert.equal(passenger.movements[1].state, "INFORMED");
  assert.equal(passenger.issues[0].kind, "SEQUENCE_INCOMPLETE");
  assert.equal(row(refreshed).planning.status, "CONFIRMED");
  assert.equal(row(refreshed).planning.pendingChange, null);
  await pg.query("UPDATE operating_links SET status='INACTIVE' WHERE id=$1", [
    linkId,
  ]);
  const revoked = await day();
  assert(!revoked.rows.some((r) => r.operating_link_id === linkId));
  assert(!revoked.trips.some((t) => t.id === id));
});

test("revogação do funcionário remove a central sem afetar o acesso da coordenação", async () => {
  await pg.query("UPDATE memberships SET active=false WHERE id=$1", [
    users.operacao.context,
  ]);
  await api("operacao", "get", "/school/day").expect(403);
  await api("escola", "get", "/school/day").expect(200);
});

test("central destaca críticos antigos, conta além da prévia e respeita escola e vínculo revogado", async () => {
  // Isolated historical fixtures: the read must not project or rewrite these past facts.
  const historicalDate = "2026-10-20";
  const selectedDate = "2026-10-26";
  const trip = randomUUID();
  const vehicle = (await pg.query<any>("SELECT * FROM vehicles LIMIT 1"))
    .rows[0];
  await pg.query(
    `INSERT INTO trips(id,transport_id,service_date,direction,timezone,status,driver_membership_id,driver_user_id,driver_name,vehicle_id,vehicle_name,vehicle_plate,capacity,creation_hash,created_by)
     VALUES($1,$2,$3,'RETURN','America/Sao_Paulo','IN_PROGRESS',$4,$5,'Motorista histórico',$6,$7,$8,15,'historical-school-attention-fixture',$5)`,
    [
      trip,
      users.motorista.organization,
      historicalDate,
      users.motorista.context,
      users.motorista.id,
      vehicle.id,
      vehicle.name,
      vehicle.plate,
    ],
  );
  let ownCritical = "",
    ownCriticalLink = "",
    foreignCritical = "";
  for (let i = 0; i < 7; i++) {
    const school =
      i === 6 ? users.outraescola.organization : users.escola.organization;
    const link = await extraLink(school);
    const plan = randomUUID(),
      passenger = randomUUID(),
      movement = randomUUID(),
      alert = randomUUID();
    await pg.query(
      `INSERT INTO daily_plans(id,operating_link_id,service_date,direction,scheduled,status,routine_revision,policy_revision,timezone,deadline_at,created_by)
       VALUES($1,$2,$3,'RETURN',true,'CONFIRMED',1,1,'America/Sao_Paulo','2026-10-19T21:00:00Z',$4)`,
      [plan, link.link, historicalDate, users.responsavel.id],
    );
    await pg.query(
      `INSERT INTO trip_passengers(id,trip_id,plan_id,operating_link_id,student_id,school_id,student_name,school_name,planning_status,scheduled,disposition,added_by)
       VALUES($1,$2,$3,$4,$5,$6,'Sofia Menezes','Escola do registro','CONFIRMED',true,'EXPECTED',$7)`,
      [
        passenger,
        trip,
        plan,
        link.link,
        link.student,
        school,
        users.motorista.id,
      ],
    );
    await pg.query(
      "INSERT INTO movements(id,passenger_id,kind,counterpart_role,created_at) VALUES($1,$2,'BOARDING','SCHOOL','2026-10-20T15:00:00Z')",
      [movement, passenger],
    );
    await pg.query(
      "INSERT INTO alert_cases(id,movement_id,kind,level,origin_at) VALUES($1,$2,'CONFIRMATION_PENDING',$3,'2026-10-20T15:00:00Z')",
      [alert, movement, i === 0 || i === 6 ? 3 : 1],
    );
    if (i === 0) {
      ownCritical = alert;
      ownCriticalLink = link.link;
    }
    if (i === 6) foreignCritical = alert;
  }
  const result = await day(selectedDate);
  assert.equal(result.attention.openCount, 6);
  assert.equal(result.attention.criticalCount, 1);
  assert.equal(result.attention.otherDatesCount, 6);
  assert.equal(result.attention.items.length, 5);
  assert.equal(result.attention.items[0].id, ownCritical);
  assert.equal(result.attention.items[0].date, historicalDate);
  assert.equal(result.attention.items[0].tripId, trip);
  assert(result.attention.items[0].passengerId);
  assert(result.attention.items.every((a) => a.id !== foreignCritical));
  const foreign = await day(selectedDate, "outraescola");
  assert.equal(foreign.attention.openCount, 1);
  assert.equal(foreign.attention.items[0].id, foreignCritical);
  await pg.query("UPDATE operating_links SET status='INACTIVE' WHERE id=$1", [
    ownCriticalLink,
  ]);
  const revoked = await day(selectedDate);
  assert.equal(revoked.attention.openCount, 5);
  assert.equal(revoked.attention.criticalCount, 0);
  assert(revoked.attention.items.every((a) => a.id !== ownCritical));
});
