"use client";
import {
  contingencySteps,
  operationalDecisions,
  operationRelease,
  roleChecks,
} from "../../shared/operation-guide";
export default function OperationPanel({
  role,
  onNavigate,
}: {
  role: keyof typeof roleChecks;
  onNavigate: (view: string) => void;
}) {
  return (
    <div className="operation-root">
      <section
        className="panel operation-intro"
        aria-label="Situação da preparação"
      >
        <span className="tiny-pill">PARTE 10</span>
        <h2>{operationRelease.title}</h2>
        <p className="operation-status">{operationRelease.status}</p>
        <p>{operationRelease.explanation}</p>
      </section>
      <div className="operation-columns">
        <section className="panel">
          <h3>Antes e durante a viagem</h3>
          <ol>
            {roleChecks[role].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="operation-actions">
            {[
              ["planning", "Planejamento"],
              ["trips", "Viagens"],
              ["alerts", "Alertas"],
              ["history", "Histórico"],
            ].map(([view, label]) => (
              <button
                className="button secondary"
                key={view}
                onClick={() => onNavigate(view)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Sem internet ou sem notificação</h3>
          <ol>
            {contingencySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>
            Receber um aviso, ler ou assumir uma ocorrência não comprova
            entrega. A verificação presencial continua necessária.
          </p>
        </section>
      </div>
      <section className="panel">
        <h3>Decisões antes do uso real</h3>
        <p>
          Este registro distingue as escolhas já feitas das propostas técnicas.
          Não representa aprovação operacional.
        </p>
        <div className="operation-decisions">
          {operationalDecisions.map((d) => (
            <article key={d.id}>
              <small>
                {d.id} · {d.state}
              </small>
              <h4>{d.title}</h4>
              <p>{d.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
