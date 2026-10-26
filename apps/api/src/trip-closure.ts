import {
  Tx,
  alertEvent,
  caseRow,
  notifyAlert,
  syncPassengerAlerts,
} from "./alerts-domain";
import { randomUUID } from "node:crypto";
import { ActorRequest } from "./auth";

// Usa os registros individuais, inclusive quando nenhum evento foi informado.
export async function finalReview(db: Tx, tripId: string, ids?: string[]) {
  const rows = (
    await db.query(
      `SELECT p.id,p.student_name,p.disposition,
    (SELECT count(*)::int FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=p.id AND m.kind='BOARDING' AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED')) boarding,
    (SELECT count(*)::int FROM movement_confirmations c JOIN movements m ON m.id=c.movement_id WHERE m.passenger_id=p.id AND m.kind='ALIGHTING' AND NOT EXISTS(SELECT 1 FROM confirmation_corrections r WHERE r.confirmation_id=c.id AND r.status='APPROVED')) alighting,
    EXISTS(SELECT 1 FROM exceptional_resolutions e WHERE e.passenger_id=p.id AND e.safety_revision=p.safety_revision) exceptional,
    EXISTS(SELECT 1 FROM movement_issues i JOIN movements m ON m.id=i.movement_id WHERE m.passenger_id=p.id AND i.status<>'RESOLVED') issue,
    EXISTS(SELECT 1 FROM alert_cases a JOIN movements m ON m.id=a.movement_id WHERE m.passenger_id=p.id AND a.status<>'RESOLVED') alert
    FROM trip_passengers p WHERE p.trip_id=$1 AND p.active AND ($2::uuid[] IS NULL OR p.id=ANY($2::uuid[])) ORDER BY p.student_name,p.id`,
      [tripId, ids ?? null],
    )
  ).rows;
  const passengers = rows.map((p) => ({
    id: p.id,
    studentName: p.student_name,
    accounted:
      p.exceptional ||
      p.disposition === "NOT_TRANSPORTED" ||
      (p.boarding === 2 && p.alighting === 2),
    reasons: [
      ...(p.exceptional || p.disposition === "NOT_TRANSPORTED"
        ? []
        : [
            ...(p.boarding < 2
              ? [
                  p.boarding === 0 && p.alighting === 0
                    ? "Sem movimentação: registre a ausência verificada ou as confirmações reais."
                    : "Embarque sem dupla confirmação.",
                ]
              : []),
            ...(p.alighting < 2 ? ["Entrega sem dupla confirmação."] : []),
          ]),
      ...(p.issue || p.alert
        ? ["Ocorrência aberta: acompanhe pela central de alertas."]
        : []),
    ],
  }));
  return {
    total: rows.length,
    exceptional: rows.filter((p) => p.exceptional).length,
    delivered: rows.filter(
      (p) => !p.exceptional && p.boarding === 2 && p.alighting === 2,
    ).length,
    notTransported: rows.filter(
      (p) => !p.exceptional && p.disposition === "NOT_TRANSPORTED",
    ).length,
    pending: passengers.filter((p) => p.reasons.length),
    ready: rows.length > 0 && passengers.every((p) => !p.reasons.length),
  };
}

// O término do trajeto torna a falta de contabilização crítica imediatamente.
export async function criticalClosureAlerts(
  db: Tx,
  t: any,
  req: ActorRequest,
  now: Date,
) {
  const review = await finalReview(db, t.id);
  for (const p of review.pending) {
    await syncPassengerAlerts(db, p.id, now);
    if (!p.accounted) {
      await db.query(
        `INSERT INTO movements(id,passenger_id,kind,counterpart_role,created_at)
        VALUES($1,$2,'ALIGHTING',$3,$4) ON CONFLICT(passenger_id,kind) DO NOTHING`,
        [
          randomUUID(),
          p.id,
          t.direction === "OUTBOUND" ? "SCHOOL" : "GUARDIAN",
          now,
        ],
      );
      const movement = (
        await db.query(
          "SELECT id FROM movements WHERE passenger_id=$1 AND kind='ALIGHTING'",
          [p.id],
        )
      ).rows[0];
      const added = (
        await db.query(
          `INSERT INTO alert_cases(id,movement_id,kind,level,origin_at,reported_by,report_note)
        VALUES($1,$2,'ROUTE_END_PENDING',3,$3,$4,'Contabilização pendente no encerramento do trajeto.') ON CONFLICT DO NOTHING RETURNING id`,
          [randomUUID(), movement.id, now, req.actor.id],
        )
      ).rows[0];
      if (added) {
        const a = await caseRow(db, added.id);
        const event = await alertEvent(
          db,
          a,
          "CREATED",
          now,
          { reason: "TRIP_CLOSURE_PENDING", level: 3 },
          {
            id: req.actor.id,
            name: req.actor.name,
            role: req.context!.role,
            membershipId: req.context!.id,
          },
        );
        await notifyAlert(db, a, event, now);
      }
    }
    const cases = (
      await db.query(
        `SELECT a.id FROM alert_cases a JOIN movements m ON m.id=a.movement_id
      WHERE m.passenger_id=$1 AND a.status<>'RESOLVED' AND a.level<3 ORDER BY a.id FOR UPDATE OF a`,
        [p.id],
      )
    ).rows;
    for (const { id } of cases) {
      const old = await caseRow(db, id);
      await db.query(
        "UPDATE alert_cases SET level=3,next_due_at=NULL,version=version+1 WHERE id=$1",
        [id],
      );
      const a = await caseRow(db, id);
      const event = await alertEvent(db, a, "LEVEL_REACHED", now, {
        previousLevel: old.level,
        level: 3,
        reason: "TRIP_CLOSURE_PENDING",
      });
      await notifyAlert(db, a, event, now);
    }
  }
}
