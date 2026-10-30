"use client";
import {
  type DriverPreparation,
  preparationItemLabel,
} from "../../shared/driver-day";
export default function DriverPreparationSummary({
  value,
  direction,
  onDirection,
  onPage,
}: {
  value?: DriverPreparation;
  direction: "OUTBOUND" | "RETURN";
  onDirection: (d: "OUTBOUND" | "RETURN") => void;
  onPage: (page: number) => void;
}) {
  return (
    <section className="panel dd-preparation-summary">
      <header>
        <h2>Seu próximo trajeto</h2>
        <p>
          Escolha o trecho e confira o resumo.
        </p>
      </header>
      <div
        className="registry-tabs"
        role="tablist"
        aria-label="Trecho a preparar"
      >
        {(["OUTBOUND", "RETURN"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={direction === d}
            onClick={() => onDirection(d)}
          >
            {d === "OUTBOUND" ? "Ida · casa → escola" : "Volta · escola → casa"}
          </button>
        ))}
      </div>
      {value ? (
        <>
          <div className="dd-preparation-counts">
            <span>
              <strong>{value.going}</strong> Vão
            </span>
            <span>
              <strong>{value.notGoing}</strong> Não vão
            </span>
            <span>
              <strong>{value.pending}</strong> A conferir
            </span>
          </div>
          {value.awaitingChanges > 0 && (
            <p className="dd-warning">
              {value.awaitingChanges} solicitações em análise. A situação
              vigente permanece até decisão.
            </p>
          )}
          {!value.total && (
            <p>Nenhuma criança com vínculo ativo para este transporte.</p>
          )}
          <details className="dd-passenger-details">
            <summary>Ver crianças e detalhes</summary>
          {[
            { bucket: "GOING", label: "Quem vai", count: value.going },
            {
              bucket: "NOT_GOING",
              label: "Quem não vai",
              count: value.notGoing,
            },
            {
              bucket: "PENDING",
              label: "Ainda não confirmado ou sem previsão",
              count: value.pending,
            },
          ].map((group) => {
            const items = value.items.filter((p) =>
              group.bucket === "PENDING"
                ? !["GOING", "NOT_GOING"].includes(p.bucket)
                : p.bucket === group.bucket,
            );
            return (
              <details
                key={group.bucket}
                className="dd-preparation-group"
              >
                <summary>
                  {group.label} <span>{group.count}</span>
                </summary>
                {items.map((p) => (
                  <article key={p.linkId}>
                    <div>
                      <strong>{p.studentName}</strong>
                      <small>
                        {p.schoolName} · Identificação {p.studentId.slice(-8)}
                      </small>
                      <p>{preparationItemLabel(p)}</p>
                      {p.requestId && (
                        <p className="dd-warning">
                          Pedido em análise:{" "}
                          {p.requestedUsage ? "utilizará" : "não utilizará"} ·
                          ainda não aplicado.
                        </p>
                      )}
                    </div>
                  </article>
                ))}
                {!items.length && (
                  <p>
                    {group.count
                      ? "Sem nomes deste grupo nesta página."
                      : "Nenhuma criança neste grupo."}
                  </p>
                )}
              </details>
            );
          })}
          {value.total > 0 && (
            <div className="dd-actions">
              <small>
                Exibindo {value.items.length} de {value.total} crianças (até 20
                por grupo) · página {value.page + 1}
              </small>
              {value.page > 0 && (
                <button
                  className="text-button"
                  onClick={() => onPage(value.page - 1)}
                >
                  Página anterior do resumo
                </button>
              )}
              {value.hasMore && (
                <button
                  className="text-button"
                  onClick={() => onPage(value.page + 1)}
                >
                  Próxima página do resumo
                </button>
              )}
            </div>
          )}
          </details>
        </>
      ) : (
        <p role="status">Carregando o resumo…</p>
      )}
    </section>
  );
}
