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
import { Delivery } from "../src/delivery";
import { configure } from "../src/bootstrap";
import { seed, demoPassword } from "../src/seed";
let app: INestApplication, pg: PGlite;
const users: Record<string, { token: string; context: string; org: string }> =
  {};
const sent: { email: string; token: string }[] = [];
const sofia = "20000000-0000-4000-8000-000000000001",
  lucas = "20000000-0000-4000-8000-000000000002",
  privateChild = "20000000-0000-4000-8000-000000000003";
async function login(name: string, password = demoPassword) {
  const email = name.includes("@") ? name : name + "@demo.local";
  const r = await request(app.getHttpServer())
    .post("/auth/login")
    .set("X-Client", "mobile")
    .send({ email, password })
    .expect(201);
  const me = await request(app.getHttpServer())
    .get("/auth/me")
    .auth(r.body.token, { type: "bearer" })
    .expect(200);
  const ctx =
    me.body.contexts.find((c: { role: string }) =>
      name === "responsavel" || name.includes("@")
        ? c.role === "GUARDIAN"
        : true,
    ) || me.body.contexts[0];
  users[name] = {
    token: r.body.token,
    context: ctx.id,
    org: ctx.organization_id,
  };
  return me.body;
}
before(async () => {
  process.env.DEV_DELIVERY = "console";
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
  app.get(Delivery).send = async (_kind, email, token) => {
    sent.push({ email, token });
  };
  await seed(db);
  configure(app);
  await app.init();
  for (const u of ["escola", "motorista", "responsavel", "outraescola"])
    await login(u);
});
after(async () => {
  await app?.close();
  await pg?.close();
});
function api(
  who: string,
  method: "get" | "post" | "patch",
  path: string,
  body?: unknown,
) {
  const u = users[who];
  const r = request(app.getHttpServer())
    [method]("/registry/" + path)
    .auth(u.token, { type: "bearer" })
    .set("X-Context-Id", u.context);
  return body ? r.send(body) : r;
}
test("cadastros e responsáveis respeitam o vínculo específico da criança", async () => {
  const mine = await api("responsavel", "get", "students").expect(200);
  assert.deepEqual(
    mine.body.map((s: { id: string }) => s.id),
    [sofia],
  );
  await api("responsavel", "get", "students/" + privateChild).expect(404);
  await api("responsavel", "get", "students/" + lucas).expect(404);
  await api("motorista", "get", "students/" + privateChild).expect(404);
  await api("escola", "get", "students/" + privateChild).expect(404);
  await api("responsavel", "post", "students", {
    name: "Aluno proibido",
  }).expect(403);
  await api("responsavel", "get", "organizations").expect(403);
});
test("pedido do transporte aparece para escola sem abrir o cadastro completo antes do aceite", async () => {
  await api("escola", "get", "students/" + lucas).expect(404);
  const l = (await api("escola", "get", "links").expect(200)).body.find(
    (v: { student_id: string }) => v.student_id === lucas,
  );
  assert.equal(l.status, "PENDING");
  assert.equal(l.incoming, true);
  await api("motorista", "patch", "links/" + l.id, { action: "ACCEPT" }).expect(
    403,
  );
  await api("escola", "patch", "links/" + l.id, { action: "ACCEPT" }).expect(
    200,
  );
  const child = await api("escola", "get", "students/" + lucas).expect(200);
  assert.equal(child.body.operational, true);
  await api("escola", "patch", "links/" + l.id, { action: "ACCEPT" }).expect(
    409,
  );
});
let createdStudent = "",
  createdLink = "";
test("a escola também inicia vínculo; pendência não concede acesso ao motorista", async () => {
  const s = await api("escola", "post", "students", {
    name: "Bia Oliveira",
    birthDate: "2018-01-03",
  }).expect(201);
  createdStudent = s.body.id;
  const link = await api("escola", "post", "links", {
    studentId: createdStudent,
    counterpartId: users.motorista.org,
  }).expect(201);
  createdLink = link.body.id;
  await api("motorista", "get", "students/" + createdStudent).expect(404);
  await api("motorista", "patch", "links/" + createdLink, {
    action: "ACCEPT",
  }).expect(200);
  await api("motorista", "get", "students/" + createdStudent).expect(200);
  await api("escola", "post", "links", {
    studentId: createdStudent,
    counterpartId: users.motorista.org,
  }).expect(409);
});
test("trocar IDs de vínculo ou aluno não permite aceitar, convidar ou ampliar acesso alheio", async () => {
  await api("outraescola", "patch", "links/" + createdLink, {
    action: "DEACTIVATE",
    reason: "Tentativa fora do escopo",
  }).expect(404);
  await api("motorista", "post", "links", {
    studentId: createdStudent,
    counterpartId: users.outraescola.org,
  }).expect(404);
  await api(
    "motorista",
    "post",
    "students/" + createdStudent + "/guardian-invites",
    { email: "estranho@demo.local" },
  ).expect(404);
  await api("responsavel", "post", "links", {
    studentId: sofia,
    counterpartId: users.motorista.org,
  }).expect(403);
});
test("inativação revoga acesso operacional e mantém aluno, vínculo e autoria", async () => {
  await api("motorista", "patch", "links/" + createdLink, {
    action: "DEACTIVATE",
    reason: "Contrato de transporte encerrado",
  }).expect(200);
  await api("motorista", "get", "students/" + createdStudent).expect(404);
  const owner = await api("escola", "get", "students/" + createdStudent).expect(
    200,
  );
  assert.equal(owner.body.operational, false);
  const row = (
    await pg.query<{ status: string; student_id: string }>(
      "SELECT status,student_id FROM operating_links WHERE id=$1",
      [createdLink],
    )
  ).rows[0];
  assert.equal(row.status, "INACTIVE");
  assert.equal(row.student_id, createdStudent);
  const audit = await pg.query(
    "SELECT actor_id FROM audit_events WHERE target_id=$1",
    [createdLink],
  );
  assert.ok(audit.rows.length >= 3);
  assert.ok(audit.rows.every((r: any) => r.actor_id));
});
test("recusa é preservada e reenvio reutiliza o vínculo, sem duplicar", async () => {
  await api("escola", "post", "links", {
    studentId: createdStudent,
    counterpartId: users.motorista.org,
  }).expect(201);
  await api("motorista", "patch", "links/" + createdLink, {
    action: "REFUSE",
    reason: "Aluno ainda não contratado",
  }).expect(200);
  await api("motorista", "get", "students/" + createdStudent).expect(404);
  const resend = await api("escola", "post", "links", {
    studentId: createdStudent,
    counterpartId: users.motorista.org,
  }).expect(201);
  assert.equal(resend.body.id, createdLink);
  await api("motorista", "patch", "links/" + createdLink, {
    action: "ACCEPT",
  }).expect(200);
});
test("possível duplicidade só consulta o próprio cadastro e exige revisão justificada", async () => {
  await api("escola", "post", "students", { name: "SOFÍA   MENEZES" }).expect(
    409,
  );
  await api("escola", "post", "students", {
    name: "Sofia Menezes",
    duplicateReviewed: true,
  }).expect(409);
  const separate = await api("escola", "post", "students", {
    name: "Sofia Menezes",
    duplicateReviewed: true,
    duplicateReason: "Homônima: dados conferidos com a família",
  }).expect(201);
  assert.notEqual(separate.body.id, sofia);
  const unique = await api("outraescola", "post", "students", {
    name: "Bia Oliveira",
  }).expect(201);
  assert.notEqual(unique.body.id, createdStudent);
});
let guardianId = "",
  guardianToken = "";
test("convite não abre dados da criança antes da verificação, nem permite verificar pelo transporte destinatário", async () => {
  await api(
    "escola",
    "post",
    "students/" + createdStudent + "/guardian-invites",
    { email: "nova.familia@demo.local" },
  ).expect(201);
  guardianToken = sent.find(
    (s) => s.email === "nova.familia@demo.local",
  )!.token;
  const accepted = await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token: guardianToken,
      name: "Nova Família",
      password: demoPassword,
    })
    .expect(201);
  assert.equal(accepted.body.awaitingVerification, true);
  await login("nova.familia@demo.local");
  assert.equal(
    (await api("nova.familia@demo.local", "get", "students").expect(200)).body
      .length,
    0,
  );
  await api(
    "nova.familia@demo.local",
    "get",
    "students/" + createdStudent,
  ).expect(404);
  const statusResult = await api(
    "nova.familia@demo.local",
    "get",
    "guardian-status",
  ).expect(200);
  assert.equal(statusResult.body[0].status, "AWAITING_VERIFICATION");
  assert.equal(statusResult.body[0].student_name, undefined);
  const d = await api("escola", "get", "students/" + createdStudent).expect(
    200,
  );
  guardianId = d.body.guardians[0].id;
  await api("motorista", "patch", "guardian-links/" + guardianId, {
    action: "VERIFY",
    verificationNote: "Verificação pelo transporte sem autorização",
  }).expect(404);
  await api("escola", "patch", "guardian-links/" + guardianId, {
    action: "VERIFY",
    verificationNote: "Curto",
  }).expect(400);
  await api("escola", "patch", "guardian-links/" + guardianId, {
    action: "VERIFY",
    verificationNote: "Documentação e vínculo conferidos presencialmente",
  }).expect(200);
  await api(
    "nova.familia@demo.local",
    "get",
    "students/" + createdStudent,
  ).expect(200);
  await api("nova.familia@demo.local", "get", "students/" + sofia).expect(404);
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token: guardianToken,
      name: "Nova Família",
      password: demoPassword,
    })
    .expect(400);
});
test("inativar responsável revoga somente o vínculo e impede reutilização de convite antigo", async () => {
  await api("escola", "patch", "guardian-links/" + guardianId, {
    action: "DEACTIVATE",
    verificationNote: "Vínculo encerrado após solicitação documentada",
  }).expect(200);
  await api(
    "nova.familia@demo.local",
    "get",
    "students/" + createdStudent,
  ).expect(404);
  await api("responsavel", "get", "students/" + sofia).expect(200);
  await api(
    "escola",
    "post",
    "students/" + createdStudent + "/guardian-invites",
    { email: "nova.familia@demo.local" },
  ).expect(201);
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token: guardianToken,
      name: "Nova Família",
      password: demoPassword,
    })
    .expect(400);
});
test("veículos pertencem ao transporte e ficam visíveis somente a escolas com associação ativa", async () => {
  const v = await api("motorista", "post", "vehicles", {
    name: "Van extra",
    plate: "xyz-2e34",
    capacity: 16,
  }).expect(201);
  await api("motorista", "post", "vehicles", {
    name: "Duplicada",
    plate: "XYZ2E34",
    capacity: 16,
  }).expect(409);
  await api("escola", "post", "vehicles", {
    name: "Sem permissão",
    plate: "XYZ3F45",
    capacity: 12,
  }).expect(403);
  assert.ok(
    (await api("escola", "get", "vehicles").expect(200)).body.some(
      (r: any) => r.id === v.body.id,
    ),
  );
  assert.equal(
    (await api("outraescola", "get", "vehicles").expect(200)).body.length,
    0,
  );
  await api("escola", "patch", "vehicles/" + v.body.id, {
    active: false,
  }).expect(403);
  await api("motorista", "patch", "vehicles/" + v.body.id, {
    active: false,
  }).expect(200);
  assert.equal(
    (
      await pg.query<{ active: boolean }>(
        "SELECT active FROM vehicles WHERE id=$1",
        [v.body.id],
      )
    ).rows[0].active,
    false,
  );
});
test("cadastro de organização cria contexto separado sem transferir alunos", async () => {
  const r = await api("motorista", "post", "organizations", {
    name: "Outra Operação",
  }).expect(201);
  const ctx = request(app.getHttpServer())
    .get("/registry/students")
    .auth(users.motorista.token, { type: "bearer" })
    .set("X-Context-Id", r.body.membershipId);
  assert.deepEqual((await ctx.expect(200)).body, []);
  await api("responsavel", "post", "organizations", {
    name: "Escola indevida",
  }).expect(403);
  await api("escola", "post", "organizations", {
    name: "Escola Independente",
  }).expect(201);
});
test("convite de motorista cria acesso somente ao transporte emissor", async () => {
  await api("motorista", "post", "driver-invites", {
    email: "profissional@demo.local",
    verificationNote: "Vínculo profissional conferido pelo transporte",
  }).expect(201);
  const token = sent.find((s) => s.email === "profissional@demo.local")!.token;
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({ token, name: "Novo Motorista", password: demoPassword })
    .expect(201);
  const me = await login("profissional@demo.local");
  assert.equal(me.contexts.length, 1);
  assert.equal(me.contexts[0].role, "DRIVER");
  assert.equal(me.contexts[0].organization_id, users.motorista.org);
  await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({ token, name: "Novo Motorista", password: demoPassword })
    .expect(400);
});
test('aceitar convite em conta existente exige a senha atual e preserva a identidade',async()=>{
  await api('motorista','post','driver-invites',{email:'responsavel@demo.local',verificationNote:'Vínculo profissional conferido presencialmente'}).expect(201);
  const token=sent.find(s=>s.email==='responsavel@demo.local')!.token;
  await request(app.getHttpServer()).post('/auth/accept-invite').send({token,name:'Nome que não deve substituir',password:'SenhaErrada@2026'}).expect(401);
  await request(app.getHttpServer()).post('/auth/accept-invite').send({token,name:'Nome que não deve substituir',password:demoPassword}).expect(201);
  const me=await login('responsavel');assert.equal(me.user.name,'Ana Menezes');assert.ok(me.contexts.some((c:{role:string;organization_id:string})=>c.role==='DRIVER'&&c.organization_id===users.motorista.org));
});
test('cancelamento e expiração invalidam convites ainda não consumidos',async()=>{
  await api('escola','post','students/'+createdStudent+'/guardian-invites',{email:'cancelado@demo.local'}).expect(201);
  const token=sent.find(s=>s.email==='cancelado@demo.local')!.token;
  const detail=await api('escola','get','students/'+createdStudent).expect(200);const link=detail.body.guardians.find((g:{email:string})=>g.email==='cancelado@demo.local');
  await api('escola','patch','guardian-links/'+link.id,{action:'DEACTIVATE',verificationNote:'Convite cancelado após revisão do cadastro'}).expect(200);
  await api('escola','post','students/'+createdStudent+'/guardian-invites',{email:'cancelado@demo.local'}).expect(201);
  await request(app.getHttpServer()).post('/auth/accept-invite').send({token,name:'Pessoa',password:demoPassword}).expect(400);
  const latest=sent.filter(s=>s.email==='cancelado@demo.local').at(-1)!;
  await pg.query("UPDATE registry_invites SET expires_at=now()-interval '1 minute' WHERE email=$1 AND used_at IS NULL",['cancelado@demo.local']);
  await request(app.getHttpServer()).post('/auth/accept-invite').send({token:latest.token,name:'Pessoa',password:demoPassword}).expect(400);
});
