"use client";
import { useEffect, useRef, useState } from "react";
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
  resolutionKinds,
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
  initialAwaiting = false,
  onOpenTarget,
  onSelect,
  active = true,
}: {
  context: Context;
  initialId?: string;
  initialAwaiting?: boolean;
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [awaiting, setAwaiting] = useState(initialAwaiting),
    [pendingCount, setPendingCount] = useState(0);
  const sending = useRef(false),
    uncertain = useRef(false),
    visit = useRef(0),
    readSequence = useRef(0);
  const returnPoint = useRef<{ top: number; focus: HTMLElement | null } | null>(
    null,
  );
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const effectiveNote = drafts[action] || "";

  const listPath =
    "alerts?closed=" + closed + "&awaitingAcknowledgement=" + awaiting;
  const [minutes, setMinutes] = useState([5, 10, 15]);
  useEffect(() => {
    if (!selected && returnPoint.current) {
      const point = returnPoint.current;
      requestAnimationFrame(() => {
        window.scrollTo({ top: point.top, behavior: "instant" });
        if (point.focus?.isConnected)
          point.focus.focus({ preventScroll: true });
      });
    }
  }, [selected, items]);
  useEffect(() => {
    setAwaiting(initialAwaiting);
    setClosed(initialAwaiting);
  }, [initialAwaiting]);
  useEffect(() => {
    setSelected(initialId);
  }, [initialId]);
  useEffect(
    () => () => {
      visit.current++;
      readSequence.current++;
    },
    [context.id],
  );
  function select(id: string) {
    if (sending.current) return;
    if (id)
      returnPoint.current = {
        top: window.scrollY,
        focus:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
      };
    visit.current++;
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
    const seq = ++readSequence.current;
    const id = selected;
    if (selected) {
      const value = await api<AlertDetail>("alerts/" + selected);
      if (seq === readSequence.current && selectedRef.current === id)
        setDetail(value);
    } else {
      const [list, opts] = await Promise.all([
        api<{ items: AlertItem[]; pendingCount: number }>(listPath),
        api<AlertOptions>("alerts/options"),
      ]);
      if (seq === readSequence.current) {
        setItems(list.items);
        setPendingCount(list.pendingCount);
        setOptions(opts);
      }
    }
  }
  useEffect(() => {
    setDetail(null);
    setItems([]);
    setNote("");
    setDrafts({});
    uncertain.current = false;
    visit.current++;
    readSequence.current++;
  }, [selected, closed, awaiting, context.id]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setError("");
    setLoading(true);
    const load = async () => {
      if (sending.current) return;
      const seq = ++readSequence.current;
      try {
        if (selected) {
          const data = await api<AlertDetail>("alerts/" + selected);
          if (alive && seq === readSequence.current) setDetail(data);
        } else {
          const [list, opts] = await Promise.all([
            api<{ items: AlertItem[]; pendingCount: number }>(listPath),
            api<AlertOptions>("alerts/options"),
          ]);
          if (alive && seq === readSequence.current) {
            setItems(list.items);
            setPendingCount(list.pendingCount);
            setOptions(opts);
          }
        }
        if (alive && seq === readSequence.current) setError("");
      } catch (e) {
        if (alive && seq === readSequence.current) {
          setError((e as Error).message);
          setDetail(null);
          setItems([]);
          setDrafts({});
        }
      } finally {
        if (alive && seq === readSequence.current) setLoading(false);
      }
    };
    void load();
    const resume = () => {
      if (!document.hidden && navigator.onLine) void load();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selected, closed, awaiting, context.id, active]);
  useEffect(() => {
    if (options?.policy)
      setMinutes([
        options.policy.reminder_minutes,
        options.policy.attention_minutes,
        options.policy.critical_minutes,
      ]);
  }, [options?.policy?.revision]);
  async function run(fn: () => Promise<unknown>, message: string) {
    if (sending.current) return;
    sending.current = true;
    readSequence.current++;
    const actionVisit = visit.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (uncertain.current) {
        await refresh();
        uncertain.current = false;
        setNotice(
          "Estado consultado. Confira os dados antes de tentar novamente.",
        );
        return;
      }
      await fn();
      await refresh();
      if (actionVisit !== visit.current) return;
      setNotice(message);
    } catch (e) {
      if (actionVisit !== visit.current) return;
      setError((e as Error).message);
      uncertain.current = true;
      try {
        await refresh();
        uncertain.current = false;
        if (e instanceof TypeError)
          setError(
            "A resposta do envio foi interrompida. O estado exibido foi consultado no servidor.",
          );
      } catch {
        setError(
          "Não foi possível consultar o estado. A próxima tentativa apenas verificará o servidor.",
        );
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const a = detail?.alert,
    time = (at: string) =>
      new Date(at).toLocaleString("pt-BR", {
        timeZone: a?.timezone || "America/Sao_Paulo",
      });
  function record(type: string, text = drafts[type] || "") {
    if (!a) return;
    void run(
      async () => {
        await api(`alerts/${a.id}/actions`, {
          type,
          note: text,
          expectedVersion: a.version,
        });
        setDrafts((old) => ({ ...old, [type]: "" }));
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
              className={!closed && !awaiting ? "active" : ""}
              onClick={() => {
                setClosed(false);
                setAwaiting(false);
              }}
            >
              Em acompanhamento
            </button>
            <button
              className={closed && !awaiting ? "active" : ""}
              onClick={() => {
                setClosed(true);
                setAwaiting(false);
              }}
            >
              Resolvidas
            </button>
            <button
              className={awaiting ? "active" : ""}
              onClick={() => {
                setAwaiting(true);
                setClosed(true);
              }}
            >
              Aguardando minha ciência ({pendingCount})
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
                Assumir atendimento
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
              <h3>Contato e verificação</h3>
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
                    value={effectiveNote}
                    onChange={(e) =>
                      setDrafts((old) => ({ ...old, [action]: e.target.value }))
                    }
                    minLength={20}
                    maxLength={2000}
                    required
                    rows={4}
                  />
                </label>
                <button className="alert-button" disabled={busy}>
                  {action === "CONTACT"
                    ? "Registrar contato"
                    : "Registrar verificação"}
                </button>
              </form>
              <p className="small-note">{a.actions.resolutionExplanation}</p>
            </section>
          )}
          {a.status !== "RESOLVED" && (
            <section className="alert-record urgency-resolution">
              <h3>Resolver urgência</h3>
              <p>{a.actions.resolutionExplanation}</p>
              {a.actions.resolutionMode === "VERIFIED_FOLLOW_UP" && (
                <ul>
                  {a.actions.requirements?.map((r) => (
                    <li key={r.id}>
                      {r.met ? "✓" : "○"} {r.label}
                    </li>
                  ))}
                </ul>
              )}
              {a.actions.resolutionMode === "VERIFIED_FOLLOW_UP" && (
                <>
                  <label>
                    Justificativa da resolução
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={drafts.RESOLVED || ""}
                      disabled={busy}
                      onChange={(e) =>
                        setDrafts((old) => ({
                          ...old,
                          RESOLVED: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="button"
                    disabled={
                      busy ||
                      !a.actions.canResolve ||
                      (drafts.RESOLVED || "").trim().length < 20
                    }
                    onClick={() => record("RESOLVED")}
                  >
                    Resolver urgência
                  </button>
                  <p className="small-note">
                    Descreva a resolução com pelo menos 20 caracteres. Os
                    requisitos acima devem estar cumpridos.
                  </p>
                </>
              )}
            </section>
          )}
          {a.status === "RESOLVED" && (
            <section className="alert-record urgency-resolution">
              <h3>Urgência resolvida</h3>
              <p>
                {a.resolution?.actor_name || "Registro histórico"} ·{" "}
                {time(
                  a.resolution?.occurred_at || a.resolved_at || a.origin_at,
                )}
              </p>
              <p>
                {resolutionKinds[
                  (a as AlertItem & { resolution_kind?: string })
                    .resolution_kind || ""
                ] || "Consulte a forma de resolução no histórico."}
              </p>
              <p>{a.resolution_note}</p>
              {a.receipt ? (
                <>
                  <h4>Ciências pendentes: {a.receipt.pendingCount}</h4>
                  <p>
                    Ciência confirma o recebimento desta informação e não altera
                    a viagem.
                  </p>
                  {a.receipt.recipients.map((r, i) => (
                    <p key={i}>
                      {r.name}
                      {r.isMe ? " (você)" : ""} ·{" "}
                      {r.acknowledgedAt
                        ? "Ciente em " + time(r.acknowledgedAt)
                        : r.revokedAt
                          ? "Dispensada por perda de acesso"
                          : "Aguardando ciência"}
                    </p>
                  ))}
                  {a.receipt.missingRoles.map((role) => (
                    <p key={role}>
                      Sem destinatário ativo: {movementRoleLabels[role] || role}
                    </p>
                  ))}
                  {a.receipt.canAcknowledge && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            `alerts/${a.id}/resolution-acknowledgements`,
                            { resolutionEventId: a.receipt!.eventId },
                          );
                        }, "Ciência da resolução registrada.")
                      }
                    >
                      Confirmar ciência da resolução
                    </button>
                  )}
                </>
              ) : (
                <p>Esta resolução não possui solicitação de ciência.</p>
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
