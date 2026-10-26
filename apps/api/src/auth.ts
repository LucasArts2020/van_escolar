import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { Database } from "./db";
import { digest } from "./security";
export type Membership = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: "GUARDIAN" | "DRIVER" | "SCHOOL";
  coordinator: boolean;
  manage_team: boolean;
};
export type ActorRequest = Request & {
  actor: { id: string; name: string; email: string };
  tokenHash: string;
  context?: Membership;
};
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => i.message).join("; "),
    );
  return result.data;
}
export const uuid = z.uuid("Identificador inválido.");
export const password = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .max(128);
export const email = z
  .email("E-mail inválido.")
  .max(254)
  .transform((s) => s.toLowerCase().trim());
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Database) private db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ActorRequest>();
    const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const token = bearer || req.cookies?.session;
    if (typeof token !== "string" || token.length > 200)
      throw new UnauthorizedException("Entre para continuar.");
    req.tokenHash = digest(token);
    const { rows } = await this.db.pool.query(
      "SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [req.tokenHash],
    );
    if (!rows[0])
      throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    req.actor = rows[0];
    return true;
  }
}
@Injectable()
export class ContextGuard implements CanActivate {
  constructor(@Inject(Database) private db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ActorRequest>();
    const id = parse(uuid, req.headers["x-context-id"]);
    const { rows } = await this.db.pool.query(
      "SELECT m.*,o.name organization_name FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.user_id=$2 AND m.active=true",
      [id, req.actor.id],
    );
    if (!rows[0]) throw new ForbiddenException("Contexto não autorizado.");
    req.context = rows[0];
    return true;
  }
}
export function requireManager(req: ActorRequest): Membership {
  if (req.context?.role !== "SCHOOL" || !req.context.manage_team)
    throw new ForbiddenException(
      "A gestão de equipe exige permissão específica da escola.",
    );
  return req.context;
}
