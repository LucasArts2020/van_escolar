import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { ActorRequest, Membership } from "./auth";
import { Database, audit } from "./db";
import { digest, hashPassword, verifyPassword } from "./security";
type Queryable = Pick<PoolClient, "query">;
export function operator(req: ActorRequest): Membership {
  if (!req.context || !["SCHOOL", "DRIVER"].includes(req.context.role))
    throw new ForbiddenException(
      "Esta ação exige um vínculo de escola ou transporte.",
    );
  return req.context;
}
@Injectable()
export class RegistryService {
  constructor(@Inject(Database) private db: Database) {}
  async student(
    req: ActorRequest,
    id: string,
    db: Queryable = this.db.pool,
    ownerOnly = false,
    lock = false,
  ) {
    const c = req.context!;
    const { rows } = await db.query(
      `SELECT s.*,s.birth_date::text birth_date,
      EXISTS(SELECT 1 FROM operating_links l WHERE l.student_id=s.id AND l.status='ACTIVE' AND (l.school_id=$2 OR l.transport_id=$2)) operational
      FROM students s WHERE s.id=$1 AND (
      ($3 IN ('SCHOOL','DRIVER') AND (s.owner_organization_id=$2 OR (NOT $5 AND EXISTS(SELECT 1 FROM operating_links l WHERE l.student_id=s.id AND l.status='ACTIVE' AND (l.school_id=$2 OR l.transport_id=$2)))))
      OR (NOT $5 AND $3='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=s.id AND g.user_id=$4 AND g.status='ACTIVE'))
      ) ${lock ? "FOR UPDATE OF s" : ""}`,
      [id, c.organization_id, c.role, req.actor.id, ownerOnly],
    );
    if (!rows[0])
      throw new NotFoundException("Aluno não encontrado neste contexto.");
    return rows[0];
  }
  async accept(input: { token: string; name: string; password: string }) {
    const hash = await hashPassword(input.password);
    return this.db.transaction(async (db) => {
      const candidate = (
        await db.query(
          "SELECT i.kind,g.student_id FROM registry_invites i LEFT JOIN guardian_links g ON g.id=i.guardian_link_id WHERE i.token_hash=$1",
          [digest(input.token)],
        )
      ).rows[0];
      if (candidate?.kind === "GUARDIAN")
        await db.query("SELECT id FROM students WHERE id=$1 FOR UPDATE", [
          candidate.student_id,
        ]);
      const { rows } = await db.query(
        "SELECT * FROM registry_invites WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
        [digest(input.token)],
      );
      const invite = rows[0];
      if (!invite)
        throw new BadRequestException("Convite inválido ou expirado.");
      const source = (
        await db.query(
          "SELECT * FROM memberships WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND active=true AND (($4='DRIVER' AND role='DRIVER') OR ($4='GUARDIAN' AND role IN ('SCHOOL','DRIVER')))",
          [
            invite.membership_id,
            invite.created_by,
            invite.organization_id,
            invite.kind,
          ],
        )
      ).rows[0];
      if (!source)
        throw new BadRequestException(
          "O convite precisa ser emitido novamente pela organização.",
        );
      let guardian;
      if (invite.kind === "GUARDIAN") {
        guardian = (
          await db.query(
            "SELECT g.* FROM guardian_links g JOIN students s ON s.id=g.student_id WHERE g.id=$1 AND g.status='INVITED' AND g.email=$2 AND s.owner_organization_id=$3 FOR UPDATE OF g",
            [invite.guardian_link_id, invite.email, invite.organization_id],
          )
        ).rows[0];
        if (!guardian)
          throw new BadRequestException(
            "Vínculo indisponível para este convite.",
          );
      }
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        invite.email,
      ]);
      const existing = (
        await db.query("SELECT * FROM users WHERE email=$1 FOR UPDATE", [
          invite.email,
        ])
      ).rows[0];
      if (
        existing &&
        !(await verifyPassword(input.password, existing.password_hash))
      )
        throw new UnauthorizedException(
          "Já existe uma conta. Use a senha atual ou recupere o acesso.",
        );
      const userId = existing?.id || randomUUID();
      if (!existing)
        await db.query(
          "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
          [userId, input.name, invite.email, hash],
        );
      if (invite.kind === "DRIVER") {
        await db.query(
          "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'DRIVER') ON CONFLICT(user_id,organization_id,role) DO UPDATE SET active=true",
          [randomUUID(), userId, invite.organization_id],
        );
      } else {
        const membership = await db.query(
          "SELECT id FROM memberships WHERE user_id=$1 AND role='GUARDIAN' AND active=true",
          [userId],
        );
        if (!membership.rows[0]) {
          const orgId = randomUUID();
          await db.query(
            "INSERT INTO organizations(id,name,kind) VALUES($1,$2,'FAMILY')",
            [orgId, "Contexto familiar de " + (existing?.name || input.name)],
          );
          await db.query(
            "INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,'GUARDIAN')",
            [randomUUID(), userId, orgId],
          );
        }
        await db.query(
          "UPDATE guardian_links SET user_id=$1,status='AWAITING_VERIFICATION' WHERE id=$2",
          [userId, guardian.id],
        );
      }
      await db.query(
        "UPDATE registry_invites SET used_at=now() WHERE token_hash=$1",
        [digest(input.token)],
      );
      await audit(
        db,
        userId,
        invite.kind + "_INVITE_ACCEPTED",
        guardian?.id || invite.organization_id,
        { organization_id: invite.organization_id },
        { role: invite.kind, issuedBy: invite.created_by },
      );
      return { ok: true, awaitingVerification: invite.kind === "GUARDIAN" };
    });
  }
}
