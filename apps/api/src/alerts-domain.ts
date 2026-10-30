import { createResolutionReceipts } from "./resolution-receipts";
import { randomUUID, createHash } from "node:crypto";
import { PoolClient } from "pg";
import { audit } from "./db";
import { currentException } from "./history-domain";
export type Tx = Pick<PoolClient, "query">;
export const levelLabels = ["Pendência", "Lembrete", "Atenção", "Crítico"];
export const kindLabels: Record<string, string> = {
  CONFIRMATION_PENDING: "Confirmação pendente",
  SEQUENCE_INCOMPLETE: "Sequência incompleta",
  NOT_LOCATED: "Criança não localizada",
  RECEIPT_DISPUTED: "Recebimento contestado",
  ROUTE_END_PENDING: "Contabilização pendente no encerramento",
  CORRECTION_CONFLICT: "Confirmação em correção",
};
export const alertJoin = `FROM alert_cases a JOIN movements v ON v.id=a.movement_id JOIN trip_passengers p ON p.id=v.passenger_id
 JOIN trips t ON t.id=p.trip_id JOIN operating_links l ON l.id=p.operating_link_id`;
export const alertScope = `l.status='ACTIVE' AND p.active AND (
 ($2='DRIVER' AND t.transport_id=$1) OR ($2='SCHOOL' AND p.school_id=$1) OR
 ($2='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=$3 AND g.status='ACTIVE')))`;
export async function caseRow(db: Tx, id: string) {
  return (
    await db.query(
      `SELECT a.*,v.kind movement_kind,v.counterpart_role,p.id passenger_id,p.student_id,p.student_name,p.school_id,p.disposition,p.active,
 p.boarding_validated_at,p.delivery_validated_at,t.id trip_id,t.direction,t.transport_id,t.driver_user_id,t.driver_membership_id,t.status trip_status,
 t.service_date::text service_date,t.timezone,l.status link_status ${alertJoin} WHERE a.id=$1`,
      [id],
    )
  ).rows[0];
}
export async function confirmations(db: Tx, movementId: string) {
  return (
    await db.query(
      "SELECT c.* FROM movement_confirmations c WHERE movement_id=$1 AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED') ORDER BY received_at,id",
      [movementId],
    )
  ).rows;
}
export async function alertEvent(
  db: Tx,
  a: any,
  type: string,
  now: Date,
  details: any,
  actor?: { id: string; name: string; role: string; membershipId?: string },
) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO alert_events(id,case_id,type,actor_id,membership_id,actor_name,role,occurred_at,details,position)
 SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE(max(position),0)+1 FROM alert_events WHERE case_id=$2`,
    [
      id,
      a.id,
      type,
      actor?.id || null,
      actor?.membershipId || null,
      actor?.name || "Processamento do sistema",
      actor?.role || "SYSTEM",
      now,
      JSON.stringify(details),
    ],
  );
  if (actor) {
    const membership = actor.membershipId
      ? (
          await db.query(
            "SELECT organization_id FROM memberships WHERE id=$1",
            [actor.membershipId],
          )
        ).rows[0]
      : null;
    await audit(
      db,
      actor.id,
      "ALERT_" + type,
      a.id,
      membership
        ? {
            id: actor.membershipId,
            organization_id: membership.organization_id,
          }
        : undefined,
      details,
    );
  }
  return id;
}
export function nextDue(origin: Date, level: number, policy: any) {
  if (!policy || level >= 3) return null;
  const minutes = [
    policy.reminder_minutes,
    policy.attention_minutes,
    policy.critical_minutes,
  ][level];
  return new Date(new Date(origin).getTime() + minutes * 60000);
}
export function computedLevel(a: any, now: Date) {
  let level = a.level;
  if (!a.policy_snapshot) return level;
  const elapsed = (now.getTime() - new Date(a.origin_at).getTime()) / 60000;
  if (elapsed >= a.policy_snapshot.critical_minutes) level = 3;
  else if (elapsed >= a.policy_snapshot.attention_minutes)
    level = Math.max(level, 2);
  else if (elapsed >= a.policy_snapshot.reminder_minutes)
    level = Math.max(level, 1);
  return level;
}
async function alertRecipients(db: Tx, a: any) {
  return (
    await db.query(
      `SELECT DISTINCT m.*,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.active AND (
 m.id=$1 OR (m.role='SCHOOL' AND m.organization_id=$2 AND ($3='SCHOOL' OR ($5='CORRECTION_CONFLICT' AND m.coordinator))) OR
 (m.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=$4 AND g.user_id=m.user_id AND g.status='ACTIVE'))
 ) ORDER BY m.id`,
      [
        a.driver_membership_id,
        a.school_id,
        a.counterpart_role,
        a.student_id,
        a.kind,
      ],
    )
  ).rows;
}
function recipientFingerprint(rows: any[]) {
  return createHash("sha256")
    .update(JSON.stringify(rows.map((m) => [m.id, m.user_id, m.coordinator])))
    .digest("hex");
}
function alertRouting(a: any, recipients: any[]) {
  const criticalSchool =
    a.level === 3 &&
    ((a.direction === "OUTBOUND" && a.movement_kind === "ALIGHTING") ||
      (a.direction === "RETURN" && a.movement_kind === "BOARDING") ||
      a.kind === "CORRECTION_CONFLICT");
  const criticalHome =
    a.level === 3 &&
    a.direction === "RETURN" &&
    a.movement_kind === "ALIGHTING" &&
    !criticalSchool;
  const criticalRecipients = recipients.filter((m) =>
    criticalSchool
      ? m.role === "SCHOOL" && m.coordinator
      : criticalHome
        ? m.role === "GUARDIAN"
        : false,
  );
  const routing =
    a.level !== 3
      ? "NOT_REQUIRED"
      : a.direction === "OUTBOUND" &&
          a.movement_kind === "BOARDING" &&
          a.kind !== "CORRECTION_CONFLICT"
        ? "UNDEFINED_BOARDING"
        : criticalRecipients.length
          ? "ASSIGNED"
          : "NO_CRITICAL_RECIPIENT";
  return { criticalSchool, criticalRecipients, routing };
}
export async function notifyAlert(
  db: Tx,
  a: any,
  eventId: string,
  now: Date,
  resolved = false,
  onlyNewRecipients = false,
) {
  const records = await confirmations(db, a.movement_id),
    sides = new Set(records.map((c) => c.side));
  const missing = [
    !sides.has("DRIVER") ? "Motorista" : null,
    !sides.has("COUNTERPART")
      ? a.counterpart_role === "SCHOOL"
        ? "Escola"
        : "Responsável"
      : null,
  ].filter(Boolean);
  const resolutionRecipients = resolved
    ? await createResolutionReceipts(db, a, eventId, now)
    : null;
  const recipients = resolutionRecipients ?? (await alertRecipients(db, a));
  const { criticalSchool, criticalRecipients, routing } = alertRouting(
    a,
    recipients,
  );
  await db.query(
    "UPDATE alert_cases SET routing_status=$2,recipient_fingerprint=$3 WHERE id=$1",
    [a.id, routing, recipientFingerprint(recipients)],
  );
  const nid = randomUUID();
  const details = {
    level: a.level,
    caseKind: a.kind,
    missingRoles: missing,
    routingStatus: routing,
    requiresAcknowledgement: resolved && !!resolutionRecipients,
  };
  await db.query(
    `INSERT INTO notification_events(id,movement_id,passenger_id,kind,state,actor_name,actor_role,occurred_at,alert_event_id,alert_id,details)
 VALUES($1,$2,$3,$4,'INFORMED','Processamento do sistema','SYSTEM',$5,$6,$7,$8) ON CONFLICT(alert_event_id) DO NOTHING`,
    [
      nid,
      a.movement_id,
      a.passenger_id,
      resolved ? "ALERT_RESOLVED" : "ALERT_LEVEL",
      now,
      eventId,
      a.id,
      JSON.stringify(details),
    ],
  );
  for (const m of recipients) {
    const side = m.role === "DRIVER" ? "DRIVER" : "COUNTERPART";
    const pending =
      a.kind === "CONFIRMATION_PENDING" &&
      !resolved &&
      (m.role === "DRIVER" || m.role === a.counterpart_role) &&
      !records.some((c) => c.side === side || c.actor_id === m.user_id);
    // No lembrete, somente quem falta confirmar recebe cobrança. Críticos também alcançam o destinatário de acompanhamento.
    const followup = criticalRecipients.some((c) => c.id === m.id);
    if (!resolved && a.level === 1 && !pending) continue;
    if (
      !resolved &&
      a.level === 3 &&
      m.role === "SCHOOL" &&
      !pending &&
      !followup
    )
      continue;
    if (
      onlyNewRecipients &&
      (
        await db.query(
          `SELECT 1 FROM notifications n JOIN notification_events e ON e.id=n.event_id
       WHERE e.alert_id=$1 AND e.kind='ALERT_LEVEL' AND (e.details->>'level')::int=$2
       AND n.membership_id=$3 AND n.purpose=$4 AND n.requires_coordination=$5 LIMIT 1`,
          [
            a.id,
            a.level,
            m.id,
            pending ? "ACTION" : "UPDATE",
            criticalSchool && followup && !pending,
          ],
        )
      ).rows.length
    )
      continue;
    await db.query(
      `INSERT INTO notifications(id,event_id,membership_id,user_id,purpose,created_at,requires_coordination)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,membership_id) DO NOTHING`,
      [
        randomUUID(),
        nid,
        m.id,
        m.user_id,
        pending ? "ACTION" : "UPDATE",
        now,
        resolved && resolutionRecipients
          ? m.role === "SCHOOL"
          : criticalSchool && followup && !pending,
      ],
    );
  }
}
export async function resolveByConfirmations(
  db: Tx,
  a: any,
  now: Date,
  record: any,
  resolutionKind = "NORMAL_CONFIRMATIONS",
) {
  await db.query(
    `UPDATE alert_cases SET status='RESOLVED',resolved_at=$2,resolved_by=$3,resolution_kind=$4,
 resolution_note=$5,version=version+1,next_due_at=NULL WHERE id=$1`,
    [
      a.id,
      now,
      record.actor_id,
      resolutionKind,
      resolutionKind === "VERIFIED_ABSENCE"
        ? "Ausência individual registrada com motivo, sem movimentações."
        : "As partes registraram as confirmações reais exigidas.",
    ],
  );
  const event = await alertEvent(
    db,
    a,
    "RESOLVED",
    now,
    { resolutionKind, ...(record.id ? { confirmationId: record.id } : {}) },
    {
      id: record.actor_id,
      name: record.actor_name,
      role: record.role,
      membershipId: record.membership_id,
    },
  );
  await notifyAlert(db, a, event, now, true);
}
// Chamado sob o lock da viagem, na mesma transação da confirmação ou pela reconciliação.
export async function syncPassengerAlerts(
  db: Tx,
  passengerId: string,
  now: Date,
  triggeringConfirmation?: {
    id: string;
    actor_id: string;
    actor_name: string;
    role: string;
    membership_id: string;
  },
) {
  if (await currentException(db, passengerId)) return;
  const rows = (
    await db.query(
      `SELECT v.id FROM movements v WHERE v.passenger_id=$1 ORDER BY v.id`,
      [passengerId],
    )
  ).rows;
  for (const { id: movementId } of rows) {
    const records = await confirmations(db, movementId);
    const base = (
      await db.query(
        `SELECT t.transport_id FROM trip_passengers p JOIN trips t ON t.id=p.trip_id WHERE p.id=$1`,
        [passengerId],
      )
    ).rows[0];
    const policy = (
      await db.query("SELECT * FROM alert_policies WHERE transport_id=$1", [
        base.transport_id,
      ])
    ).rows[0];
    if (records.length === 1 && policy) {
      const created = (
        await db.query(
          `INSERT INTO alert_cases(id,movement_id,kind,origin_at,policy_snapshot,next_due_at)
       VALUES($1,$2,'CONFIRMATION_PENDING',$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
          [
            randomUUID(),
            movementId,
            records[0].received_at,
            JSON.stringify(policy),
            nextDue(records[0].received_at, 0, policy),
          ],
        )
      ).rows[0];
      if (created) {
        const a = await caseRow(db, created.id);
        await alertEvent(db, a, "CREATED", now, {
          originAt: records[0].received_at,
          policyRevision: policy.revision,
        });
      }
    }
    const issues = (
      await db.query(
        "SELECT * FROM movement_issues WHERE movement_id=$1 AND status<>'RESOLVED'",
        [movementId],
      )
    ).rows;
    for (const issue of issues) {
      const created = (
        await db.query(
          `INSERT INTO alert_cases(id,movement_id,kind,source_issue_id,origin_at,policy_snapshot,level,next_due_at)
       VALUES($1,$2,'SEQUENCE_INCOMPLETE',$3,$4,$5,2,$6) ON CONFLICT DO NOTHING RETURNING id`,
          [
            randomUUID(),
            movementId,
            issue.id,
            issue.detected_at,
            policy ? JSON.stringify(policy) : null,
            nextDue(issue.detected_at, 2, policy),
          ],
        )
      ).rows[0];
      if (created) {
        const a = await caseRow(db, created.id);
        await alertEvent(db, a, "CREATED", now, { sourceIssueId: issue.id });
      }
    }
    const cases = (
      await db.query(
        "SELECT id FROM alert_cases WHERE movement_id=$1 AND status<>'RESOLVED' ORDER BY id FOR UPDATE",
        [movementId],
      )
    ).rows;
    for (const { id } of cases) {
      let a = await caseRow(db, id);
      if (!a.policy_snapshot && policy) {
        await db.query(
          "UPDATE alert_cases SET policy_snapshot=$2,next_due_at=$3 WHERE id=$1",
          [id, JSON.stringify(policy), nextDue(a.origin_at, a.level, policy)],
        );
        a = await caseRow(db, id);
      }
      if (a.kind === "CONFIRMATION_PENDING" && records.length === 2) {
        await resolveByConfirmations(
          db,
          a,
          now,
          records.find((c) => c.id === triggeringConfirmation?.id) ??
            records[1],
        );
        continue;
      }
      if (a.kind === "ROUTE_END_PENDING") {
        const all = (
          await db.query(
            `SELECT c.* FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id
          WHERE m.passenger_id=$1 AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED') ORDER BY c.received_at,c.id`,
            [passengerId],
          )
        ).rows;
        if (all.length === 4) {
          await resolveByConfirmations(
            db,
            a,
            now,
            all.find((c) => c.id === triggeringConfirmation?.id) ?? all[3],
            "NORMAL_ACCOUNTING",
          );
          continue;
        }
        if (a.disposition === "NOT_TRANSPORTED" && !all.length) {
          const author = (
            await db.query(
              `SELECT p.changed_by actor_id,u.name actor_name,'DRIVER' role,t.driver_membership_id membership_id
            FROM trip_passengers p JOIN trips t ON t.id=p.trip_id JOIN users u ON u.id=p.changed_by WHERE p.id=$1`,
              [passengerId],
            )
          ).rows[0];
          if (author) {
            await resolveByConfirmations(
              db,
              a,
              now,
              author,
              "VERIFIED_ABSENCE",
            );
            continue;
          }
        }
      }
      const level = computedLevel(a, now);
      if (level > a.level) {
        const previous = a.level;
        await db.query(
          "UPDATE alert_cases SET level=$2,next_due_at=$3,version=version+1 WHERE id=$1",
          [id, level, nextDue(a.origin_at, level, a.policy_snapshot)],
        );
        a = await caseRow(db, id);
        const event = await alertEvent(db, a, "LEVEL_REACHED", now, {
          previousLevel: previous,
          level,
        });
        await notifyAlert(db, a, event, now);
      } else if (a.level >= 1) {
        const recipients = await alertRecipients(db, a);
        // Uma decisão de encaminhamento pode mudar sem alteração das pessoas.
        // Não reinicia o prazo nem repete o mesmo aviso para destinatários já alcançados.
        if (
          a.recipient_fingerprint !== recipientFingerprint(recipients) ||
          a.routing_status !== alertRouting(a, recipients).routing
        ) {
          await db.query(
            "UPDATE alert_cases SET version=version+1 WHERE id=$1",
            [id],
          );
          const event = await alertEvent(db, a, "LEVEL_REACHED", now, {
            level: a.level,
            previousLevel: a.level,
            reason: "RECIPIENTS_UPDATED",
          });
          await notifyAlert(db, a, event, now, false, true);
        }
      }
    }
  }
}
