import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
type Tx = Pick<PoolClient, "query">;

// Usado no mesmo COMMIT das confirmações; Redis nunca participa dessa transação.
export async function recordNotificationEvent(
  db: Tx,
  input: {
    confirmationId: string | null;
    exceptionalResolutionId?: string;
    movementId: string;
    passengerId: string;
    kind:
      "MOVEMENT_CONFIRMED" | "SEQUENCE_INCOMPLETE" | "EXCEPTIONAL_ACCOUNTING";
    state: "INFORMED" | "VALIDATED";
    actorName: string;
    actorRole: string;
    occurredAt: Date;
  },
) {
  const id = randomUUID();
  const event = await db.query(
    `INSERT INTO notification_events
    (id,confirmation_id,movement_id,passenger_id,kind,state,actor_name,actor_role,occurred_at,resolution_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT DO NOTHING RETURNING id`,
    [
      id,
      input.confirmationId,
      input.movementId,
      input.passengerId,
      input.kind,
      input.state,
      input.actorName,
      input.actorRole,
      input.occurredAt,
      input.exceptionalResolutionId || null,
    ],
  );
  if (!event.rows.length) return;
  const recipients = (
    await db.query(
      `SELECT DISTINCT m.id,m.user_id,m.role
    FROM trip_passengers p JOIN trips t ON t.id=p.trip_id
    JOIN movements v ON v.id=$2 JOIN memberships m ON m.active
    WHERE p.id=$1 AND (
      m.id=t.driver_membership_id OR
      (m.role='SCHOOL' AND m.organization_id=p.school_id AND v.counterpart_role='SCHOOL') OR
      (m.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=m.user_id AND g.status='ACTIVE'))
    )`,
      [input.passengerId, input.movementId],
    )
  ).rows;
  for (const recipient of recipients) {
    const side = recipient.role === "DRIVER" ? "DRIVER" : "COUNTERPART";
    const pending =
      input.kind === "MOVEMENT_CONFIRMED" &&
      input.state === "INFORMED" &&
      (
        await db.query(
          `SELECT 1 FROM movements v WHERE v.id=$1 AND ($2='DRIVER' OR v.counterpart_role=$2)
        AND NOT EXISTS(SELECT 1 FROM movement_confirmations c WHERE c.movement_id=v.id AND (c.side=$3 OR c.actor_id=$4))`,
          [input.movementId, recipient.role, side, recipient.user_id],
        )
      ).rows.length > 0;
    await db.query(
      `INSERT INTO notifications(id,event_id,membership_id,user_id,purpose,created_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,membership_id) DO NOTHING`,
      [
        randomUUID(),
        id,
        recipient.id,
        recipient.user_id,
        pending ? "ACTION" : "UPDATE",
        input.occurredAt,
      ],
    );
  }
}

// Autorizações são reavaliadas na leitura e imediatamente antes de cada envio.
export const notificationAccess = `m.active AND m.user_id=n.user_id AND p.active AND l.status='ACTIVE' AND (NOT n.requires_coordination OR m.coordinator) AND (
  (m.role='DRIVER' AND m.id=t.driver_membership_id AND m.user_id=t.driver_user_id) OR
  (m.role='SCHOOL' AND m.organization_id=p.school_id) OR
  (m.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.student_id=p.student_id AND g.user_id=n.user_id AND g.status='ACTIVE'))
)`;
export const notificationJoin = `FROM notifications n JOIN notification_events e ON e.id=n.event_id
 JOIN memberships m ON m.id=n.membership_id JOIN trip_passengers p ON p.id=e.passenger_id
 JOIN operating_links l ON l.id=p.operating_link_id JOIN trips t ON t.id=p.trip_id
 JOIN movements v ON v.id=e.movement_id LEFT JOIN alert_cases a ON a.id=e.alert_id`;

export const notificationSelect = `SELECT n.*,e.kind event_kind,e.state event_state,e.actor_name,e.actor_role,e.occurred_at,e.details event_details,e.alert_id,
    p.id passenger_id,p.student_id,p.student_name,t.id trip_id,t.service_date::text service_date,t.direction,t.timezone,
    v.kind movement_kind,v.id movement_id,v.counterpart_role,m.role,
    (${notificationAccess}) authorized,
    (e.alert_id IS NULL OR e.kind='ALERT_RESOLVED' OR (a.status<>'RESOLVED' AND a.level=(e.details->>'level')::int)) deliverable,
    (n.purpose='ACTION' AND t.status IN ('IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED_REVIEW') AND p.disposition='EXPECTED'
      AND NOT EXISTS(SELECT 1 FROM exceptional_resolutions x WHERE x.passenger_id=p.id AND x.safety_revision=p.safety_revision)
      AND (e.alert_id IS NULL OR a.status<>'RESOLVED')
      AND (m.role='DRIVER' OR m.role=v.counterpart_role)
      AND NOT EXISTS(SELECT 1 FROM movement_confirmations c WHERE c.movement_id=v.id AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED') AND
        (c.side=CASE WHEN m.role='DRIVER' THEN 'DRIVER' ELSE 'COUNTERPART' END OR c.actor_id=n.user_id))) pending
    ${notificationJoin}`;
export async function currentNotification(db: Tx, id: string) {
  const row = (await db.query(`${notificationSelect} WHERE n.id=$1`, [id]))
    .rows[0];
  return row;
}

export function notificationText(n: any) {
  if (n.event_kind === "EXCEPTIONAL_ACCOUNTING")
    return {
      title: "Contabilização excepcional",
      body: `${n.actor_name} registrou uma contabilização excepcional de ${n.student_name}, com motivo e verificações. Esse registro não equivale à dupla confirmação normal. Consulte o Histórico.`,
    };
  if (n.event_kind === "ALERT_LEVEL" || n.event_kind === "ALERT_RESOLVED") {
    const d = n.event_details || {},
      level =
        ["Pendência", "Lembrete", "Atenção", "Crítico"][d.level] || "Alerta";
    const kinds: Record<string, string> = {
      CONFIRMATION_PENDING: "Confirmação pendente",
      SEQUENCE_INCOMPLETE: "Sequência incompleta",
      NOT_LOCATED: "Criança não localizada",
      RECEIPT_DISPUTED: "Recebimento contestado",
      ROUTE_END_PENDING: "Contabilização pendente no encerramento",
      CORRECTION_CONFLICT: "Confirmação em correção",
    };
    const closed = n.event_kind === "ALERT_RESOLVED";
    return {
      title: closed
        ? d.requiresAcknowledgement
          ? "Urgência resolvida · ciência"
          : "Atendimento encerrado"
        : level + " · " + (kinds[d.caseKind] || "Ocorrência"),
      body: closed
        ? `O atendimento de ${n.student_name} foi encerrado com registro auditável. Consulte os fatos e as confirmações no detalhe.${d.requiresAcknowledgement ? " As partes envolvidas devem confirmar ciência da resolução. Ler a mensagem não registra ciência." : ""}`
        : `${n.student_name}: ${kinds[d.caseKind] || "ocorrência"}. ${d.missingRoles?.length ? "Falta confirmação de " + d.missingRoles.join(" e ").toLowerCase() + ". " : "As confirmações não encerram sozinhas esta ocorrência. "}Ler ou assumir não comprova a entrega.`,
    };
  }
  const event = n.movement_kind === "BOARDING" ? "Embarque" : "Desembarque";
  const title =
    n.event_kind === "SEQUENCE_INCOMPLETE"
      ? "Sequência incompleta"
      : n.event_state === "VALIDATED"
        ? n.movement_kind === "BOARDING"
          ? "Embarque validado"
          : "Entrega validada"
        : `${event} informado`;
  const role: Record<string, string> = {
    DRIVER: "Motorista",
    SCHOOL: "Escola",
    GUARDIAN: "Responsável",
  };
  const body =
    n.event_kind === "SEQUENCE_INCOMPLETE"
      ? `Há registro de desembarque de ${n.student_name} sem embarque validado. A ocorrência requer acompanhamento.`
      : n.event_state === "VALIDATED"
        ? `Ambas as partes confirmaram o ${event.toLowerCase()} de ${n.student_name}.`
        : `${role[n.actor_role]} (${n.actor_name}) informou o ${event.toLowerCase()} de ${n.student_name}. A outra parte ainda não havia confirmado nesse momento.`;
  return { title, body };
}
