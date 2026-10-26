import "./environment";
import "reflect-metadata";
import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Queue } from "bullmq";
import { OperationsService } from "../src/operations";
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
  pg: any,
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

  if (family) {
    const routine = (
      await api("responsavel", "get", "/planning/routines/" + link).expect(200)
    ).body;
    await api("responsavel", "put", "/planning/routines/" + link, {
      expectedRevision: routine.revision,
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        outbound: true,
        return: true,
      })),
    }).expect(200);
  }
  now = new Date("2026-10-21T15:00:00Z");
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
  if (family) {
    const daily = (
      await api("responsavel", "get", "/planning/day?date=" + date).expect(200)
    ).body.plans.find((p: any) => p.id === plan.id);
    await api(
      "responsavel",
      "post",
      "/planning/plans/" + plan.id + "/respond",
      { use: true, expectedVersion: daily.version },
    ).expect(201);
  }
  now = new Date("2026-10-22T15:00:00Z");
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

const real = process.env.CAMINHO_INTEGRATION === "postgres";
let admin: Pool | undefined, integrationPool: Pool | undefined;
const schema = "qa_part10_" + randomUUID().replaceAll("-", "").slice(0, 16);
const operationsToken = randomUUID() + randomUUID();
before(async () => {
  process.env.OPERATIONS_TOKEN = operationsToken;
  if (real) {
    assert.match(schema, /^qa_part10_[0-9a-f]{16}$/);
    assert(
      process.env.QA_DATABASE_URL,
      "Informe QA_DATABASE_URL para PostgreSQL de teste.",
    );
    admin = new Pool({ connectionString: process.env.QA_DATABASE_URL });
    await admin.query('CREATE SCHEMA "' + schema + '"');
    const url = new URL(process.env.QA_DATABASE_URL!);
    url.searchParams.set("options", "-c search_path=" + schema);
    integrationPool = new Pool({ connectionString: url.toString() });
    pg = {
      query: (sql: string, values?: unknown[]) =>
        integrationPool!.query(sql, values),
      exec: (sql: string) => integrationPool!.query(sql),
      close: () => integrationPool!.end(),
      transaction: async (fn: any) => {
        const client = await integrationPool!.connect();
        try {
          await client.query("BEGIN");
          const value = await fn(client);
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
    console.log("Integração PostgreSQL em schema isolado:", schema);
  } else pg = new PGlite();
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
  const worker = app?.get(NotificationWorker);
  try {
    await worker?.onModuleDestroy();
    if (real && worker?.queue) {
      const queue = new Queue("notifications", {
        connection: redisConnection(),
        prefix: schema,
      });
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
      }
    }
  } finally {
    try {
      await app?.close();
      await pg?.close();
    } finally {
      if (admin) {
        try {
          await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
        } finally {
          await admin.end();
        }
      }
    }
  }
  if (real) console.log("Schema e fila exclusivos da Parte 10 removidos.");
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

function redisConnection() {
  const url = new URL(process.env.QA_REDIS_URL || "redis://127.0.0.1:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
async function alertsFor(f: Fixture, who = "responsavel") {
  return (await api(who, "get", "/alerts").expect(200)).body.items.filter(
    (a: any) => a.passenger_id === f.passenger,
  );
}
async function advance(minutes: number) {
  now = new Date(Date.parse("2026-10-22T15:00:00Z") + minutes * 60000);
  await app.get(AlertsService).sweep();
}
async function setupPolicy() {
  const opts = (await api("motorista", "get", "/alerts/options").expect(200))
    .body;
  await api("motorista", "post", "/alerts/policy", {
    expectedRevision: opts.policy?.revision || 0,
    reminderMinutes: 5,
    attentionMinutes: 10,
    criticalMinutes: 15,
  }).expect(201);
}

for (const direction of ["OUTBOUND", "RETURN"])
  test(
    "fluxo completo " +
      direction +
      ": rotina, planejamento, três perfis, notificações, inspeção e histórico",
    async () => {
      const f = await fixture(direction);
      const initial = await detail(f);
      assert.equal(initial.passengers[0].planning_status, "CONFIRMED");
      await fullJourney(f);
      const child = (
        await api(
          "responsavel",
          "get",
          "/notifications/children/" + f.passenger,
        ).expect(200)
      ).body;
      assert(JSON.stringify(child).includes(f.passenger));
      const notices = (
        await api("responsavel", "get", "/notifications").expect(200)
      ).body.items.filter((n: any) => n.target.passengerId === f.passenger);
      assert(
        notices.some(
          (n: any) =>
            n.title.includes("validado") || n.title.includes("validada"),
        ),
      );
      await closeTrip(f, await closureBody(f)).expect(201);
      for (const who of [f.driver, "responsavel", "escola"]) {
        const history = await hist(f, who);
        assert.equal(history.trip.status, "COMPLETED");
        assert.equal(history.confirmations.length, 4);
        assert.equal(
          new Set(history.confirmations.map((c: any) => c.actor_id)).size,
          3,
        );
        assert.equal(history.inspections.length, 1);
        assert.equal(history.resolutions.length, 0);
      }
    },
  );

test("uma confirmação ausente escala em 5/10/15 sem exigir novo clique da parte que já confirmou", async () => {
  await setupPolicy();
  const f = await fixture();
  await confirm(f, "responsavel").expect(201);
  const origin = (await alertsFor(f))[0].origin_at;
  for (const [minutes, level] of [
    [5, 1],
    [10, 2],
    [15, 3],
  ]) {
    await advance(minutes);
    const a = (await alertsFor(f))[0];
    assert.equal(a.level, level);
    assert.equal(a.origin_at, origin);
  }
  const notifications = (
    await api("responsavel", "get", "/notifications").expect(200)
  ).body.items;
  assert(
    !notifications.some(
      (n: any) =>
        n.target.passengerId === f.passenger &&
        n.purpose === "ACTION" &&
        n.pending,
    ),
  );
  await confirm(f, f.driver).expect(201);
  assert.equal((await detail(f)).passengers[0].movements[0].state, "VALIDATED");
  assert.equal((await alertsFor(f)).length, 0);
});

test("ambas ausentes não inventam parada; conferência final exige contabilização e mantém crítico", async () => {
  const f = await fixture();
  await advance(15);
  assert.equal((await alertsFor(f)).length, 0);
  await closeTrip(f, await closureBody(f)).expect(201);
  const h = await hist(f);
  assert.equal(h.trip.status, "ROUTE_ENDED_OPEN");
  assert.equal(h.confirmations.length, 0);
  assert(
    h.alerts.some(
      (a: any) =>
        a.kind === "ROUTE_END_PENDING" &&
        a.level === 3 &&
        a.status !== "RESOLVED",
    ),
  );
  assert.equal((await detail(f)).closure.ready, false);
});

for (const direction of ["OUTBOUND", "RETURN"])
  test(
    "crítico de desembarque " +
      direction +
      " chega ao destinatário correto e entrega continua pendente",
    async () => {
      const f = await fixture(direction);
      await confirm(f, f.driver).expect(201);
      await confirm(
        f,
        direction === "RETURN" ? "escola" : "responsavel",
      ).expect(201);
      await confirm(f, f.driver, "ALIGHTING").expect(201);
      await advance(15);
      const recipient = direction === "RETURN" ? "responsavel" : "escola";
      const a = (await alertsFor(f, recipient)).find(
        (a: any) => a.kind === "CONFIRMATION_PENDING",
      );
      assert.equal(a.level, 3);
      assert.equal(a.routing_status, "ASSIGNED");
      const inbox = (await api(recipient, "get", "/notifications").expect(200))
        .body.items;
      assert(
        inbox.some(
          (n: any) =>
            n.target.alertId === a.id && n.title.startsWith("Crítico"),
        ),
      );
      await closeTrip(f, await closureBody(f)).expect(201);
      const d = await detail(f);
      assert.equal(d.status, "ROUTE_ENDED_OPEN");
      assert.equal(d.counts.delivered, 0);
      assert.equal((await hist(f)).confirmations.length, 3);
    },
  );

test("cliques repetidos e simultâneos preservam quatro confirmações e autores distintos", async () => {
  const f = await fixture();
  await Promise.all([
    confirm(f, f.driver).expect(201),
    confirm(f, f.driver).expect(201),
    confirm(f, "responsavel").expect(201),
  ]);
  await Promise.all([
    confirm(f, f.driver, "ALIGHTING").expect(201),
    confirm(f, "escola", "ALIGHTING").expect(201),
  ]);
  const d = await hist(f);
  assert.equal(d.confirmations.length, 4);
  assert.equal(new Set(d.confirmations.map((c: any) => c.id)).size, 4);
  for (const kind of ["BOARDING", "ALIGHTING"])
    assert.equal(
      new Set(
        d.confirmations
          .filter((c: any) => c.kind === kind)
          .map((c: any) => c.actor_id),
      ).size,
      2,
    );
  await closeTrip(f, await closureBody(f)).expect(201);
});

test("resposta perdida após commit permite replay sem duplicar confirmação, autoria ou eventos", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201); // O cliente perde a resposta, mas o servidor já persistiu.
  const counts = async () =>
    (
      await pg.query(
        "SELECT (SELECT count(*)::int FROM movement_confirmations) c,(SELECT count(*)::int FROM notification_events) n",
      )
    ).rows[0];
  const before = await counts();
  await confirm(f, f.driver).expect(201);
  assert.deepEqual(await counts(), before);
  assert.equal((await detail(f)).passengers[0].movements[0].state, "INFORMED");
});

test("falha de notificação preserva tentativas e pendência sem anunciar recebimento", async () => {
  const f = await fixture(),
    installationId = randomUUID();
  await api("responsavel", "post", "/notifications/devices", {
    installationId,
    token: "ExpoPushToken[qa_" + installationId.replaceAll("-", "") + "]",
  }).expect(201);
  await pg.query(
    "UPDATE push_devices SET registered_at='2026-10-22T00:00:00Z' WHERE installation_id=$1",
    [installationId],
  );
  await confirm(f, f.driver).expect(201);
  const worker = app.get(NotificationWorker),
    push = app.get(ExpoPush);
  push.enabled = () => true;
  push.send = async () => {
    throw new PushFailure("HTTP_503");
  };
  try {
    while (await worker.dispatch()) {}
    const rows = (
      await pg.query(
        `SELECT d.* FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN notification_events e ON e.id=n.event_id WHERE e.passenger_id=$1`,
        [f.passenger],
      )
    ).rows;
    assert(rows.length > 0);
    const id = rows[0].id;
    for (let i = 0; i < 3; i++) {
      await pg.query(
        "UPDATE notification_deliveries SET next_attempt_at=now() WHERE id=$1",
        [id],
      );
      if (i < 2) await assert.rejects(worker.process(id));
      else await worker.process(id);
    }
    const d = (
      await pg.query("SELECT * FROM notification_deliveries WHERE id=$1", [id])
    ).rows[0];
    assert.equal(d.status, "FAILED");
    assert.equal(d.attempts, 3);
    assert.equal(
      (
        await pg.query(
          "SELECT count(*)::int n FROM notification_attempts WHERE delivery_id=$1",
          [id],
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (await detail(f)).passengers[0].movements[0].state,
      "INFORMED",
    );
    const snapshot = await app.get(OperationsService).snapshot();
    assert(Number(snapshot.notifications.totals?.send_failed) >= 1);
  } finally {
    push.enabled = () => false;
  }
});

test("correção conflitante preserva original, exige coordenação e nova inspeção após exceção", async () => {
  const f = await fixture();
  await fullJourney(f);
  await closeTrip(f, await closureBody(f)).expect(201);
  const body = await correctionBody(f);
  const original = (await hist(f)).confirmations.find(
    (c: any) => c.id === body.confirmationId,
  );
  await requestCorrection(f, body).expect(201);
  let h = await hist(f);
  assert.equal(h.trip.status, "COMPLETED_REVIEW");
  const decision = {
    expectedVersion: h.corrections[0].version,
    decision: "APPROVED",
    ...evidence,
  };
  await decideCorrection(f, body.id, decision, "operacao").expect(403);
  await decideCorrection(f, body.id, decision).expect(201);
  await exceptional(f, await exceptionBody(f)).expect(201);
  assert.equal((await detail(f)).status, "COMPLETED_REVIEW");
  await closeTrip(f, await closureBody(f)).expect(201);
  h = await hist(f);
  const preserved = h.confirmations.find((c: any) => c.id === original.id);
  assert.equal(preserved.actor_id, original.actor_id);
  assert.equal(preserved.received_at, original.received_at);
  assert.equal(h.confirmations.length, 4);
  assert.equal(h.resolutions.length, 1);
  assert.equal(h.inspections.length, 2);
  assert.equal((await detail(f)).closure.exceptional, 1);
});

test("troca de IDs e revogação de vínculo bloqueiam leitura e ação em todos os módulos", async () => {
  const f = await fixture();
  await confirm(f, f.driver).expect(201);
  for (const path of [
    "/history/" + f.passenger,
    "/notifications/children/" + f.passenger,
  ])
    await api("outraescola", "get", path).expect(404);
  await confirm(f, "outraescola", "ALIGHTING").expect(404);
  await pg.query(
    "UPDATE guardian_links SET status='INACTIVE' WHERE student_id=$1",
    [f.student],
  );
  await api("responsavel", "get", "/history/" + f.passenger).expect(404);
  await api(
    "responsavel",
    "get",
    "/notifications/children/" + f.passenger,
  ).expect(404);
  await confirm(f, "responsavel").expect(404);
});

test("monitoramento exige credencial própria, não expõe dados individuais e detecta worker indisponível", async () => {
  await request(app.getHttpServer()).get("/health/operations").expect(401);
  await api("escola", "get", "/health/operations").expect(401);
  const response = await request(app.getHttpServer())
    .get("/health/operations")
    .set("X-Operations-Token", operationsToken)
    .expect(200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body.status, "degraded");
  assert.equal(response.body.database, "ok");
  assert.equal(response.body.processing.queue, null);
  assert.equal(response.body.release.status, "NOT_RELEASED");
  assert(!JSON.stringify(response.body).includes("@demo.local"));
  assert(!JSON.stringify(response.body).includes(operationsToken));
  await request(app.getHttpServer())
    .get("/health/operations/ready")
    .set("X-Operations-Token", operationsToken)
    .expect(503);
  const previous = process.env.OPERATIONS_TOKEN;
  delete process.env.OPERATIONS_TOKEN;
  try {
    await request(app.getHttpServer()).get("/health/operations").expect(503);
  } finally {
    process.env.OPERATIONS_TOKEN = previous;
  }
});

test("monitoramento identifica Redis indisponível, fila pausada, batimento vencido e recuperação", async () => {
  const worker = app.get(NotificationWorker),
    service = app.get(OperationsService);
  const values = {
    queue: worker.queue,
    worker: worker.worker,
    lastSuccessAt: worker.lastSuccessAt,
  };
  try {
    worker.queue = {
      getJobCounts: async () => {
        throw new Error("secret-connection");
      },
      isPaused: async () => false,
    } as any;
    assert.equal((await service.snapshot()).processing.queue, null);
    worker.queue = {
      getJobCounts: async () => ({
        waiting: 2,
        active: 0,
        delayed: 3,
        failed: 1,
      }),
      isPaused: async () => true,
    } as any;
    worker.worker = { isRunning: () => true } as any;
    worker.lastSuccessAt = new Date().toISOString();
    assert.equal((await service.snapshot()).status, "degraded");
    worker.queue!.isPaused = async () => false;
    worker.lastSuccessAt = new Date(Date.now() - 31000).toISOString();
    assert.equal((await service.snapshot()).status, "degraded");
    worker.lastSuccessAt = new Date().toISOString();
    worker.failureActive = true;
    assert.equal((await service.snapshot()).status, "degraded");
    worker.failureActive = false;
    assert.equal((await service.snapshot()).status, "ok");
  } finally {
    Object.assign(worker, values);
  }
});

test("falha de banco permanece observável sem expor erro SQL ou dados de conexão", async () => {
  const db = app.get(Database),
    original = db.pool.query;
  db.pool.query = (async () => {
    throw new Error("secret-postgres-connection");
  }) as any;
  try {
    const response = await request(app.getHttpServer())
      .get("/health/operations")
      .set("X-Operations-Token", operationsToken)
      .expect(200);
    assert.equal(response.body.database, "unavailable");
    assert.equal(response.body.status, "degraded");
    assert.equal(response.body.notifications.totals, null);
    assert(
      !JSON.stringify(response.body).includes("secret-postgres-connection"),
    );
    await request(app.getHttpServer())
      .get("/health/operations/ready")
      .set("X-Operations-Token", operationsToken)
      .expect(503);
  } finally {
    db.pool.query = original;
  }
});

if (real)
  test("PostgreSQL + Redis reais: fila persistente, restart, prazos preservados e limpeza isolada", async () => {
    const f = await fixture();
    await confirm(f, f.driver).expect(201);
    const origin = (await alertsFor(f))[0].origin_at;
    process.env.REDIS_URL =
      process.env.QA_REDIS_URL || "redis://127.0.0.1:6379";
    process.env.NOTIFICATIONS_QUEUE_PREFIX = schema;
    process.env.NOTIFICATIONS_WORKER = "true";
    const start = (worker: NotificationWorker) => {
      process.env.NODE_ENV = "development";
      try {
        worker.onApplicationBootstrap();
      } finally {
        process.env.NODE_ENV = "test";
      }
    };
    const first = app.get(NotificationWorker);
    start(first);
    await first.tick();
    assert.equal((await app.get(OperationsService).snapshot()).status, "ok");
    await first.queue!.add(
      "alert-recheck",
      { caseId: (await alertsFor(f))[0].id },
      { jobId: "durable-restart", delay: 3600000 },
    );
    await first.onModuleDestroy();
    assert.equal(
      (await app.get(OperationsService).snapshot()).status,
      "degraded",
    );
    const restarted = new NotificationWorker(
      app.get(Database),
      app.get(ExpoPush),
      app.get(AlertsService),
    );
    try {
      start(restarted);
      await restarted.tick();
      assert(await restarted.queue!.getJob("durable-restart"));
      await advance(15);
      await restarted.tick();
      const a = (await alertsFor(f))[0];
      assert.equal(a.level, 3);
      assert.equal(a.origin_at, origin);
      const snapshot = await new OperationsService(
        app.get(Database),
        restarted,
        app.get(ExpoPush),
      ).snapshot();
      assert.equal(snapshot.status, "ok");
      assert.equal(snapshot.notifications.pushEnabled, false);
      const duplicates = await pg.query(
        "SELECT event_id,membership_id,count(*) FROM notifications GROUP BY event_id,membership_id HAVING count(*)>1",
      );
      assert.equal(duplicates.rows.length, 0);
      await restarted.queue!.pause();
      assert.equal(
        (
          await new OperationsService(
            app.get(Database),
            restarted,
            app.get(ExpoPush),
          ).snapshot()
        ).status,
        "degraded",
      );
      await restarted.queue!.resume();
      assert.equal(
        (
          await new OperationsService(
            app.get(Database),
            restarted,
            app.get(ExpoPush),
          ).snapshot()
        ).status,
        "ok",
      );
    } finally {
      await restarted.onModuleDestroy();
    }
  });

if (real && process.env.QA_BACKUP_DRILL === "true")
  test("backup e restauração do schema de QA preservam contagens, confirmações, correções e auditoria", async () => {
    const target =
      "qa_part10_restore_" + randomUUID().replaceAll("-", "").slice(0, 16);
    assert.match(schema, /^qa_part10_[0-9a-f]{16}$/);
    assert.match(target, /^qa_part10_restore_[0-9a-f]{16}$/);
    // Somente o schema recém-criado por esta suíte; nunca inclui o schema public.
    const dump = spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "caminho",
        "-d",
        "caminho",
        "--schema=" + schema,
        "--no-owner",
        "--no-privileges",
        "--column-inserts",
      ],
      {
        cwd: join(__dirname, "../../.."),
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60000,
      },
    );
    assert.equal(
      dump.status,
      0,
      "pg_dump do schema de QA deve concluir; confira Docker Compose local.",
    );
    assert(dump.stdout.includes("CREATE SCHEMA " + schema));
    const sql = dump.stdout
      .replaceAll(schema, target)
      .replace(/^\\(?:un)?restrict .*$/gm, "");
    try {
      await admin!.query(sql);
      const tables = (
        await admin!.query(
          "SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",
          [schema],
        )
      ).rows;
      assert(tables.length > 20);
      for (const { tablename } of tables) {
        assert.match(tablename, /^[a-z_]+$/);
        const count = async (ns: string) =>
          (
            await admin!.query(
              `SELECT count(*)::int n FROM "${ns}"."${tablename}"`,
            )
          ).rows[0].n;
        assert.equal(
          await count(target),
          await count(schema),
          "Restauração da tabela " + tablename,
        );
      }
      for (const table of [
        "movement_confirmations",
        "confirmation_corrections",
        "exceptional_resolutions",
        "trip_inspections",
        "audit_events",
      ]) {
        const diff = await admin!.query(
          `SELECT * FROM "${schema}"."${table}" EXCEPT SELECT * FROM "${target}"."${table}"`,
        );
        assert.equal(diff.rows.length, 0, "Conteúdo restaurado de " + table);
      }
      console.log(
        "Restauração isolada verificada em",
        tables.length,
        "tabelas.",
      );
    } finally {
      await admin!.query('DROP SCHEMA IF EXISTS "' + target + '" CASCADE');
    }
  });
