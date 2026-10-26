"use client";
import {
  MovementKind,
  Passenger,
  Trip,
  movementRoleLabels,
  passengerMovementLabels,
  movementStatus,
  movementAction,
} from "../../shared/trips";
import {
  Check,
  CircleSlash2,
  Clock3,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import AlertReport from "./alert-report";
import { alertLevels, alertKinds } from "../../shared/alerts";
export default function MovementsPanel({
  trip,
  passenger: p,
  role,
  busy,
  onConfirm,
  focusKind,
  contextId,
}: {
  trip: Trip;
  passenger: Passenger;
  role: string;
  busy: boolean;
  onConfirm: (kind: MovementKind) => void;
  focusKind?: MovementKind;
  contextId?: string;
}) {
  const hasOpenOccurrence =
    p.issues.some((issue) => issue.status !== "RESOLVED") ||
    p.alerts?.some((alert) => alert.status !== "RESOLVED");
  const hasPendingCorrection = p.movements.some((movement) =>
    movement.confirmations.some(
      (record) => record.correctionStatus === "PENDING",
    ),
  );
  const underReview = p.deliveryUnderReview || hasPendingCorrection;
  return (
    <section
      className="movements-panel"
      aria-label={"Movimentações de " + p.student_name}
    >
      <div className="movement-passenger-status">
        {underReview || hasOpenOccurrence ? (
          <TriangleAlert size={15} />
        ) : (
          <ShieldCheck size={15} />
        )}
        <strong>
          {p.movementState === "DELIVERED" && (underReview || hasOpenOccurrence)
            ? "Duas confirmações de entrega registradas"
            : passengerMovementLabels[p.movementState]}
          {p.movementState === "BOARDING_VALIDATED" &&
            underReview &&
            " · sob verificação"}
        </strong>
        {p.possiblyOnboard && <span>Possivelmente a bordo</span>}
      </div>
      {p.issues.map((issue) => (
        <div key={issue.id} className="movement-issue" role="status">
          <strong>
            Ocorrência de sequência incompleta ·{" "}
            {issue.status === "RESOLVED" ? "Resolvida" : "Aberta"}
          </strong>
          <p>
            Desembarque registrado antes de um embarque validado. Os registros
            de ambas as etapas permanecem visíveis para revisão.
          </p>
          <small>
            {new Date(issue.detectedAt).toLocaleString("pt-BR", {
              timeZone: trip.timezone,
            })}
          </small>
        </div>
      ))}
      {p.deliveryUnderReview && (
        <p className="movement-alert-warning">
          Recebimento sob verificação. Há ocorrência ou correção em aberto; as
          confirmações originais foram preservadas.
        </p>
      )}
      {!p.deliveryUnderReview &&
        (hasOpenOccurrence || hasPendingCorrection) && (
          <p className="movement-alert-warning">
            Há ocorrência ou correção em aberto. As confirmações registradas não
            encerram o atendimento automaticamente.
          </p>
        )}
      {p.exceptionalResolution && (
        <p className="history-exception">
          Contabilizada excepcionalmente por {p.exceptionalResolution.actorName}
          . Não equivale à dupla confirmação normal. Consulte o Histórico para
          motivo e verificações.
        </p>
      )}
      {p.alerts?.map((a) => (
        <p className="alert-links" key={a.id}>
          {contextId ? (
            <a href={`?alert=${a.id}&context=${contextId}`}>
              {alertLevels[a.level]} · {alertKinds[a.kind]} → Abrir ocorrência
            </a>
          ) : (
            `${alertLevels[a.level]} · ${alertKinds[a.kind]}`
          )}
        </p>
      ))}
      {p.movements
        .filter((m) => !focusKind || m.kind === focusKind)
        .map((m) => {
          const correctionPending = m.confirmations.some(
            (record) => record.correctionStatus === "PENDING",
          );
          const movementUnderReview =
            correctionPending ||
            (m.kind === "ALIGHTING" && (underReview || hasOpenOccurrence));
          return (
            <article
              key={m.kind}
              className={
                "movement-card " +
                (movementUnderReview
                  ? "under-verification"
                  : m.state.toLowerCase())
              }
              data-movement-kind={m.kind}
            >
              <header>
                <div>
                  <span>
                    {m.kind === "BOARDING" ? "Embarque" : "Desembarque"} ·{" "}
                    {m.location}
                  </span>
                  <strong>
                    {m.state === "VALIDATED" && movementUnderReview
                      ? `Duas confirmações de ${m.kind === "BOARDING" ? "embarque" : "desembarque"} registradas`
                      : movementStatus(m)}
                  </strong>
                  {movementUnderReview && <span>Sob verificação</span>}
                </div>
                {movementUnderReview ? (
                  <TriangleAlert size={18} />
                ) : m.state === "VALIDATED" ? (
                  <Check size={18} />
                ) : (
                  <Clock3 size={17} />
                )}
              </header>
              <p className="movement-target">
                {p.student_name} ·{" "}
                {trip.service_date.split("-").reverse().join("/")} ·{" "}
                {trip.direction === "OUTBOUND" ? "Ida" : "Volta"}
              </p>
              <div className="movement-sides">
                {["DRIVER", "COUNTERPART"].map((side) => {
                  const record = m.confirmations.find((c) => c.side === side),
                    required = side === "DRIVER" ? "DRIVER" : m.counterpartRole;
                  const invalidated = record?.correctionStatus === "APPROVED";
                  const pending = record?.correctionStatus === "PENDING";
                  return (
                    <div
                      key={side}
                      className={
                        invalidated
                          ? "invalidated"
                          : pending
                            ? "under-verification"
                            : record
                              ? "confirmed"
                              : "waiting"
                      }
                    >
                      <span>
                        {invalidated ? (
                          <CircleSlash2 size={13} />
                        ) : pending ? (
                          <TriangleAlert size={13} />
                        ) : record ? (
                          <Check size={13} />
                        ) : (
                          <Clock3 size={13} />
                        )}{" "}
                        {movementRoleLabels[required]}
                      </span>
                      {record ? (
                        <p>
                          <strong>{record.actorName}</strong>
                          {(invalidated || pending) && (
                            <small>
                              {invalidated
                                ? "Registro invalidado pela correção; original preservado"
                                : "Confirmação sob verificação; correção pendente"}
                            </small>
                          )}
                          <small>
                            {record.organizationName} ·{" "}
                            {new Date(record.receivedAt).toLocaleString(
                              "pt-BR",
                              {
                                timeZone: trip.timezone,
                              },
                            )}
                          </small>
                        </p>
                      ) : (
                        <p>Falta confirmar</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {m.missingRoles.length > 0 && (
                <p className="movement-missing">
                  Falta:{" "}
                  {m.missingRoles.map((r) => movementRoleLabels[r]).join(" e ")}
                </p>
              )}
              {m.canConfirm ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => onConfirm(m.kind)}
                  aria-label={`${movementAction(role, m.kind)}: ${p.student_name}, ${trip.service_date}, ${trip.direction === "OUTBOUND" ? "ida" : "volta"}`}
                >
                  <ShieldCheck size={14} />
                  {movementAction(role, m.kind)}
                </button>
              ) : (
                m.state !== "VALIDATED" && (
                  <p className="movement-blocked">{m.blockedReason}</p>
                )
              )}
            </article>
          );
        })}
      {p.canReportRisk && contextId && (
        <AlertReport trip={trip} passenger={p} contextId={contextId} />
      )}
    </section>
  );
}
