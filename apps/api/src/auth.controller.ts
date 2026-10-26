import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Database, audit } from "./db";
import { ActorRequest, AuthGuard, email, password, parse } from "./auth";
import { digest, hashPassword, newToken, verifyPassword } from "./security";
import { config } from "./config";
import { Delivery } from "./delivery";
import { RegistryService } from "./registry.service";
const credentials = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
const tokenSchema = z.string().min(40).max(100);
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Delivery) private delivery: Delivery,
    @Inject(RegistryService) private registry: RegistryService,
  ) {}
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() req: ActorRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(credentials, body);
    const { rows } = await this.db.pool.query(
      "SELECT * FROM users WHERE email=$1",
      [input.email],
    );
    // Mesmo custo de derivação para e-mails inexistentes.
    const valid = await verifyPassword(
      input.password,
      rows[0]?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!rows[0] || !valid)
      throw new UnauthorizedException("E-mail ou senha incorretos.");
    const token = newToken();
    await this.db.transaction(async (db) => {
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
        [digest(token), rows[0].id],
      );
      await audit(db, rows[0].id, "SESSION_STARTED", rows[0].id);
    });
    res.cookie("session", token, {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    return {
      user: { id: rows[0].id, name: rows[0].name, email: rows[0].email },
      ...(req.headers["x-client"] === "mobile" ? { token } : {}),
    };
  }
  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() req: ActorRequest) {
    const { rows } = await this.db.pool.query(
      "SELECT m.id,m.organization_id,o.name organization_name,m.role,m.coordinator,m.manage_team FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active=true ORDER BY o.name,m.role",
      [req.actor.id],
    );
    return { user: req.actor, contexts: rows };
  }
  @Patch("profile")
  @UseGuards(AuthGuard)
  async profile(@Body() body: unknown, @Req() req: ActorRequest) {
    const input = parse(
      z.object({ name: z.string().trim().min(2).max(100) }).strict(),
      body,
    );
    await this.db.transaction(async (db) => {
      await db.query("UPDATE users SET name=$1 WHERE id=$2", [
        input.name,
        req.actor.id,
      ]);
      await audit(db, req.actor.id, "PROFILE_UPDATED", req.actor.id);
    });
    return { ok: true };
  }
  @Post("logout")
  async logout(
    @Req() req: ActorRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] ||
      req.cookies?.session;
    if (typeof token === "string" && token.length <= 200) {
      await this.db.transaction(async (db) => {
        const { rows } = await db.query(
          "DELETE FROM sessions WHERE token_hash=$1 RETURNING user_id",
          [digest(token)],
        );
          await db.query("UPDATE push_devices SET active=false WHERE session_hash=$1", [digest(token)]);
        if (rows[0])
          await audit(db, rows[0].user_id, "SESSION_ENDED", rows[0].user_id);
      });
    }
    res.clearCookie("session", {
      path: "/",
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
    });
    return { ok: true };
  }
  @Post("recovery")
  async recovery(@Body() body: unknown) {
    const input = parse(z.object({ email }).strict(), body);
    this.delivery.assertAvailable();
    const { rows } = await this.db.pool.query(
      "SELECT id FROM users WHERE email=$1",
      [input.email],
    );
    if (rows[0]) {
      const token = newToken();
      await this.db.transaction(async (db) => {
        await db.query(
          "UPDATE access_tokens SET used_at=now() WHERE email=$1 AND type='RESET' AND used_at IS NULL",
          [input.email],
        );
        await db.query(
          "INSERT INTO access_tokens(token_hash,type,email,expires_at,created_by) VALUES($1,'RESET',$2,now()+interval '30 minutes',$3)",
          [digest(token), input.email, rows[0].id],
        );
        await audit(db, rows[0].id, "RECOVERY_REQUESTED", rows[0].id);
      });
      await this.delivery.send("reset", input.email, token);
    }
    return {
      message:
        "Se a conta existir, as instruções serão encaminhadas pelo canal configurado.",
    };
  }
  @Post("reset")
  async reset(@Body() body: unknown) {
    const input = parse(
      z.object({ token: tokenSchema, password }).strict(),
      body,
    );
    const hash = await hashPassword(input.password);
    await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        "SELECT * FROM access_tokens WHERE token_hash=$1 AND type='RESET' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
        [digest(input.token)],
      );
      if (!rows[0]) throw new BadRequestException("Link inválido ou expirado.");
      const user = await db.query(
        "UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id",
        [hash, rows[0].email],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [
        user.rows[0].id,
      ]);
      await db.query(
        "UPDATE access_tokens SET used_at=now() WHERE token_hash=$1",
        [digest(input.token)],
      );
      await audit(db, user.rows[0].id, "PASSWORD_RESET", user.rows[0].id);
    });
    return { ok: true };
  }
  @Post("accept-invite")
  async accept(@Body() body: unknown) {
    const input = parse(
      z
        .object({
          token: tokenSchema,
          name: z.string().trim().min(2).max(100),
          password,
        })
        .strict(),
      body,
    );
    const registryInvite = await this.db.pool.query(
      "SELECT token_hash FROM registry_invites WHERE token_hash=$1",
      [digest(input.token)],
    );
    if (registryInvite.rows[0]) return this.registry.accept(input);
    const hash = await hashPassword(input.password);
    await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        "SELECT * FROM access_tokens WHERE token_hash=$1 AND type='INVITE' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
        [digest(input.token)],
      );
      if (!rows[0])
        throw new BadRequestException("Convite inválido ou expirado.");
      const invite = rows[0];
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        invite.email,
      ]);
      // Convite perde validade se quem convidou perder a gestão da escola.
      const manager = await db.query(
        "SELECT id FROM memberships WHERE user_id=$1 AND organization_id=$2 AND role='SCHOOL' AND active AND manage_team",
        [invite.created_by, invite.organization_id],
      );
      if (!manager.rows[0])
        throw new BadRequestException(
          "O convite precisa ser emitido novamente pela escola.",
        );
      const existing = await db.query(
        "SELECT * FROM users WHERE email=$1 FOR UPDATE",
        [invite.email],
      );
      let userId = existing.rows[0]?.id;
      if (
        userId &&
        !(await verifyPassword(input.password, existing.rows[0].password_hash))
      )
        throw new UnauthorizedException(
          "Já existe uma conta. Use a senha atual ou recupere o acesso.",
        );
      if (!userId) {
        userId = randomUUID();
        await db.query(
          "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
          [userId, input.name, invite.email, hash],
        );
      }
      let membership = await db.query(
        "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'SCHOOL') ON CONFLICT(user_id,organization_id,role) DO UPDATE SET active=true,coordinator=false,manage_team=false WHERE memberships.active=false RETURNING *",
        [randomUUID(), userId, invite.organization_id],
      );
      // Um segundo convite não pode rebaixar permissões de um vínculo já ativo.
      if (!membership.rows[0])
        membership = await db.query(
          "SELECT * FROM memberships WHERE user_id=$1 AND organization_id=$2 AND role='SCHOOL'",
          [userId, invite.organization_id],
        );
      await db.query(
        "UPDATE access_tokens SET used_at=now() WHERE token_hash=$1",
        [digest(input.token)],
      );
      await audit(
        db,
        userId,
        "INVITE_ACCEPTED",
        membership.rows[0].id,
        membership.rows[0],
      );
    });
    return { ok: true };
  }
}
