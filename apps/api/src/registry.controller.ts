import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ActorRequest,
  AuthGuard,
  ContextGuard,
  email,
  parse,
  uuid,
} from "./auth";
import { Database, audit } from "./db";
import { Delivery } from "./delivery";
import { digest, newToken } from "./security";
import { RegistryService, operator } from "./registry.service";
const title = z.string().trim().min(2).max(120);
const note = z
  .string()
  .trim()
  .min(
    10,
    "Descreva a verificação ou justificativa em pelo menos 10 caracteres.",
  )
  .max(1000);
const vehicleInput = z
  .object({
    name: title,
    plate: z
      .string()
      .transform((v) => v.replace(/[-\s]/g, "").toUpperCase())
      .pipe(
        z
          .string()
          .regex(
            /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/,
            "Placa brasileira inválida.",
          ),
      ),
    capacity: z.number().int().min(1).max(60),
  })
  .strict();
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
@Controller("registry")
@UseGuards(AuthGuard, ContextGuard)
export class RegistryController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(RegistryService) private registry: RegistryService,
    @Inject(Delivery) private delivery: Delivery,
  ) {}
  @Get("organizations")
  async organizations(@Req() req: ActorRequest) {
    operator(req);
    return (
      await this.db.pool.query(
        "SELECT id,name,kind FROM organizations WHERE kind IN ('SCHOOL','TRANSPORT') ORDER BY name",
      )
    ).rows;
  }
  @Post("organizations")
  async createOrganization(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req),
      input = parse(z.object({ name: title }).strict(), body);
    return this.db.transaction(async (db) => {
      const id = randomUUID(),
        membershipId = randomUUID();
      await db.query(
        "INSERT INTO organizations(id,name,kind) VALUES($1,$2,$3)",
        [id, input.name, c.role === "SCHOOL" ? "SCHOOL" : "TRANSPORT"],
      );
      const m = (
        await db.query(
          "INSERT INTO memberships(id,user_id,organization_id,role,manage_team) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [membershipId, req.actor.id, id, c.role, c.role === "SCHOOL"],
        )
      ).rows[0];
      await audit(db, req.actor.id, "ORGANIZATION_CREATED", id, m);
      return { id, membershipId };
    });
  }
  @Patch("organization")
  async updateOrganization(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req);
    if (c.role === "SCHOOL" && !c.manage_team)
      throw new ForbiddenException(
        "A alteração da escola exige gestão de equipe.",
      );
    const input = parse(z.object({ name: title }).strict(), body);
    await this.db.transaction(async (db) => {
      await db.query("UPDATE organizations SET name=$1 WHERE id=$2", [
        input.name,
        c.organization_id,
      ]);
      await audit(
        db,
        req.actor.id,
        "ORGANIZATION_UPDATED",
        c.organization_id,
        c,
      );
    });
    return { ok: true };
  }
  @Get("students")
  async students(@Req() req: ActorRequest) {
    const c = req.context!;
    return (
      await this.db.pool.query(
        `SELECT s.id,s.name,s.birth_date::text birth_date,s.owner_organization_id,o.name owner_name,
      EXISTS(SELECT 1 FROM operating_links l WHERE l.student_id=s.id AND l.status='ACTIVE' AND (l.school_id=$1 OR l.transport_id=$1)) operational
      FROM students s JOIN organizations o ON o.id=s.owner_organization_id WHERE
      ($2 IN ('SCHOOL','DRIVER') AND (s.owner_organization_id=$1 OR EXISTS(SELECT 1 FROM operating_links l WHERE l.student_id=s.id AND l.status='ACTIVE' AND (l.school_id=$1 OR l.transport_id=$1))))
      OR ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=s.id AND g.user_id=$3 AND g.status='ACTIVE')) ORDER BY s.name`,
        [c.organization_id, c.role, req.actor.id],
      )
    ).rows;
  }
  @Post("students")
  async createStudent(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req),
      input = parse(
        z
          .object({
            name: title,
            birthDate: z.iso.date().optional(),
            duplicateReviewed: z.boolean().optional(),
            duplicateReason: note.optional(),
          })
          .strict(),
        body,
      );
    if (
      input.birthDate &&
      input.birthDate > new Date().toISOString().slice(0, 10)
    )
      throw new BadRequestException(
        "A data de nascimento não pode estar no futuro.",
      );
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        c.organization_id,
      ]);
      const duplicates = await db.query(
        "SELECT id FROM students WHERE owner_organization_id=$1 AND normalized_name=$2",
        [c.organization_id, normalized(input.name)],
      );
      if (
        duplicates.rows.length &&
        (!input.duplicateReviewed || !input.duplicateReason)
      )
        throw new ConflictException(
          "Existe cadastro com o mesmo nome neste contexto. Revise a lista e justifique a criação de um cadastro separado.",
        );
      const id = randomUUID();
      await db.query(
        "INSERT INTO students(id,name,normalized_name,birth_date,owner_organization_id,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.name,
          normalized(input.name),
          input.birthDate || null,
          c.organization_id,
          req.actor.id,
        ],
      );
      await audit(db, req.actor.id, "STUDENT_CREATED", id, c, {
        duplicateIds: duplicates.rows.map((r) => r.id),
        reason: input.duplicateReason,
      });
      return { id };
    });
  }
  @Get("students/:id")
  async detail(@Req() req: ActorRequest, @Param("id") id: string) {
    parse(uuid, id);
    const student = await this.registry.student(req, id);
    const c = req.context!,
      owner =
        c.role !== "GUARDIAN" &&
        student.owner_organization_id === c.organization_id;
    const guardians =
      c.role === "GUARDIAN"
        ? []
        : (
            await this.db.pool.query(
              `SELECT g.id,g.email,g.status,u.name FROM guardian_links g LEFT JOIN users u ON u.id=g.user_id WHERE g.student_id=$1 AND ($2 OR g.status='ACTIVE') ORDER BY g.created_at`,
              [id, owner],
            )
          ).rows;
    return { ...student, canManageGuardians: owner, guardians };
  }
  @Get("links")
  async links(@Req() req: ActorRequest) {
    const c = operator(req);
    return (
      await this.db.pool.query(
        `SELECT l.*,s.name student_name,sc.name school_name,t.name transport_name,
      l.initiated_by_organization_id<>$1 incoming FROM operating_links l JOIN students s ON s.id=l.student_id JOIN organizations sc ON sc.id=l.school_id JOIN organizations t ON t.id=l.transport_id
      WHERE l.school_id=$1 OR l.transport_id=$1 ORDER BY l.changed_at DESC`,
        [c.organization_id],
      )
    ).rows;
  }
  @Post("links")
  async createLink(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req),
      input = parse(
        z.object({ studentId: uuid, counterpartId: uuid }).strict(),
        body,
      );
    return this.db.transaction(async (db) => {
      // Somente o detentor do cadastro inicia novas associações; o destinatário aceita ou recusa.
      const student = await this.registry.student(
        req,
        input.studentId,
        db,
        true,
        true,
      );
      const counterpart = (
        await db.query("SELECT * FROM organizations WHERE id=$1 AND kind=$2", [
          input.counterpartId,
          c.role === "SCHOOL" ? "TRANSPORT" : "SCHOOL",
        ])
      ).rows[0];
      if (!counterpart)
        throw new BadRequestException(
          "Selecione uma organização do outro tipo.",
        );
      const school = c.role === "SCHOOL" ? c.organization_id : counterpart.id,
        transport = c.role === "DRIVER" ? c.organization_id : counterpart.id;
      const current = (
        await db.query(
          "SELECT * FROM operating_links WHERE student_id=$1 AND school_id=$2 AND transport_id=$3 FOR UPDATE",
          [student.id, school, transport],
        )
      ).rows[0];
      if (current && ["PENDING", "ACTIVE"].includes(current.status))
        throw new ConflictException(
          "Já existe solicitação pendente ou vínculo ativo para esta associação.",
        );
      const id = current?.id || randomUUID();
      if (current)
        await db.query(
          "UPDATE operating_links SET status='PENDING',initiated_by_organization_id=$1,changed_by=$2,changed_at=now() WHERE id=$3",
          [c.organization_id, req.actor.id, id],
        );
      else
        await db.query(
          "INSERT INTO operating_links(id,student_id,school_id,transport_id,initiated_by_organization_id,status,created_by,changed_by) VALUES($1,$2,$3,$4,$5,'PENDING',$6,$6)",
          [id, student.id, school, transport, c.organization_id, req.actor.id],
        );
      await audit(db, req.actor.id, "OPERATING_LINK_REQUESTED", id, c, {
        studentId: student.id,
        schoolId: school,
        transportId: transport,
      });
      return { id };
    });
  }
  @Patch("links/:id")
  async updateLink(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const c = operator(req);
    parse(uuid, id);
    const input = parse(
      z
        .object({
          action: z.enum(["ACCEPT", "REFUSE", "DEACTIVATE"]),
          reason: note.optional(),
        })
        .strict(),
      body,
    );
    await this.db.transaction(async (db) => {
      const l = (
        await db.query(
          "SELECT * FROM operating_links WHERE id=$1 AND (school_id=$2 OR transport_id=$2) FOR UPDATE",
          [id, c.organization_id],
        )
      ).rows[0];
      if (!l)
        throw new NotFoundException("Vínculo não encontrado neste contexto.");
      if (input.action === "DEACTIVATE") {
        if (!["ACTIVE", "PENDING"].includes(l.status))
          throw new ConflictException("O vínculo já está encerrado.");
      } else {
        if (l.initiated_by_organization_id === c.organization_id)
          throw new ForbiddenException(
            "O aceite ou recusa deve ser registrado pela outra organização.",
          );
        if (l.status !== "PENDING")
          throw new ConflictException("A solicitação não está pendente.");
      }
      if (input.action !== "ACCEPT" && !input.reason)
        throw new BadRequestException(
          "Informe o motivo da recusa ou inativação.",
        );
      const status = {
        ACCEPT: "ACTIVE",
        REFUSE: "REFUSED",
        DEACTIVATE: "INACTIVE",
      }[input.action];
      await db.query(
        "UPDATE operating_links SET status=$1,changed_by=$2,changed_at=now() WHERE id=$3",
        [status, req.actor.id, id],
      );
      await audit(db, req.actor.id, "OPERATING_LINK_" + status, id, c, {
        previousStatus: l.status,
        reason: input.reason,
      });
    });
    return { ok: true };
  }
  @Post("students/:id/guardian-invites")
  async inviteGuardian(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const c = operator(req);
    parse(uuid, id);
    const input = parse(z.object({ email }).strict(), body);
    this.delivery.assertAvailable();
    const token = newToken();
    await this.db.transaction(async (db) => {
      await this.registry.student(req, id, db, true, true);
      const current = (
        await db.query(
          "SELECT * FROM guardian_links WHERE student_id=$1 AND email=$2 FOR UPDATE",
          [id, input.email],
        )
      ).rows[0];
      if (current && current.status !== "INACTIVE")
        throw new ConflictException(
          "Já existe convite ou vínculo em análise/ativo para este responsável.",
        );
      const linkId = current?.id || randomUUID();
      await db.query(
        "UPDATE registry_invites SET used_at=now() WHERE guardian_link_id=$1 AND used_at IS NULL",
        [linkId],
      );
      if (current)
        await db.query(
          "UPDATE guardian_links SET status='INVITED',verified_by=NULL,verified_at=NULL,verification_note=NULL WHERE id=$1",
          [linkId],
        );
      else
        await db.query(
          "INSERT INTO guardian_links(id,student_id,email,status,created_by) VALUES($1,$2,$3,'INVITED',$4)",
          [linkId, id, input.email, req.actor.id],
        );
      await db.query(
        "INSERT INTO registry_invites(token_hash,kind,email,organization_id,guardian_link_id,created_by,membership_id,expires_at) VALUES($1,'GUARDIAN',$2,$3,$4,$5,$6,now()+interval '48 hours')",
        [
          digest(token),
          input.email,
          c.organization_id,
          linkId,
          req.actor.id,
          c.id,
        ],
      );
      await audit(db, req.actor.id, "GUARDIAN_INVITED", linkId, c, {
        studentId: id,
      });
    });
    await this.delivery.send("invite", input.email, token);
    return {
      message:
        "Convite criado. Após o aceite, confira e verifique o vínculo com a criança.",
    };
  }
  @Patch("guardian-links/:id")
  async verifyGuardian(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const c = operator(req);
    parse(uuid, id);
    const input = parse(
      z
        .object({
          action: z.enum(["VERIFY", "DEACTIVATE"]),
          verificationNote: note,
        })
        .strict(),
      body,
    );
    await this.db.transaction(async (db) => {
      const candidate = (
        await db.query(
          "SELECT g.student_id FROM guardian_links g JOIN students s ON s.id=g.student_id WHERE g.id=$1 AND s.owner_organization_id=$2",
          [id, c.organization_id],
        )
      ).rows[0];
      if (!candidate)
        throw new NotFoundException("Vínculo não encontrado neste contexto.");
      await this.registry.student(req, candidate.student_id, db, true, true);
      const g = (
        await db.query(
          "SELECT g.* FROM guardian_links g JOIN students s ON s.id=g.student_id WHERE g.id=$1 AND s.owner_organization_id=$2 FOR UPDATE OF g",
          [id, c.organization_id],
        )
      ).rows[0];
      if (!g)
        throw new NotFoundException("Vínculo não encontrado neste contexto.");
      if (input.action === "VERIFY" && g.status !== "AWAITING_VERIFICATION")
        throw new ConflictException(
          "Aguarde o aceite do convite antes de verificar o vínculo.",
        );
      if (input.action === "DEACTIVATE" && g.status === "INACTIVE")
        throw new ConflictException("O vínculo já está inativo.");
      if (input.action === "VERIFY")
        await db.query(
          "UPDATE guardian_links SET status='ACTIVE',verified_by=$1,verified_at=now(),verification_note=$2 WHERE id=$3",
          [req.actor.id, input.verificationNote, id],
        );
      else {
        await db.query(
          "UPDATE guardian_links SET status='INACTIVE' WHERE id=$1",
          [id],
        );
        await db.query(
          "UPDATE registry_invites SET used_at=now() WHERE guardian_link_id=$1 AND used_at IS NULL",
          [id],
        );
      }
      await audit(
        db,
        req.actor.id,
        "GUARDIAN_" + (input.action === "VERIFY" ? "VERIFIED" : "DEACTIVATED"),
        id,
        c,
        { studentId: g.student_id, verificationNote: input.verificationNote },
      );
    });
    return { ok: true };
  }
  @Get("guardian-status")
  async guardianStatus(@Req() req: ActorRequest) {
    if (req.context?.role !== "GUARDIAN")
      throw new ForbiddenException("Selecione seu contexto de responsável.");
    return (
      await this.db.pool.query(
        "SELECT g.id,g.status,o.name organization_name FROM guardian_links g JOIN students s ON s.id=g.student_id JOIN organizations o ON o.id=s.owner_organization_id WHERE g.user_id=$1 ORDER BY g.created_at",
        [req.actor.id],
      )
    ).rows;
  }
  @Get("vehicles")
  async vehicles(@Req() req: ActorRequest) {
    const c = operator(req);
    return (
      await this.db.pool.query(
        `SELECT v.*,o.name transport_name FROM vehicles v JOIN organizations o ON o.id=v.organization_id WHERE
      ($2='DRIVER' AND v.organization_id=$1) OR ($2='SCHOOL' AND EXISTS(SELECT 1 FROM operating_links l WHERE l.school_id=$1 AND l.transport_id=v.organization_id AND l.status='ACTIVE')) ORDER BY v.name`,
        [c.organization_id, c.role],
      )
    ).rows;
  }
  @Post("vehicles")
  async createVehicle(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req);
    if (c.role !== "DRIVER")
      throw new ForbiddenException(
        "O veículo deve ser cadastrado pelo transporte.",
      );
    const input = parse(vehicleInput, body);
    return this.db.transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        c.organization_id,
      ]);
      const exists = await db.query(
        "SELECT id FROM vehicles WHERE organization_id=$1 AND plate=$2",
        [c.organization_id, input.plate],
      );
      if (exists.rows[0])
        throw new ConflictException(
          "Esta placa já está cadastrada neste transporte.",
        );
      const id = randomUUID();
      await db.query(
        "INSERT INTO vehicles(id,organization_id,name,plate,capacity,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          c.organization_id,
          input.name,
          input.plate,
          input.capacity,
          req.actor.id,
        ],
      );
      await audit(db, req.actor.id, "VEHICLE_CREATED", id, c);
      return { id };
    });
  }
  @Patch("vehicles/:id")
  async vehicleState(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const c = operator(req);
    if (c.role !== "DRIVER")
      throw new ForbiddenException(
        "Somente o transporte pode alterar o veículo.",
      );
    parse(uuid, id);
    const input = parse(z.object({ active: z.boolean() }).strict(), body);
    await this.db.transaction(async (db) => {
      const r = await db.query(
        "UPDATE vehicles SET active=$1 WHERE id=$2 AND organization_id=$3 RETURNING id",
        [input.active, id, c.organization_id],
      );
      if (!r.rows[0])
        throw new NotFoundException("Veículo não encontrado neste transporte.");
      await audit(db, req.actor.id, "VEHICLE_STATUS_UPDATED", id, c, input);
    });
    return { ok: true };
  }
  @Get("drivers")
  async drivers(@Req() req: ActorRequest) {
    const c = operator(req);
    return (
      await this.db.pool.query(
        `SELECT m.id,u.name,o.name transport_name FROM memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.role='DRIVER' AND m.active AND
      (($2='DRIVER' AND m.organization_id=$1) OR ($2='SCHOOL' AND EXISTS(SELECT 1 FROM operating_links l WHERE l.school_id=$1 AND l.transport_id=m.organization_id AND l.status='ACTIVE'))) ORDER BY u.name`,
        [c.organization_id, c.role],
      )
    ).rows;
  }
  @Post("driver-invites")
  async inviteDriver(@Req() req: ActorRequest, @Body() body: unknown) {
    const c = operator(req);
    if (c.role !== "DRIVER")
      throw new ForbiddenException(
        "Somente o transporte pode convidar seus motoristas.",
      );
    const input = parse(
      z.object({ email, verificationNote: note }).strict(),
      body,
    );
    this.delivery.assertAvailable();
    const token = newToken();
    await this.db.transaction(async (db) => {
      await db.query(
        "INSERT INTO registry_invites(token_hash,kind,email,organization_id,created_by,membership_id,verification_note,expires_at) VALUES($1,'DRIVER',$2,$3,$4,$5,$6,now()+interval '48 hours')",
        [
          digest(token),
          input.email,
          c.organization_id,
          req.actor.id,
          c.id,
          input.verificationNote,
        ],
      );
      await audit(db, req.actor.id, "DRIVER_INVITED", digest(token), c, {
        verificationNote: input.verificationNote,
      });
    });
    await this.delivery.send("invite", input.email, token);
    return { message: "Convite de motorista criado para este transporte." };
  }
}
