"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldAlert,
  RefreshCw,
  Clock3,
  Check,
  Settings2,
} from "lucide-react";
import {
  AlertDetail,
  AlertItem,
  AlertOptions,
  alertLevels,
  alertKinds,
  alertStatuses,
  alertRoutes,
  alertEventLabels,
} from "../../shared/alerts";
import { movementRoleLabels, MovementKind } from "../../shared/trips";
import MovementsPanel from "./movements-panel";
import type { JourneyTarget } from "../../shared/navigation";
type Context = {
  id: string;
  role: "SCHOOL" | "DRIVER" | "GUARDIAN";
  coordinator?: boolean;
};
export default function AlertsPanel({
  context,
  initialId = "",
  onOpenTarget,
  onSelect,
  active = true,
}: {
  context: Context;
  initialId?: string;
  onOpenTarget?: (target: JourneyTarget) => void;
  onSelect?: (id: string) => void;
  active?: boolean;
}) {
  const [items, setItems] = useState<AlertItem[]>([]),
    [options, setOptions] = useState<AlertOptions | null>(null),
    [selected, setSelected] = useState(initialId),
    [detail, setDetail] = useState<AlertDetail | null>(null),
    [closed, setClosed] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [note, setNote] = useState(""),
    [action, setAction] = useState("CONTACT");
  const [minutes, setMinutes] = useState([5, 10, 15]);
  function select(id: string) {
    setSelected(id);
    onSelect?.(id);
  }
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Context-Id": context.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.message || "Não foi possível atualizar os alertas.");
    return data;
  }
  async function refresh() {
    if (selected) setDetail(await api<AlertDetail>("alerts/" + selected));
    else {
      const [list, opts] = await Promise.all([
        api<{ items: AlertItem[] }>("alerts?closed=" + closed),
        api<AlertOptions>("alerts/options"),
      ]);
      setItems(list.items);
      setOptions(opts);
    }
  }
  useEffect(() => {
    setDetail(null);
    setItems([]);
    setNote("");
  }, [selected, closed, context.id]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setError("");
    setLoading(true);
    const load = async () => {
      try {
        if (selected) {
          const data = await api<AlertDetail>("alerts/" + selected);
          if (alive) setDetail(data);
        } else {
          const [list, opts] = await Promise.all([
            api<{ items: AlertItem[] }>("alerts?closed=" + closed),
            api<AlertOptions>("alerts/options"),
          ]);
          if (alive) {
            setItems(list.items);
            setOptions(opts);
          }
        }
        if (alive) setError("");
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setDetail(null);
          setItems([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected, closed, context.id, active]);
  useEffect(() => {
    if (options?.policy)
      setMinutes([
        options.policy.reminder_minutes,
        options.policy.attention_minutes,
        options.policy.critical_minutes,
      ]);
  }, [options?.policy?.revision]);
  async function run(fn: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const a = detail?.alert,
    time = (at: string) =>
      new Date(at).toLocaleString("pt-BR", {
        timeZone: a?.timezone || "America/Sao_Paulo",
      });
  function record(type: string, text = note) {
    if (!a) return;
    void run(
      async () => {
        await api(`alerts/${a.id}/actions`, {
          type,
          note: text,
          expectedVersion: a.version,
        });
        setNote("");
      },
      type === "RESOLVED"
        ? "Atendimento encerrado com histórico preservado."
        : "Acompanhamento registrado. A gravidade continua independente.",
    );
  }
  return (
    <section className="alerts-panel" aria-label="Central de alertas">
      <div className="alerts-heading">
        <div>
          <span className="eyebrow">ACOMPANHAMENTO DE CADA CRIANÇA</span>
          <h2>
            {selected
              ? "Detalhe da ocorrência"
              : context.role === "SCHOOL" && context.coordinator
                ? "Central da coordenação"
                : "Alertas e ocorrências"}
          </h2>
          <p>
            Ler ou assumir não comprova entrega. Os prazos seguem mesmo com o
            aplicativo fechado.
          </p>
        </div>
        <button
          className="alert-button"
          disabled={busy}
          onClick={() => void run(async () => {}, "Alertas atualizados.")}
        >
          <RefreshCw size={15} />
          Atualizar alertas
        </button>
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      {loading && (
        <p role="status" className="muted">
          Carregando ocorrências…
        </p>
      )}
      {selected ? (
        <button className="text-button" onClick={() => select("")}>
          <ArrowLeft size={15} /> Voltar aos alertas
        </button>
      ) : (
        <>
          <div className="alert-filters">
            <button
              className={!closed ? "active" : ""}
              onClick={() => setClosed(false)}
            >
              Em acompanhamento
            </button>
            <button
              className={closed ? "active" : ""}
              onClick={() => setClosed(true)}
            >
              Resolvidas
            </button>
          </div>
          {options?.canConfigure && (
            <details className="alert-settings">
              <summary>
                <Settings2 size={16} />
                Intervalos da operação{" "}
                {options.policy
                  ? `· revisão ${options.policy.revision}`
                  : "· configuração necessária"}
              </summary>
              <p>
                Proposta para teste: 5 / 10 / 15 minutos desde a primeira
                confirmação. Alterações preservam os prazos de casos já abertos.
                Ao configurar pela primeira vez, pendências anteriores são
                avaliadas pelo horário original.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    setOptions(
                      await api<AlertOptions>("alerts/policy", {
                        expectedRevision: options.policy?.revision || 0,
                        reminderMinutes: minutes[0],
                        attentionMinutes: minutes[1],
                        criticalMinutes: minutes[2],
                      }),
                    );
                  }, "Intervalos registrados. Casos abertos mantêm a configuração capturada.");
                }}
              >
                {[
                  ["Lembrete", 0],
                  ["Atenção", 1],
                  ["Crítico", 2],
                ].map(([label, i]) => (
                  <label key={label}>
                    {label} (min)
                    <input
                      type="number"
                      min={1}
                      max={4320}
                      required
                      value={minutes[Number(i)]}
                      onChange={(e) =>
                        setMinutes((old) =>
                          old.map((v, j) =>
                            j === i ? Number(e.target.value) : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button className="alert-button" disabled={busy}>
                  Salvar intervalos
                </button>
              </form>
            </details>
          )}
          <div className="alert-list">
            {items.map((item) => (
              <button
                className={"alert-list-item level-" + item.level}
                key={item.id}
                onClick={() => select(item.id)}
              >
                <span className="alert-level">
                  <ShieldAlert size={16} />
                  {alertLevels[item.level]}
                </span>
                <span className="alert-item-copy">
                  <strong>{item.student_name}</strong>
                  <span>
                    {alertKinds[item.kind]} ·{" "}
                    {item.movement_kind === "BOARDING"
                      ? "Embarque"
                      : "Desembarque"}{" "}
                    · {item.direction === "OUTBOUND" ? "Ida" : "Volta"}
                  </span>
                  <small>
                    Desde{" "}
                    {new Date(item.origin_at).toLocaleString("pt-BR", {
                      timeZone: item.timezone,
                    })}{" "}
                    · {alertStatuses[item.status]}
                    {item.assignedName ? ` · ${item.assignedName}` : ""}
                  </small>
                </span>
                <span>→</span>
              </button>
            ))}
            {!loading && !items.length && (
              <div className="alerts-empty">
                <ShieldAlert size={30} />
                <h3>
                  {closed
                    ? "Nenhum atendimento encerrado neste contexto."
                    : "Nenhuma ocorrência em acompanhamento."}
                </h3>
                <p>
                  Uma previsão sem resposta ou ausência de todos os registros
                  não cria alerta de parada automaticamente.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {a && detail && (
        <>
          <article className={"alert-detail-card level-" + a.level}>
            <div className="alert-detail-top">
              <span className="alert-level">
                <ShieldAlert size={17} />
                {alertLevels[a.level]}
              </span>
              <span>{alertStatuses[a.status]}</span>
            </div>
            <h3>{a.student_name}</h3>
            <p>
              {alertKinds[a.kind]} ·{" "}
              {a.movement_kind === "BOARDING" ? "Embarque" : "Desembarque"} ·{" "}
              {a.service_date.split("-").reverse().join("/")} ·{" "}
              {a.direction === "OUTBOUND" ? "Ida" : "Volta"}
            </p>
            {a.report_note && <blockquote>{a.report_note}</blockquote>}
            {onOpenTarget && (
              <button
                className="text-button"
                onClick={() =>
                  onOpenTarget({
                    view: "history",
                    contextId: context.id,
                    date: a.service_date,
                    studentId: detail.journey.passenger.student_id,
                    passengerId: a.passenger_id,
                    tripId: a.trip_id,
                    alertId: a.id,
                  })
                }
              >
                {a.kind === "CORRECTION_CONFLICT" && context.coordinator
                  ? "Revisar correção desta criança"
                  : "Histórico e correções desta criança"}
              </button>
            )}
            <div className="alert-facts">
              <span>
                <Clock3 size={14} />
                Origem: {time(a.origin_at)}
              </span>
              <span>
                Próximo nível:{" "}
                {a.next_due_at ? time(a.next_due_at) : "Sem novo prazo"}
              </span>
              <span>Atendimento: {a.assignedName || "Ainda não assumido"}</span>
            </div>
            <p>
              {a.missingRoles.length
                ? "Ainda falta confirmar: " +
                  a.missingRoles.map((r) => movementRoleLabels[r]).join(" e ") +
                  "."
                : "As duas partes registraram esta movimentação."}
            </p>
            <p
              className={
                a.routing_status.includes("UNDEFINED") ||
                a.routing_status.includes("NO_CRITICAL")
                  ? "alert-routing-warning"
                  : "small-note"
              }
            >
              {alertRoutes[a.routing_status]}
            </p>
            {a.policy_snapshot && (
              <small>
                Intervalos capturados: {a.policy_snapshot.reminder_minutes} /{" "}
                {a.policy_snapshot.attention_minutes} /{" "}
                {a.policy_snapshot.critical_minutes} min · revisão{" "}
                {a.policy_snapshot.revision}
              </small>
            )}
            {a.actions.canAssume && (
              <button
                className="alert-button"
                disabled={busy}
                onClick={() =>
                  record(
                    "ASSUMED",
                    "Assumo o acompanhamento desta ocorrência e verificarei a situação com as partes envolvidas.",
                  )
                }
              >
                Assumir acompanhamento
              </button>
            )}
            {a.status === "RESOLVED" && (
              <p className="alert-resolved">
                <Check size={16} />
                {a.resolution_note}
              </p>
            )}
          </article>
          <MovementsPanel
            trip={detail.journey.trip}
            passenger={detail.journey.passenger}
            role={context.role}
            busy={busy}
            focusKind={a.movement_kind}
            onConfirm={(kind: MovementKind) =>
              void run(async () => {
                await api(
                  `trips/${a.trip_id}/passengers/${a.passenger_id}/movements/${kind}/confirm`,
                  {},
                );
              }, "Confirmação registrada pelas regras da movimentação.")
            }
          />
          {a.actions.canRecord && (
            <section className="alert-record">
              <h3>Registrar acompanhamento</h3>
              <p>
                Registre um contato realizado ou uma verificação física que você
                efetivamente fez. Anotações não substituem as confirmações.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  record(action);
                }}
              >
                <label>
                  Tipo
                  <select
                    aria-label="Tipo"
                    disabled={busy}
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="CONTACT">Contato realizado</option>
                    <option value="VERIFICATION">
                      Verificação física realizada
                    </option>
                  </select>
                </label>
                <label>
                  Fatos, pessoas contatadas e resultado
                  <textarea
                    disabled={busy}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    minLength={20}
                    maxLength={2000}
                    required
                    rows={4}
                  />
                </label>
                <button className="alert-button" disabled={busy}>
                  Registrar acompanhamento
                </button>
              </form>
              <p className="small-note">{a.actions.resolutionExplanation}</p>
              {a.actions.canResolve && (
                <button
                  className="alert-button resolve"
                  disabled={busy || note.trim().length < 20}
                  onClick={() => record("RESOLVED")}
                >
                  Encerrar atendimento verificado
                </button>
              )}
            </section>
          )}
          <section className="alert-history">
            <h3>Histórico do atendimento</h3>
            {detail.history.map((e) => (
              <article key={e.id}>
                <time>{time(e.occurred_at)}</time>
                <strong>
                  {alertEventLabels[e.type]}
                  {e.details.level !== undefined
                    ? " · " + alertLevels[e.details.level]
                    : ""}
                </strong>
                <p>{e.actor_name}</p>
                {e.details.note && <p>{e.details.note}</p>}
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
