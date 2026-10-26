"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Trip, TripCloseInput, tripLabels } from "../../shared/trips";

export default function TripClosure({
  trip,
  busy,
  onClose,
}: {
  trip: Trip;
  busy: boolean;
  onClose: (body: TripCloseInput) => Promise<void>;
}) {
  const [walked, setWalked] = useState(false),
    [seats, setSeats] = useState(false),
    [hiding, setHiding] = useState(false);
  const [empty, setEmpty] = useState<boolean | null>(null),
    [note, setNote] = useState(""),
    [key, setKey] = useState("");
  useEffect(() => {
    setWalked(false);
    setSeats(false);
    setHiding(false);
    setEmpty(null);
    setNote("");
    setKey(crypto.randomUUID());
  }, [trip.id, trip.version]);
  if (trip.status === "PLANNED" || trip.status === "CANCELLED") return null;
  const c = trip.closure;
  const time = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: trip.timezone,
    }).format(new Date(value));
  return (
    <section
      className="trip-closure"
      aria-label="Conferência final e encerramento"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow green">CONFERÊNCIA FINAL</span>
          <h3>Uma última checagem, criança por criança.</h3>
        </div>
        <ClipboardCheck size={24} />
      </div>
      <p className="registry-note">
        {c.delivered} com embarque e entrega validados · {c.notTransported} não
        transportadas · {c.exceptional} contabilizadas excepcionalmente ·{" "}
        {c.pending.length} com pendências neste contexto.
      </p>
      {trip.status === "COMPLETED" ? (
        <p className="message success" role="status">
          Viagem concluída{" "}
          {c.exceptional > 0 ? "com contabilização excepcional " : ""}em{" "}
          {time(trip.completed_at!)}. Contabilização e conferência final
          registradas.
        </p>
      ) : (
        <>
          {trip.status === "ROUTE_ENDED_OPEN" && (
            <p className="message error" role="status">
              O trajeto terminou em {time(trip.route_ended_at!)} com ocorrência
              aberta. Os alertas e as confirmações continuam ativos. Motorista e
              veículo permanecem reservados até a conclusão.
            </p>
          )}
          {trip.status === "COMPLETED_REVIEW" && (
            <p className="message error" role="status">
              Conclusão sob revisão por correção ou relato de risco. O
              encerramento anterior está preservado. Após o tratamento, faça uma
              nova conferência para concluir. Esta revisão histórica não reserva
              novamente os recursos de viagens atuais.
            </p>
          )}
          {c.pending.length ? (
            <ul className="closure-pending">
              {c.pending.map((p) => (
                <li key={p.id}>
                  <strong>{p.studentName}</strong>
                  <span>{p.reasons.join(" ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="registry-note">
              As crianças visíveis neste contexto estão contabilizadas e sem
              ocorrência aberta.
            </p>
          )}
          {c.canInspect ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (walked && seats && hiding && empty !== null)
                  void onClose({
                    id: key,
                    expectedVersion: trip.version,
                    walkedInterior: true,
                    checkedSeats: true,
                    checkedHidingPlaces: true,
                    vanEmpty: empty,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  });
              }}
            >
              <p className="registry-note">
                Faça a verificação física agora. “Van vazia” não substitui
                confirmações nem resolve ocorrências individuais.
              </p>
              <fieldset disabled={busy}>
                <legend>Conferência física da van</legend>
                {[
                  [walked, setWalked, "Percorri todo o interior da van."],
                  [
                    seats,
                    setSeats,
                    "Verifiquei todos os bancos e os espaços entre eles.",
                  ],
                  [
                    hiding,
                    setHiding,
                    "Verifiquei os locais onde uma criança poderia estar oculta.",
                  ],
                ].map(([checked, setter, label]) => (
                  <label className="closure-check" key={label as string}>
                    <input
                      type="checkbox"
                      checked={checked as boolean}
                      onChange={(e) =>
                        (setter as (v: boolean) => void)(e.target.checked)
                      }
                    />
                    {label as string}
                  </label>
                ))}
                <label>
                  Resultado da inspeção
                  <select
                    aria-label="Resultado da inspeção"
                    value={empty === null ? "" : empty ? "empty" : "found"}
                    onChange={(e) =>
                      setEmpty(
                        e.target.value ? e.target.value === "empty" : null,
                      )
                    }
                  >
                    <option value="">Selecione após conferir</option>
                    <option value="empty">
                      Van vazia, sem criança a bordo
                    </option>
                    <option value="found">
                      Há criança a bordo ou a segurança não está assegurada
                    </option>
                  </select>
                </label>
                <label>
                  Observação da conferência{" "}
                  {empty === false ? "(obrigatória)" : "(opcional)"}
                  <textarea
                    aria-label="Observação da conferência"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Descreva o que foi verificado ou encontrado."
                  />
                </label>
              </fieldset>
              <p className="registry-note">
                {c.ready && empty === true
                  ? "Com a conferência registrada, a viagem poderá ser concluída."
                  : "Se houver pendência ou a van não estiver vazia, será registrado trajeto encerrado com ocorrência aberta."}
              </p>
              <button
                className="button"
                disabled={
                  busy ||
                  !key ||
                  !walked ||
                  !seats ||
                  !hiding ||
                  empty === null ||
                  (empty === false && note.trim().length < 10)
                }
              >
                Registrar conferência e encerrar trajeto
              </button>
            </form>
          ) : (
            <p className="registry-note">
              A conferência final é registrada pelo motorista designado. Os
              totais e as pendências respeitam seu contexto de acesso.
            </p>
          )}
        </>
      )}
      {!!c.inspections.length && (
        <details className="closure-history">
          <summary>Conferências registradas ({c.inspections.length})</summary>
          {c.inspections.map((i) => (
            <article key={i.id}>
              <strong>{tripLabels[i.result]}</strong>
              <p>
                {i.actor_name} · {time(i.inspected_at)}
              </p>
              <p>
                {i.van_empty
                  ? "Van declarada vazia após a inspeção física."
                  : "Van com criança a bordo ou segurança não assegurada."}
              </p>
              {i.note && <p>{i.note}</p>}
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
