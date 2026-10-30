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
import { mergeConfirmation } from "../../shared/driver-state";
import { movementPresentation } from "../../shared/movement-presentation";
import type { Trip } from "../../shared/trips";
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

async function prepare(serviceDate: string, second = false) {
  now = new Date(serviceDate + "T15:00:00Z");
  now.setUTCDate(now.getUTCDate() - 1);
  await api("motorista", "post", "/planning/generate", {
    date: serviceDate,
    linkId,
  }).expect(201);
  const plans = (
    await api("responsavel", "get", "/planning/day?date=" + serviceDate).expect(
      200,
    )
  ).body.plans;
  const plan = plans.find(
    (p: any) => p.operating_link_id === linkId && p.direction === "OUTBOUND",
  );
  await api("responsavel", "post", `/planning/plans/${plan.id}/respond`, {
    use: true,
    expectedVersion: plan.version,
  }).expect(201);
  const ids = [plan.id];
  if (second) {
    const extra = await extraLink(users.outraescola.organization);
    await pg.query(
      "INSERT INTO weekly_routines(id,operating_link_id,revision,days,changed_by) VALUES($1,$2,1,$3,$4)",
      [randomUUID(), extra.link, JSON.stringify(days()), users.responsavel.id],
    );
    await api("motorista", "post", "/planning/generate", {
      date: serviceDate,
      linkId: extra.link,
    }).expect(201);
    const p = (
      await pg.query<any>(
        "UPDATE daily_plans SET status='CONFIRMED' WHERE operating_link_id=$1 AND service_date=$2 AND direction='OUTBOUND' RETURNING id",
        [extra.link, serviceDate],
      )
    ).rows[0];
    ids.push(p.id);
  }
  const opts = (
    await api(
      "motorista",
      "get",
      `/trips/options?date=${serviceDate}&direction=OUTBOUND`,
    ).expect(200)
  ).body;
  const id = randomUUID();
  await api("motorista", "post", "/trips", {
    id,
    date: serviceDate,
    direction: "OUTBOUND",
    driverId: users.motorista.context,
    vehicleId: opts.vehicles[0].id,
    planIds: ids,
  }).expect(201);
  now = new Date(serviceDate + "T15:00:00Z");
  await api("motorista", "post", `/trips/${id}/start`, {
    expectedVersion: 1,
  }).expect(201);
  return (await api("motorista", "get", `/trips/${id}`).expect(200))
    .body as Trip;
}

test("Meu dia usa data do servidor e nega perfis sem autoridade", async () => {
  const d = (await api("motorista", "get", "/driver/day").expect(200)).body;
  assert.equal(d.date, "2026-10-22");
  assert.equal(d.tomorrow, "2026-10-23");
  assert.equal(d.trips.total, 0);
  assert.equal(d.attention.total, 0);
  await api("escola", "get", "/driver/day").expect(403);
  await api("responsavel", "get", "/driver/day").expect(403);
  await api("motorista", "get", "/driver/day?date=invalid").expect(400);
});

test("planejamento distingue falta original da rotina atual sem reescrever uso", async () => {
  const extra = await extraLink();
  await api("motorista", "post", "/planning/generate", {
    date,
    linkId: extra.link,
  }).expect(201);
  let d = (
    await api("motorista", "get", "/planning/day?date=" + date).expect(200)
  ).body;
  const before = d.plans.find((p: any) => p.operating_link_id === extra.link);
  assert.equal(before.presentation.status, "MISSING_CONFIGURATION");
  assert(before.presentation.currentMissingRoutine);
  await pg.query(
    "INSERT INTO weekly_routines(id,operating_link_id,revision,days,changed_by) VALUES($1,$2,1,$3,$4)",
    [randomUUID(), extra.link, JSON.stringify(days()), users.responsavel.id],
  );
  d = (await api("motorista", "get", "/planning/day?date=" + date).expect(200))
    .body;
  const after = d.plans.find((p: any) => p.id === before.id);
  assert.equal(after.status, "NOT_EXPECTED");
  assert.equal(after.routine_revision, null);
  assert(after.presentation.snapshotMissingRoutine);
  assert.equal(after.presentation.currentMissingRoutine, false);
  const school = row(await day(), extra.link);
  assert.equal(school.planning.status, "MISSING_CONFIGURATION");
  assert.deepEqual(school.planning.missingConfiguration, []);
  assert(school.planning.snapshotMissingRoutine);
  const preview = (
    await api("motorista", "get", "/driver/day?date=" + date).expect(200)
  ).body.preparation.items.find((p: any) => p.linkId === extra.link);
  assert.equal(preview.bucket, "SNAPSHOT_UNCONFIGURED");
});

let older: Trip;
test("confirmação devolve agregados atuais e isola escola; respostas distintas podem chegar invertidas", async () => {
  const t = await prepare("2026-10-23", true);
  const [a, b] = t.passengers;
  const own = t.passengers.find((p) => p.student_id === studentId)!;
  const path = (p: string) =>
    `/trips/${t.id}/passengers/${p}/movements/ALIGHTING/confirm`;
  const school = (await api("escola", "post", path(own.id), {}).expect(201))
    .body;
  assert.equal(school.tripSummary.counts.total, 1);
  assert.equal(school.tripSummary.closure.total, 1);
  assert.equal(school.tripSummary.closure.canInspect, false);
  const r1 = (await api("motorista", "post", path(a.id), {}).expect(201)).body;
  const r2 = (await api("motorista", "post", path(b.id), {}).expect(201)).body;
  assert.equal(r1.tripSummary.counts.total, 2);
  assert.equal(r2.tripSummary.counts.delivered, 1);
  assert.equal(r1.tripSummary.closure.ready, false);
  assert(r1.passenger.issues.some((i: any) => i.status !== "RESOLVED"));
  const versions = new Map<string, number>();
  const reversed = mergeConfirmation(
    mergeConfirmation(t, r2, versions),
    r1,
    versions,
  );
  assert.equal(reversed.version, r2.tripVersion);
  assert(
    reversed.passengers.every((p) =>
      p.movements[1].confirmations.some((c) => c.side === "DRIVER"),
    ),
  );
  assert.deepEqual(reversed.counts, r2.tripSummary.counts);
  const replay = (await api("motorista", "post", path(a.id), {}).expect(201))
    .body;
  assert.equal(replay.unchanged, true);
  assert.equal(replay.tripVersion, r2.tripVersion);
  assert.deepEqual(replay.tripSummary.counts, r2.tripSummary.counts);
  older = (await api("motorista", "get", `/trips/${t.id}`).expect(200)).body;
  assert.deepEqual(older.counts, replay.tripSummary.counts);
  assert.deepEqual(older.closure.pending, replay.tripSummary.closure.pending);
});

test("revisão antiga permanece na família e no motorista ao existir viagem recente", async () => {
  await pg.query("UPDATE trips SET status='COMPLETED_REVIEW' WHERE id=$1", [
    older.id,
  ]);
  await pg.query(
    "UPDATE trip_passengers SET delivery_validated_at='2026-10-23T15:00:00Z' WHERE trip_id=$1",
    [older.id],
  );
  const newer = await prepare("2026-10-24");
  const home = (
    await api("responsavel", "get", "/notifications/home").expect(200)
  ).body;
  assert.equal(
    home.children.find((c: any) => c.id === studentId).current.tripId,
    newer.id,
  );
  assert(home.pendingJourneys.items.some((p: any) => p.tripId === older.id));
  const d = (
    await api("motorista", "get", "/driver/day?date=2026-10-24").expect(200)
  ).body;
  assert(d.trips.items.some((t: any) => t.id === newer.id));
  assert(d.openTrips.items.some((t: any) => t.id === older.id));
  assert(d.attention.items.some((a: any) => a.tripId === older.id));
});

test("resumos paginam mais de 20 viagens sem carregar passageiros", async () => {
  const v = (
    await pg.query<any>(
      "SELECT * FROM vehicles WHERE organization_id=$1 LIMIT 1",
      [users.motorista.organization],
    )
  ).rows[0];
  for (let i = 0; i < 23; i++)
    await pg.query(
      `INSERT INTO trips(id,transport_id,service_date,direction,timezone,status,driver_membership_id,driver_user_id,driver_name,vehicle_id,vehicle_name,vehicle_plate,capacity,creation_hash,created_by)
    VALUES($1,$2,'2026-10-26','OUTBOUND','America/Sao_Paulo','PLANNED',$3,$4,'Motorista',$5,$6,$7,15,$8,$4)`,
      [
        randomUUID(),
        users.motorista.organization,
        users.motorista.context,
        users.motorista.id,
        v.id,
        v.name,
        v.plate,
        randomUUID(),
      ],
    );
  const first = (
    await api("motorista", "get", "/driver/day?date=2026-10-26").expect(200)
  ).body;
  const next = (
    await api("motorista", "get", "/driver/day?date=2026-10-26&page=1").expect(
      200,
    )
  ).body;
  assert.equal(first.trips.total, 23);
  assert.equal(first.trips.items.length, 20);
  assert(first.trips.hasMore);
  assert.equal(next.trips.items.length, 3);
  assert.equal(next.trips.hasMore, false);
  assert(
    !first.trips.items.some(
      (t: any) => "passengers" in t || "creation_hash" in t,
    ),
  );
  assert.equal(
    new Set([...first.trips.items, ...next.trips.items].map((t: any) => t.id))
      .size,
    23,
  );
});

test("atendimento, correção e exceção aparecem separados da dupla confirmação", () => {
  const p = structuredClone(older.passengers[0]);
  const driverRecord = p.movements[1].confirmations.find(
    (c) => c.side === "DRIVER",
  )!;
  assert.equal(
    movementPresentation(p, "ALIGHTING", "DRIVER", driverRecord.membershipId)
      .actionLabel,
    "Você já confirmou",
  );
  assert.equal(
    movementPresentation(p, "ALIGHTING", "DRIVER", randomUUID()).actionLabel,
    "Motorista já confirmou",
  );
  p.disposition = "NOT_TRANSPORTED";
  assert.equal(
    movementPresentation(p, "ALIGHTING", "DRIVER").status,
    "Não transportada",
  );
  p.disposition = "EXPECTED";
  p.active = false;
  assert.match(
    movementPresentation(p, "ALIGHTING", "DRIVER").status,
    /inativo/,
  );
  p.active = true;
  p.issues[0].status = "IN_REVIEW";
  p.movements[1].confirmations[0].correctionStatus = "PENDING";
  const review = movementPresentation(p, "ALIGHTING", "DRIVER");
  assert(review.hasOccurrence);
  assert(review.pendingReview);
  assert.match(review.status, /correção/);
  p.exceptionalResolution = {
    id: randomUUID(),
    actorName: "Coordenação",
    at: "2026-10-23T15:00:00Z",
    outcome: "LOCALIZED",
    recipientName: null,
  };
  assert.match(
    movementPresentation(p, "ALIGHTING", "DRIVER").status,
    /excepcionalmente/,
  );
});

test("resumo de preparação projeta rotina sem gerar planos nem presumir ausência", async () => {
  const before = (
    await pg.query<any>("SELECT count(*)::int n FROM daily_plans")
  ).rows[0].n;
  const r = (
    await api("motorista", "get", "/driver/day?date=2026-11-02").expect(200)
  ).body.preparation;
  const own = r.items.find((p: any) => p.linkId === linkId);
  assert(own);
  assert.equal(own.bucket, "FORECAST");
  assert.equal(r.going, 0);
  assert.equal(r.notGoing, 0);
  assert.equal(r.going + r.notGoing + r.pending, r.total);
  assert.equal(
    (await pg.query<any>("SELECT count(*)::int n FROM daily_plans")).rows[0].n,
    before,
  );
  const past = (
    await api("motorista", "get", "/driver/day?date=2026-10-01").expect(200)
  ).body.preparation.items.find((p: any) => p.linkId === linkId);
  assert.equal(past.bucket, "NO_RECORD");
});
test("resumo usa situação vigente e mantém ida e volta e pedidos separados", async () => {
  const id = randomUUID();
  await pg.query(
    "INSERT INTO daily_plans(id,operating_link_id,service_date,direction,scheduled,status,routine_revision,policy_revision,timezone,deadline_at,created_by) VALUES($1,$2,'2026-11-03','OUTBOUND',true,'CONFIRMED',1,1,'America/Sao_Paulo','2026-11-02T21:00:00Z',$3)",
    [id, linkId, users.responsavel.id],
  );
  await pg.query(
    "INSERT INTO planning_changes(id,plan_id,requested_usage,previous_status,status,reason,requested_by) VALUES($1,$2,false,'CONFIRMED','PENDING','Solicitação fictícia de alteração',$3)",
    [randomUUID(), id, users.responsavel.id],
  );
  const out = (
    await api(
      "motorista",
      "get",
      "/driver/day?date=2026-11-03&preparationDirection=OUTBOUND",
    ).expect(200)
  ).body.preparation.items.find((p: any) => p.linkId === linkId);
  assert.equal(out.bucket, "GOING");
  assert(out.requestId);
  assert.equal(out.requestedUsage, false);
  const back = (
    await api(
      "motorista",
      "get",
      "/driver/day?date=2026-11-03&preparationDirection=RETURN",
    ).expect(200)
  ).body.preparation.items.find((p: any) => p.linkId === linkId);
  assert.equal(back.bucket, "FORECAST");
  assert.equal(back.requestId, null);
});
test("resumo pagina homônimos e isola outros transportes", async () => {
  for (let i = 0; i < 23; i++) await extraLink();
  const foreignTransport = randomUUID();
  await pg.query(
    "INSERT INTO organizations(id,name,kind) VALUES($1,'Outro transporte','TRANSPORT')",
    [foreignTransport],
  );
  const foreign = await extraLink(users.escola.organization, foreignTransport);
  const a = (
      await api("motorista", "get", "/driver/day?date=2026-11-02").expect(200)
    ).body.preparation,
    b = (
      await api(
        "motorista",
        "get",
        "/driver/day?date=2026-11-02&preparationPage=1",
      ).expect(200)
    ).body.preparation;
  assert.equal(a.items.length, 20);
  assert(a.hasMore);
  assert.equal(a.total, b.total);
  assert(!a.items.some((p: any) => p.linkId === foreign.link));
  assert(!b.items.some((p: any) => p.linkId === foreign.link));
  assert(
    !a.items.some((p: any) => b.items.some((q: any) => q.linkId === p.linkId)),
  );
});

test("revogação familiar e de contexto remove os dados operacionais", async () => {
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE user_id=$1",
    [users.responsavel.id],
  );
  const h = (await api("responsavel", "get", "/notifications/home").expect(200))
    .body;
  assert.equal(h.children.length, 0);
  assert.equal(h.pendingJourneys.total, 0);
  await pg.query("UPDATE memberships SET active=false WHERE id=$1", [
    users.motorista.context,
  ]);
  await api("motorista", "get", "/driver/day").expect(403);
});
