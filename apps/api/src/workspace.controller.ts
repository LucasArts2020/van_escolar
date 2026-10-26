import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { Database, audit } from "./db";
import {
  ActorRequest,
  AuthGuard,
  ContextGuard,
  email,
  parse,
  requireManager,
  uuid,
} from "./auth";
import { digest, newToken } from "./security";
import { Delivery } from "./delivery";
@Controller("workspace")
@UseGuards(AuthGuard, ContextGuard)
export class WorkspaceController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Delivery) private delivery: Delivery,
  ) {}
  @Get()
  async workspace(@Req() req: ActorRequest) {
    return {
      context: req.context,
      stage: 10,
      message:
        "Integração e preparação para operação disponíveis para teste da Parte 10. Uso real ainda não liberado.",
    };
  }
  @Get("team")
  async team(@Req() req: ActorRequest) {
    const context = requireManager(req);
    const { rows } = await this.db.pool.query(
      "SELECT m.id,u.name,u.email,m.coordinator,m.manage_team,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='SCHOOL' ORDER BY u.name",
      [context.organization_id],
    );
    return rows;
  }
  @Post("invites")
  async invite(@Req() req: ActorRequest, @Body() body: unknown) {
    const context = requireManager(req);
    const input = parse(z.object({ email }).strict(), body);
    this.delivery.assertAvailable();
    const token = newToken();
    await this.db.transaction(async (db) => {
      const current = await db.query(
        "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.email=$2 AND m.role='SCHOOL' AND m.active",
        [context.organization_id, input.email],
      );
      if (current.rows[0])
        throw new ConflictException("Esta pessoa já faz parte da equipe.");
      await db.query(
        "INSERT INTO access_tokens(token_hash,type,email,organization_id,role,expires_at,created_by) VALUES($1,'INVITE',$2,$3,'SCHOOL',now()+interval '48 hours',$4)",
        [digest(token), input.email, context.organization_id, req.actor.id],
      );
      await audit(
        db,
        req.actor.id,
        "TEAM_INVITE_CREATED",
        digest(token),
        context,
        { email: input.email },
      );
    });
    await this.delivery.send("invite", input.email, token);
    return {
      message: "Convite criado. Consulte o canal configurado para entrega.",
    };
  }
  @Patch("team/:id")
  async updateTeam(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const context = requireManager(req);
    parse(uuid, id);
    const input = parse(
      z
        .object({
          coordinator: z.boolean().optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0, "Informe uma alteração."),
      body,
    );
    await this.db.transaction(async (db) => {
      // Serializa alterações da equipe no escopo da escola.
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        context.organization_id,
      ]);
      const { rows } = await db.query(
        "SELECT * FROM memberships WHERE id=$1 AND organization_id=$2 AND role='SCHOOL' FOR UPDATE",
        [id, context.organization_id],
      );
      if (!rows[0])
        throw new NotFoundException("Pessoa não encontrada nesta equipe.");
      if (rows[0].user_id === req.actor.id)
        throw new BadRequestException(
          "Outra pessoa autorizada deve alterar suas permissões.",
        );
      if (rows[0].manage_team && input.active === false) {
        const count = await db.query(
          "SELECT count(*)::int total FROM memberships WHERE organization_id=$1 AND active AND manage_team AND role='SCHOOL'",
          [context.organization_id],
        );
        if (count.rows[0].total <= 1)
          throw new BadRequestException(
            "A escola precisa manter uma pessoa com gestão de equipe.",
          );
      }
      await db.query(
        "UPDATE memberships SET coordinator=COALESCE($1,coordinator),active=COALESCE($2,active) WHERE id=$3",
        [input.coordinator, input.active, id],
      );
      await audit(
        db,
        req.actor.id,
        "TEAM_PERMISSIONS_UPDATED",
        id,
        context,
        input,
      );
    });
    return { ok: true };
  }
  @Get("audit")
  async history(@Req() req: ActorRequest) {
    const context = requireManager(req);
    const { rows } = await this.db.pool.query(
      "SELECT a.id,a.action,a.target_id,a.created_at,u.name actor_name FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 50",
      [context.organization_id],
    );
    return rows;
  }
}
