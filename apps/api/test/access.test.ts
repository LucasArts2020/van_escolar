import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app";
import { configure } from "../src/bootstrap";
import { Database } from "../src/db";
import { Delivery } from "../src/delivery";
import { seed, demoPassword } from "../src/seed";
let app: INestApplication, pg: PGlite;
const delivered: { kind: string; email: string; token: string }[] = [];
type Login = {
  token: string;
  contexts: { id: string; role: string; organization_id: string }[];
};
const accounts: Record<string, Login> = {};
before(async () => {
  process.env.DEV_DELIVERY = "console";
  pg = new PGlite();
  await pg.exec(readFileSync(join(__dirname, "../src/schema.sql"), "utf8"));
  app = await NestFactory.create(AppModule, { logger: false });
  const db = app.get(Database);
  await db.pool.end();
  db.pool = {
    query: (sql: string, values?: unknown[]) => pg.query(sql, values),
    end: async () => {},
  } as unknown as Database["pool"];
  db.transaction = (async (fn: (tx: unknown) => Promise<unknown>) =>
    pg.transaction((tx) =>
      fn({ query: (sql: string, values?: unknown[]) => tx.query(sql, values) }),
    )) as Database["transaction"];
  app.get(Delivery).send = async (kind, email, token) => {
    delivered.push({ kind, email, token });
  };
  await seed(db);
  configure(app);
  await app.init();
  for (const name of [
    "escola",
    "operacao",
    "motorista",
    "responsavel",
    "outraescola",
  ]) {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Client", "mobile")
      .send({ email: name + "@demo.local", password: demoPassword })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .auth(login.body.token, { type: "bearer" })
      .expect(200);
    accounts[name] = { token: login.body.token, contexts: me.body.contexts };
  }
});
after(async () => {
  await app?.close();
  await pg?.close();
});
const auth = (
  method: "get" | "post" | "patch",
  path: string,
  account: string,
  context?: string,
) => {
  const r = request(app.getHttpServer())
    [method](path)
    .auth(accounts[account].token, { type: "bearer" });
  if (context) r.set("X-Context-Id", context);
  return r;
};
test("sem sessão, identificadores e tokens inventados não liberam acesso", async () => {
  await request(app.getHttpServer()).get("/auth/me").expect(401);
  await request(app.getHttpServer())
    .get("/auth/me")
    .auth("inventado", { type: "bearer" })
    .expect(401);
  await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email: "escola@demo.local", password: "incorreta" })
    .expect(401);
});
test("login web usa cookie HttpOnly e não retorna token no corpo", async () => {
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email: "escola@demo.local", password: demoPassword })
    .expect(201);
  assert.equal(res.body.token, undefined);
  assert.match(String(res.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(res.headers["set-cookie"]), /SameSite=Strict/);
});
test("origem externa não consegue iniciar sessão nem alterar estado", async () => {
  await request(app.getHttpServer())
    .post("/auth/login")
    .set("Origin", "https://indevido.example")
    .send({ email: "escola@demo.local", password: demoPassword })
    .expect(403);
});
test("escola só consulta seu contexto e sua equipe", async () => {
  const own = accounts.escola.contexts[0].id;
  const other = accounts.outraescola.contexts[0].id;
  const result = await auth("get", "/workspace/team", "escola", own).expect(
    200,
  );
  assert.ok(
    result.body.some(
      (m: { email: string }) => m.email === "operacao@demo.local",
    ),
  );
  assert.ok(
    !result.body.some(
      (m: { email: string }) => m.email === "outraescola@demo.local",
    ),
  );
  await auth("get", "/workspace", "escola", other).expect(403);
  await auth("get", "/workspace/team", "escola", other).expect(403);
  await auth("get", "/workspace/audit", "escola", other).expect(403);
  await auth("get", "/workspace", "escola", "invalido").expect(400);
});
test("responsável e motorista não assumem contextos de outra pessoa", async () => {
  for (const who of ["responsavel", "motorista"]) {
    await auth(
      "get",
      "/workspace",
      "" + who,
      accounts.escola.contexts[0].id,
    ).expect(403);
    await auth(
      "get",
      "/workspace/team",
      who,
      accounts[who].contexts[0].id,
    ).expect(403);
  }
  assert.equal(accounts.responsavel.contexts.length, 2);
  for (const context of accounts.responsavel.contexts)
    await auth("get", "/workspace", "responsavel", context.id).expect(200);
});
test("operação da escola não ganha gestão ou coordenação por campos enviados", async () => {
  const ctx = accounts.operacao.contexts[0].id;
  await auth("get", "/workspace/team", "operacao", ctx).expect(403);
  await auth("post", "/workspace/invites", "operacao", ctx)
    .send({ email: "novo@example.com" })
    .expect(403);
  await request(app.getHttpServer())
    .post("/auth/login")
    .send({
      email: "operacao@demo.local",
      password: demoPassword,
      role: "SCHOOL",
      manage_team: true,
    })
    .expect(400);
});
test("trocar ID do membro não altera equipe de outra escola", async () => {
  await auth(
    "patch",
    "/workspace/team/" + accounts.outraescola.contexts[0].id,
    "escola",
    accounts.escola.contexts[0].id,
  )
    .send({ active: false })
    .expect(404);
});
test("gestão pode conceder coordenação e inativação revoga o contexto imediatamente", async () => {
  const ctx = accounts.escola.contexts[0].id,
    target = accounts.operacao.contexts[0].id;
  await auth("patch", "/workspace/team/" + target, "escola", ctx)
    .send({ coordinator: true })
    .expect(200);
  const me = await auth("get", "/auth/me", "operacao").expect(200);
  assert.equal(me.body.contexts[0].coordinator, true);
  await auth("get", "/workspace/team", "operacao", target).expect(403);
  await auth("patch", "/workspace/team/" + target, "escola", ctx)
    .send({ active: false })
    .expect(200);
  await auth("get", "/workspace", "operacao", target).expect(403);
  await auth("patch", "/workspace/team/" + target, "escola", ctx)
    .send({ active: true })
    .expect(200);
  await auth("patch", "/workspace/team/" + ctx, "escola", ctx)
    .send({ active: false })
    .expect(400);
});
test("convite concede somente a escola escolhida, uma única vez, sem gestão", async () => {
  const ctx = accounts.escola.contexts[0].id;
  const res = await auth("post", "/workspace/invites", "escola", ctx)
    .send({ email: "convidado@demo.local" })
    .expect(201);
  assert.equal(res.body.token, undefined);
  const token = delivered.find(
    (d) => d.email === "convidado@demo.local",
  )!.token;
  const body = { token, name: "Pessoa Convidada", password: "SenhaNova@2026!" };
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send(body)
    .expect(201);
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send(body)
    .expect(400);
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .set("X-Client", "mobile")
    .send({ email: "convidado@demo.local", password: body.password })
    .expect(201);
  const me = await request(app.getHttpServer())
    .get("/auth/me")
    .auth(login.body.token, { type: "bearer" })
    .expect(200);
  assert.equal(me.body.contexts.length, 1);
  assert.equal(
    me.body.contexts[0].organization_id,
    accounts.escola.contexts[0].organization_id,
  );
  assert.equal(me.body.contexts[0].manage_team, false);
  assert.equal(me.body.contexts[0].coordinator, false);
});
test("recuperação não expõe conta existente; token só serve uma vez e revoga sessões", async () => {
  const known = await request(app.getHttpServer())
    .post("/auth/recovery")
    .send({ email: "motorista@demo.local" })
    .expect(201);
  const unknown = await request(app.getHttpServer())
    .post("/auth/recovery")
    .send({ email: "naoexiste@demo.local" })
    .expect(201);
  assert.deepEqual(known.body, unknown.body);
  const token = delivered.find((d) => d.kind === "reset")!.token;
  const body = { token, password: "NovaSenha@2026!" };
  await request(app.getHttpServer()).post("/auth/reset").send(body).expect(201);
  await auth("get", "/auth/me", "motorista").expect(401);
  await request(app.getHttpServer()).post("/auth/reset").send(body).expect(400);
  await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email: "motorista@demo.local", password: body.password })
    .expect(201);
});
test("perfil tem autor e auditoria é filtrada por organização", async () => {
  await auth("patch", "/auth/profile", "responsavel")
    .send({ name: "Ana Atualizada" })
    .expect(200);
  const me = await auth("get", "/auth/me", "responsavel").expect(200);
  assert.equal(me.body.user.name, "Ana Atualizada");
  const rows = await pg.query<{ action: string; actor_id: string }>(
    "SELECT action,actor_id FROM audit_events",
  );
  assert.ok(rows.rows.every((r) => r.actor_id));
  assert.ok(rows.rows.some((r) => r.action === "PROFILE_UPDATED"));
  const school = await auth(
    "get",
    "/workspace/audit",
    "escola",
    accounts.escola.contexts[0].id,
  ).expect(200);
  assert.ok(
    !school.body.some(
      (r: { actor_name: string }) => r.actor_name === "Joana Alves",
    ),
  );
});
test("logout invalida token no servidor", async () => {
  await auth("post", "/auth/logout", "responsavel").send({}).expect(201);
  await auth("get", "/auth/me", "responsavel").expect(401);
  await auth("post", "/auth/logout", "responsavel").send({}).expect(201);
});
