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
import { AlertsService } from "../src/alerts.service";
import { HistoryService } from "../src/history.service";
import { notifyAlert, caseRow, alertEvent } from "../src/alerts-domain";
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
  now = new Date("2026-10-23T15:00:00Z");
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

let trip: Trip, automatic: string, manual: string;
const note = "Contato e verificação realizados com as pessoas autorizadas.";
async function getAlert(id: string, who = "escola") {
  return (await api(who, "get", "/alerts/" + id).expect(200)).body.alert;
}
async function confirm(who: string, kind: string) {
  return api(
    who,
    "post",
    `/trips/${trip.id}/passengers/${trip.passengers[0].id}/movements/${kind}/confirm`,
    {},
  ).expect(201);
}
async function action(id: string, type: string, who = "escola") {
  const a = await getAlert(id, who);
  return api(who, "post", `/alerts/${id}/actions`, {
    type,
    expectedVersion: a.version,
    note,
  });
}
test("resolução automática crítica cria destinatários distintos, ciência do autor e aviso único", async () => {
  trip = await prepare("2026-10-23");
  await api("motorista", "post", "/alerts/policy", {
    expectedRevision: 0,
    reminderMinutes: 5,
    attentionMinutes: 10,
    criticalMinutes: 15,
  }).expect(201);
  await confirm("motorista", "BOARDING");
  automatic = (
    await pg.query<any>(
      "SELECT a.id FROM alert_cases a JOIN movements v ON v.id=a.movement_id WHERE v.passenger_id=$1 AND a.kind='CONFIRMATION_PENDING'",
      [trip.passengers[0].id],
    )
  ).rows[0].id;
  await pg.query("UPDATE alert_cases SET level=3 WHERE id=$1", [automatic]);
  await confirm("responsavel", "BOARDING");
  const a = await getAlert(automatic);
  assert.equal(a.status, "RESOLVED");
  assert.equal(a.receipt.recipients.length, 3);
  assert.equal(a.receipt.pendingCount, 2);
  assert(
    a.receipt.recipients.find((r: any) => r.roles.includes("GUARDIAN"))
      .acknowledgedAt,
  );
  assert.equal(a.resolution.actor_name, "Ana Menezes");
  const p = (
    await api(
      "motorista",
      "get",
      "/alerts?awaitingAcknowledgement=true",
    ).expect(200)
  ).body;
  assert.equal(p.pendingCount, 1);
  assert(p.items.some((r: any) => r.id === automatic));
  const open = (await api("motorista", "get", "/alerts").expect(200)).body;
  assert(!open.items.some((r: any) => r.id === automatic));
  const notifications = (
    await pg.query<any>(
      "SELECT count(*)::int n FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE e.alert_id=$1 AND e.kind='ALERT_RESOLVED'",
      [automatic],
    )
  ).rows[0].n;
  await confirm("responsavel", "BOARDING");
  assert.equal(
    (
      await pg.query<any>(
        "SELECT count(*)::int n FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE e.alert_id=$1 AND e.kind='ALERT_RESOLVED'",
        [automatic],
      )
    ).rows[0].n,
    notifications,
  );
  assert.equal(
    (await api("motorista", "get", "/driver/day").expect(200)).body
      .pendingAcknowledgements,
    1,
  );
});
test("ciência é idempotente e não altera viagem, confirmações ou leitura de mensagem", async () => {
  const a = await getAlert(automatic, "motorista");
  const tripVersion = (
    await api("motorista", "get", "/trips/" + trip.id).expect(200)
  ).body.version;
  const payload = { resolutionEventId: a.receipt.eventId };
  await Promise.all([
    api(
      "motorista",
      "post",
      `/alerts/${automatic}/resolution-acknowledgements`,
      payload,
    ).expect(201),
    api(
      "motorista",
      "post",
      `/alerts/${automatic}/resolution-acknowledgements`,
      payload,
    ).expect(201),
  ]);
  assert.equal(
    (await getAlert(automatic, "motorista")).receipt.canAcknowledge,
    false,
  );
  assert.equal(
    (
      await pg.query<any>(
        "SELECT count(*)::int n FROM audit_events WHERE action='ALERT_RESOLUTION_ACKNOWLEDGED' AND target_id=$1",
        [automatic],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await api("motorista", "get", "/trips/" + trip.id).expect(200)).body
      .version,
    tripVersion,
  );
  await api(
    "motorista",
    "post",
    `/alerts/${automatic}/resolution-acknowledgements`,
    { resolutionEventId: randomUUID() },
  ).expect(403);
  await api("outraescola", "get", `/alerts/${automatic}`).expect(404);
  const inbox = (await api("escola", "get", "/notifications").expect(200)).body;
  const n = (
    await pg.query<any>(
      `SELECT n.id FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE e.alert_id=$1 AND e.kind='ALERT_RESOLVED' AND n.user_id=$2`,
      [automatic, users.escola.id],
    )
  ).rows[0];
  assert(n);
  if (n)
    await api("escola", "post", `/notifications/${n.id}/read`, {}).expect(201);
  assert((await getAlert(automatic)).receipt.canAcknowledge);
});
test("resolução manual mostra requisitos e preserva autoridade, notas e quatro confirmações", async () => {
  const result = (
    await api("motorista", "post", "/alerts/report", {
      id: randomUUID(),
      tripId: trip.id,
      passengerId: trip.passengers[0].id,
      movementKind: "ALIGHTING",
      kind: "NOT_LOCATED",
      note,
    }).expect(201)
  ).body;
  manual = result.id;
  if (!manual)
    manual = (
      await pg.query<any>(
        "SELECT a.id FROM alert_cases a JOIN movements v ON v.id=a.movement_id WHERE v.passenger_id=$1 AND a.kind='NOT_LOCATED'",
        [trip.passengers[0].id],
      )
    ).rows[0].id;
  let a = await getAlert(manual);
  assert(!a.actions.canResolve);
  assert(a.actions.requirements.some((r: any) => !r.met));
  await confirm("motorista", "ALIGHTING");
  await confirm("escola", "ALIGHTING");
  await action(manual, "CONTACT").then((r) => assert.equal(r.status, 201));
  a = await getAlert(manual);
  assert(!a.actions.canResolve);
  await action(manual, "VERIFICATION").then((r) => assert.equal(r.status, 201));
  assert((await getAlert(manual)).actions.canResolve);
  await action(manual, "RESOLVED", "responsavel").then((r) =>
    assert.equal(r.status, 403),
  );
  await action(manual, "RESOLVED").then((r) => assert.equal(r.status, 201));
  a = await getAlert(manual);
  assert.equal(a.routing_status, "ASSIGNED");
  assert.equal(a.resolution_note, note);
  assert.equal(a.receipt.pendingCount, 2);
  const h = (await api("escola", "get", "/alerts/" + manual).expect(200)).body
    .history;
  assert(h.some((e: any) => e.type === "CONTACT" && e.details.note === note));
  assert(
    h.some((e: any) => e.type === "VERIFICATION" && e.details.note === note),
  );
});
test("perda de coordenação ou vínculo dispensa pendência sem transferir ciência", async () => {
  await pg.query("UPDATE memberships SET coordinator=false WHERE id=$1", [
    users.escola.context,
  ]);
  let a = await getAlert(automatic);
  assert(!a.receipt.canAcknowledge);
  assert(
    a.receipt.recipients.find((r: any) => r.roles.includes("SCHOOL")).revokedAt,
  );
  await api(
    "escola",
    "post",
    `/alerts/${automatic}/resolution-acknowledgements`,
    { resolutionEventId: a.receipt.eventId },
  ).expect(403);
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE user_id=$1",
    [users.responsavel.id],
  );
  a = await getAlert(manual, "motorista");
  assert(
    a.receipt.recipients.find((r: any) => r.roles.includes("GUARDIAN"))
      .revokedAt,
  );
  assert.equal(a.receipt.pendingCount, 1);
  await api("responsavel", "get", "/alerts/" + manual).expect(404);
  await pg.query("UPDATE memberships SET coordinator=true WHERE id=$1", [
    users.escola.context,
  ]);
  assert(!(await getAlert(automatic)).receipt.canAcknowledge);
});
test("casos comuns e resoluções históricas não ganham ciência; exceção crítica usa o mesmo registro", async () => {
  const movement = (
    await pg.query<any>(
      "SELECT id FROM movements WHERE passenger_id=$1 AND kind='ALIGHTING'",
      [trip.passengers[0].id],
    )
  ).rows[0].id;
  const db = app.get(Database);
  async function resolve(level: number, notify = true) {
    const id = randomUUID();
    await pg.query(
      "INSERT INTO alert_cases(id,movement_id,kind,status,level,origin_at) VALUES($1,$2,'RECEIPT_DISPUTED','OPEN',$3,$4)",
      [id, movement, level, now],
    );
    if (notify) {
      await db.transaction((tx) =>
        app.get(HistoryService).resolveCase(
          tx,
          id,
          {
            actor: { id: users.escola.id, name: "Coordenação" },
            context: {
              id: users.escola.context,
              organization_id: users.escola.organization,
              role: "SCHOOL",
              coordinator: true,
            },
          } as any,
          "EXCEPTIONAL_ACCOUNTING",
          note,
          now,
        ),
      );
    } else {
      await pg.query(
        "UPDATE alert_cases SET status='RESOLVED',resolved_at=$2 WHERE id=$1",
        [id, now],
      );
    }
    return id;
  }
  assert.equal((await getAlert(await resolve(1))).receipt, null);
  assert.equal((await getAlert(await resolve(3, false))).receipt, null);
  const exceptional = await getAlert(await resolve(3));
  assert(exceptional.receipt);
  assert.equal(exceptional.resolution_kind, "EXCEPTIONAL_ACCOUNTING");
  assert(exceptional.receipt.missingRoles.includes("GUARDIAN"));
});
test("uma pessoa com dois contextos recebe uma ciência; rollback não deixa aviso ou destinatário", async () => {
  await pg.query("UPDATE guardian_links SET status='ACTIVE' WHERE user_id=$1", [
    users.responsavel.id,
  ]);
  const org = randomUUID(),
    membership = randomUUID();
  await pg.query(
    "INSERT INTO organizations(id,name,kind) VALUES($1,'Família adicional','FAMILY')",
    [org],
  );
  await pg.query(
    "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'GUARDIAN')",
    [membership, users.responsavel.id, org],
  );
  users.familiaExtra = {
    ...users.responsavel,
    context: membership,
    organization: org,
  };
  const movement = (
    await pg.query<any>(
      "SELECT id FROM movements WHERE passenger_id=$1 AND kind='ALIGHTING'",
      [trip.passengers[0].id],
    )
  ).rows[0].id;
  const db = app.get(Database),
    id = randomUUID();
  await pg.query(
    "INSERT INTO alert_cases(id,movement_id,kind,status,level,origin_at) VALUES($1,$2,'NOT_LOCATED','OPEN',3,$3)",
    [id, movement, now],
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      const a = await caseRow(tx, id);
      const event = await alertEvent(tx, a, "RESOLVED", now, {});
      await notifyAlert(tx, a, event, now, true);
      throw Error("rollback");
    }),
    /rollback/,
  );
  assert.equal(
    (
      await pg.query(
        "SELECT event_id FROM alert_resolution_receipts WHERE case_id=$1",
        [id],
      )
    ).rows.length,
    0,
  );
  await db.transaction((tx) =>
    app.get(HistoryService).resolveCase(
      tx,
      id,
      {
        actor: { id: users.escola.id, name: "Coordenação" },
        context: {
          id: users.escola.context,
          organization_id: users.escola.organization,
          role: "SCHOOL",
          coordinator: true,
        },
      } as any,
      "EXCEPTIONAL_ACCOUNTING",
      note,
      now,
    ),
  );
  const a = await getAlert(id);
  assert.equal(
    a.receipt.recipients.filter((r: any) => r.roles.includes("GUARDIAN"))
      .length,
    1,
  );
  const payload = { resolutionEventId: a.receipt.eventId };
  await api(
    "familiaExtra",
    "post",
    `/alerts/${id}/resolution-acknowledgements`,
    payload,
  ).expect(201);
  await api(
    "responsavel",
    "post",
    `/alerts/${id}/resolution-acknowledgements`,
    payload,
  ).expect(201);
  const stored = (
    await pg.query<any>(
      "SELECT acknowledged_membership_id FROM alert_resolution_recipients WHERE event_id=$1 AND user_id=$2",
      [payload.resolutionEventId, users.responsavel.id],
    )
  ).rows[0];
  assert.equal(stored.acknowledged_membership_id, membership);
  await api(
    "responsavel",
    "post",
    `/alerts/${id}/resolution-acknowledgements`,
    { ...payload, userId: users.motorista.id },
  ).expect(400);
  // Revocation is durable even if access returns before any subsequent GET.
  await pg.query("UPDATE memberships SET active=false WHERE id=$1", [
    users.motorista.context,
  ]);
  await pg.query("UPDATE memberships SET active=true WHERE id=$1", [
    users.motorista.context,
  ]);
  const restored = await getAlert(id, "motorista");
  assert(!restored.receipt.canAcknowledge);
  assert(
    restored.receipt.recipients.find((r: any) => r.roles.includes("DRIVER"))
      .revokedAt,
  );
});
