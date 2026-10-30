"use client";
import {
  dayChoices,
  agendaChangeLabels,
  type AgendaPlan,
} from "../../shared/day-choice";
import { useDayChoice } from "../../shared/use-day-choice";
import { planningLabel } from "../../shared/planning-presentation";
export default function GuardianDayCard({
  plans,
  submit,
  refresh,
  withdraw,
}: {
  plans: AgendaPlan[];
  submit: (body: unknown) => Promise<{ awaitingAcceptance?: boolean }>;
  refresh: () => Promise<void>;
  withdraw: (p: AgendaPlan) => void;
}) {
  const state = useDayChoice(plans, submit, refresh),
    p = plans[0];
  return (
    <article
      className="guardian-day-card panel"
      aria-label={`Uso de ${p.student_name}`}
    >
      <header>
        <span className="eyebrow green">USO DO TRANSPORTE</span>
        <h3>{p.student_name}</h3>
        <p>
          {p.school_name} · {p.transport_name}
        </p>
        <small>Identificação {p.student_id.slice(-8)}</small>
      </header>
      <div className="guardian-current">
        {plans.map((plan) => (
          <p key={plan.id}>
            <strong>{plan.direction === "OUTBOUND" ? "Ida" : "Volta"}:</strong>{" "}
            {planningLabel(plan)}
            {plan.request_id && (
              <span>
                {" "}
                · Pedido em análise:{" "}
                {plan.requested_usage ? "utilizará" : "não utilizará"}
              </span>
            )}
          </p>
        ))}
      </div>
      <fieldset disabled={state.busy} className="guardian-day-options">
        <legend>Como utilizará nesta data?</legend>
        {dayChoices.map((c) => (
          <button
            type="button"
            key={c.id}
            aria-pressed={state.selection === c.id}
            disabled={state.disabledChoice(c)}
            onClick={() => state.setSelection(c.id)}
          >
            {c.label}
          </button>
        ))}
      </fieldset>
      <p className="registry-note">
        A escolha só é registrada ao tocar no botão abaixo. Ida e volta
        continuam independentes.
      </p>
      {state.late && (
        <label>
          Motivo da alteração
          <textarea
            maxLength={1000}
            minLength={10}
            value={state.reason}
            disabled={state.busy}
            onChange={(e) => state.setReason(e.target.value)}
            placeholder="Explique a necessidade ao transporte (mínimo 10 caracteres)"
          />
        </label>
      )}
      {state.blocked && <p className="planning-request">{state.blocked}</p>}
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="message success" role="status">
          {state.notice}
        </p>
      )}
      <div className="guardian-day-primary">
        <button
          className="button"
          disabled={state.busy || !state.canSave}
          onClick={() => void state.save()}
        >
          {state.busy
            ? "Salvando…"
            : state.needsVerification
              ? "Verificar envio"
              : state.alreadyRecorded
                ? "Escolha confirmada"
                : state.late
                  ? "Enviar solicitação ao transporte"
                  : state.selection === "none"
                    ? "Confirmar que não utilizará"
                    : "Confirmar uso do transporte"}
        </button>
      </div>
      <details>
        <summary>Detalhes e solicitações por trecho</summary>
        {plans.map((plan) => (
          <div key={plan.id}>
            <p>
              <strong>{plan.direction === "OUTBOUND" ? "Ida" : "Volta"}</strong>{" "}
              · {planningLabel(plan)}
            </p>
            {plan.request_id && <p>{plan.request_reason}</p>}
            {plan.can_withdraw && plan.request_id && (
              <button
                className="planning-secondary"
                disabled={state.busy}
                onClick={() => withdraw(plan)}
              >
                Retirar pedido de{" "}
                {plan.direction === "OUTBOUND" ? "ida" : "volta"}
              </button>
            )}
            {plan.last_change && (
              <p>
                Última solicitação:{" "}
                {agendaChangeLabels[plan.last_change.status] ||
                  "Consulte o transporte"}{" "}
                {plan.last_change.decisionNote}
              </p>
            )}
          </div>
        ))}
      </details>
    </article>
  );
}
