"use client";
import { useEffect, useRef, useState } from "react";
import GuardianDayCard from "./guardian-day-card";
import { groupAgenda } from "../../shared/day-choice";
import { planningLabel } from "../../shared/planning-presentation";
import AgendaCalendar from "./agenda-calendar";
import { createPlanningMaterializer } from "../../shared/materialize-planning";
import {
  CalendarDays,
  ArrowUpRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
type Context = { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
type Link = {
  student_id: string;
  id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  cutoff_time: string | null;
  timezone: string | null;
  policy_demo: boolean;
  today: string;
  tomorrow: string;
};
type Policy = {
  cutoff_time: string;
  timezone: string;
  revision: number;
  demo: boolean;
};
type Options = {
  serverNow: string;
  defaultToday: string;
  policy: Policy | null;
  links: Link[];
};
type Day = { weekday: number; outbound: boolean; return: boolean };
type Routine = { revision: number; days: Day[] };
type Plan = {
  student_id: string;
  id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  operating_link_id: string;
  direction: string;
  status: string;
  scheduled: boolean;
  routine_revision: number | null;
  service_date: string;
  timezone: string;
  deadline_at: string;
  version: number;
  late: boolean;
  today: string;
  locked_at: string | null;
  exception: boolean;
  request_id: string | null;
  requested_usage: boolean;
  request_reason: string;
  can_withdraw: boolean;
  last_change: {
    status: string;
    requestedUsage: boolean;
    decisionNote: string | null;
  } | null;
};
type Board = {
  plans: Plan[];
  counts: {
    scheduled: number;
    pending: number;
    confirmed: number;
    notUsing: number;
    notExpected: number;
    missingConfiguration: number;
    awaitingChanges: number;
  };
};
const labels: Record<string, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Uso confirmado",
  NOT_USING: "Não utilizará",
  NOT_EXPECTED: "Sem previsão na rotina",
};
const decision: Record<string, string> = {
  ACCEPTED: "Alteração aceita pelo transporte",
  REFUSED: "Alteração recusada pelo transporte",
  WITHDRAWN: "Pedido retirado pelo responsável",
};
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
function tomorrow(today: string) {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export default function PlanningPanel({ context }: { context: Context }) {
  const materializePlanning = useRef(createPlanningMaterializer()).current;
  const guardian = context.role === "GUARDIAN",
    driver = context.role === "DRIVER";
  const [options, setOptions] = useState<Options | null>(null),
    [tab, setTab] = useState("daily"),
    [date, setDate] = useState(""),
    [linkId, setLinkId] = useState(""),
    [routine, setRoutine] = useState<Routine | null>(null),
    [board, setBoard] = useState<Board | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [notes, setNotes] = useState<Record<string, string>>({});
  const [cutoff, setCutoff] = useState("18:00"),
    [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [expanded, setExpanded] = useState<string | null>(null);
  async function api<T>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ): Promise<T> {
    const res = await fetch("/api/planning/" + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Context-Id": context.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Não foi possível concluir.");
    return data;
  }
  async function loadOptions() {
    const data = await api<Options>("options");
    setOptions(data);
    setLinkId((old) =>
      data.links.some((l) => l.id === old) ? old : data.links[0]?.id || "",
    );
    setDate(
      (old) => old || data.links[0]?.tomorrow || tomorrow(data.defaultToday),
    );
    setCutoff(data.policy?.cutoff_time.slice(0, 5) || "18:00");
    setTimezone(data.policy?.timezone || "America/Sao_Paulo");
    return data;
  }
  const dateRef = useRef(date);
  dateRef.current = date;
  async function loadBoard() {
    if (date) {
      if (options && (guardian || driver))
        await materializePlanning(date, options, (body) =>
          api("generate", body),
        );
      const result = await api<Board>("day?date=" + date);
      if (dateRef.current === date) setBoard(result);
    }
  }
  async function loadRoutine() {
    if (linkId) setRoutine(await api<Routine>("routines/" + linkId));
  }
  useEffect(() => {
    let alive = true;
    loadOptions()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setBoard(null);
    setExpanded(null);
    if (date && options)
      (async () => {
        if (guardian || driver)
          await materializePlanning(date, options, (body) =>
            api("generate", body),
          );
        if (!alive) return null;
        return api<Board>("day?date=" + date);
      })()
        .then((data) => {
          if (alive && data) setBoard(data);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [date, options]);
  useEffect(() => {
    let alive = true;
    setRoutine(null);
    if (linkId)
      api<Routine>("routines/" + linkId)
        .then((data) => {
          if (alive) setRoutine(data);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [linkId]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = options?.links.find((l) => l.id === linkId);
  const today =
    options?.links[0]?.today ||
    options?.defaultToday ||
    new Date().toISOString().slice(0, 10);
  const selectedDate = new Date((date || today) + "T12:00:00Z");
  async function respond(p: Plan, use: boolean) {
    await run(async () => {
      const r = await api<{
        awaitingAcceptance?: boolean;
        unchanged?: boolean;
      }>("plans/" + p.id + "/respond", {
        use,
        expectedVersion: p.version,
        ...(notes[p.id]?.trim() ? { reason: notes[p.id] } : {}),
      });
      await loadBoard();
      setNotice(
        r.awaitingAcceptance
          ? "Pedido enviado para análise do transporte. A situação vigente foi mantida."
          : r.unchanged
            ? "Esta escolha já estava registrada."
            : "Escolha registrada somente para este trecho.",
      );
    });
  }
  async function decide(p: Plan, action: string) {
    await run(async () => {
      await api(
        "changes/" + p.request_id,
        { action, ...(notes[p.id]?.trim() ? { note: notes[p.id] } : {}) },
        "PATCH",
      );
      await loadBoard();
      setNotice(
        action === "ACCEPT"
          ? "Alteração aceita e disponível para família, escola e transporte."
          : action === "REFUSE"
            ? "Pedido recusado. A situação anterior foi mantida."
            : "Pedido retirado. A situação anterior foi mantida.",
      );
    });
  }
  function changeDay(
    weekday: number,
    field: "outbound" | "return",
    value: boolean,
  ) {
    if (routine)
      setRoutine({
        ...routine,
        days: routine.days.map((d) =>
          d.weekday === weekday ? { ...d, [field]: value } : d,
        ),
      });
  }
  if (loading)
    return (
      <section className="panel loading-inline">
        <LoaderCircle className="spin" size={18} /> Carregando planejamento…
      </section>
    );
  return (
    <div className="planning-root">
      <div className="registry-tabs" role="tablist" aria-label="Planejamento">
        <button
          role="tab"
          aria-selected={tab === "daily"}
          onClick={() => setTab("daily")}
        >
          Planejamento diário
        </button>
        <button
          role="tab"
          aria-selected={tab === "weekly"}
          onClick={() => setTab("weekly")}
        >
          {guardian ? "Rotina semanal" : "Consultar rotinas"}
        </button>
        {driver && (
          <button
            role="tab"
            aria-selected={tab === "policy"}
            onClick={() => setTab("policy")}
          >
            Horário limite
          </button>
        )}
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
      {tab === "daily" && (
        <div className="agenda-layout">
          <section className="agenda-calendar-column">
            <AgendaCalendar
              value={date}
              today={today}
              onChange={(value) => {
                setDate(value);
                setError("");
                setNotice("");
              }}
            />
            <details className="agenda-tools">
              <summary>
                Opções do planejamento <ChevronDown size={14} />
              </summary>
              <div className="planning-date-controls">
                <label>
                  Data do planejamento
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setError("");
                      setNotice("");
                    }}
                  />
                </label>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await loadOptions();
                      await loadBoard();
                    })
                  }
                >
                  Atualizar situação
                </button>
              </div>
              <p className="registry-note">
                A confirmação é feita no dia anterior. Após o limite ou na
                própria data, a alteração precisa de aceite do transporte.
                Previsão sem rotina não equivale a cancelamento.
              </p>
            </details>
          </section>
          <section className="agenda-day-column" aria-label="Agenda do dia">
            <header className="agenda-day-heading">
              <div className="agenda-date-block">
                <span>
                  {date === today
                    ? "HOJE"
                    : date === tomorrow(today)
                      ? "AMANHÃ"
                      : selectedDate.toLocaleDateString("pt-BR", {
                          weekday: "long",
                          timeZone: "UTC",
                        })}
                </span>
                <div>
                  <strong>{selectedDate.getUTCDate()}</strong>
                  <p>
                    {selectedDate.toLocaleDateString("pt-BR", {
                      month: "long",
                      timeZone: "UTC",
                    })}
                    <small>
                      {board
                        ? `${board.plans.length} trechos · ${board.counts.pending} aguardando confirmação`
                        : "Carregando planejamento…"}
                    </small>
                  </p>
                </div>
              </div>
              <div className="agenda-day-actions">
                <button
                  className="agenda-refresh"
                  aria-label="Atualizar situação"
                  title="Atualizar situação"
                  disabled={busy}
                  onClick={() => run(loadBoard)}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
            </header>
            {board && (
              <>
                <details className="agenda-summary">
                  <summary>
                    Resumo do dia <ChevronDown size={13} />
                  </summary>
                  <div className="planning-counts">
                    {[
                      [board.counts.scheduled, "Trechos previstos"],
                      [board.counts.pending, "Aguardando resposta"],
                      [board.counts.confirmed, "Uso confirmado"],
                      [board.counts.notUsing, "Não utilizará"],
                      [
                        board.counts.missingConfiguration,
                        "Previsão sem configuração",
                      ],
                      [board.counts.awaitingChanges, "Alterações em análise"],
                    ].map(([n, label]) => (
                      <div key={label}>
                        <strong>{n}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </details>
                {!board.plans.length ? (
                  <section className="panel registry-empty">
                    <CalendarDays size={28} />
                    <h3>Nenhuma previsão gerada para esta data.</h3>
                    <p>
                      São considerados vínculos ativos com limite configurado
                      pelo transporte. Datas de hoje até os próximos 30 dias são
                      preparadas automaticamente; datas passadas permanecem
                      somente para consulta.
                    </p>
                  </section>
                ) : (
                  <div className="planning-cards">
                    {guardian
                      ? groupAgenda(board.plans).map((g) => (
                          <GuardianDayCard
                            key={context.id + g.key}
                            plans={g.plans}
                            submit={(body) => api("day/respond", body)}
                            refresh={loadBoard}
                            withdraw={(p) => decide(p as Plan, "WITHDRAW")}
                          />
                        ))
                      : board.plans.map((p) => (
                          <article
                            key={p.id}
                            className={`planning-card agenda-event ${expanded === p.id ? "expanded" : ""}`}
                            data-plan-id={p.id}
                          >
                            <button
                              className="agenda-event-toggle"
                              aria-expanded={expanded === p.id}
                              aria-controls={"plan-details-" + p.id}
                              onClick={() =>
                                setExpanded(expanded === p.id ? null : p.id)
                              }
                            >
                              <span className="agenda-event-icon">
                                {p.direction === "OUTBOUND" ? (
                                  <ArrowUp size={20} />
                                ) : (
                                  <ArrowDown size={20} />
                                )}
                              </span>
                              <span className="agenda-event-copy">
                                <span className="agenda-event-meta">
                                  {p.direction === "OUTBOUND"
                                    ? "IDA · CASA → ESCOLA"
                                    : "VOLTA · ESCOLA → CASA"}
                                </span>
                                <strong>{p.student_name}</strong>
                                <span className="agenda-event-subtitle">
                                  {p.request_id
                                    ? planningLabel(p) +
                                      " · Alteração aguardando aceite"
                                    : planningLabel(p)}
                                </span>
                              </span>
                              <span className="agenda-event-open">
                                {expanded === p.id ? (
                                  <ChevronDown size={18} />
                                ) : (
                                  <ArrowUpRight size={18} />
                                )}
                              </span>
                            </button>
                            <div
                              id={"plan-details-" + p.id}
                              className="agenda-event-details"
                              hidden={expanded !== p.id}
                            >
                              <div className="panel-heading">
                                <div>
                                  <span className="planning-direction">
                                    {p.direction === "OUTBOUND"
                                      ? "IDA · CASA → ESCOLA"
                                      : "VOLTA · ESCOLA → CASA"}
                                  </span>
                                  <h3>{p.student_name}</h3>
                                  <p>
                                    {p.school_name}
                                    <br />
                                    {p.transport_name}
                                    <br />
                                    Cadastro {p.student_id.slice(-8)}
                                  </p>
                                </div>
                                <span
                                  className={
                                    "registry-badge " +
                                    (p.status === "CONFIRMED"
                                      ? "active"
                                      : p.status === "NOT_USING"
                                        ? "inactive"
                                        : "pending")
                                  }
                                >
                                  {planningLabel(p)}
                                </span>
                              </div>
                              <div className="planning-deadline">
                                <Clock3 size={14} />
                                <span>
                                  Limite:{" "}
                                  {new Date(p.deadline_at).toLocaleString(
                                    "pt-BR",
                                    {
                                      timeZone: p.timezone,
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    },
                                  )}
                                  <small>
                                    {p.timezone.replaceAll("_", " ")}
                                  </small>
                                </span>
                              </div>
                              <p className="registry-note">
                                {p.routine_revision === null
                                  ? "Este planejamento foi criado sem rotina definida."
                                  : p.scheduled
                                    ? "Trecho previsto na rotina semanal."
                                    : "Trecho não previsto na rotina semanal."}
                                {p.exception
                                  ? " Exceção registrada para esta data."
                                  : ""}
                              </p>
                              {p.request_id && (
                                <div className="planning-request">
                                  <strong>Alteração aguardando aceite</strong>
                                  <p>
                                    Pedido:{" "}
                                    {p.requested_usage
                                      ? "utilizará"
                                      : "não utilizará"}{" "}
                                    este trecho.
                                  </p>
                                  <p>{p.request_reason}</p>
                                  <small>
                                    Situação vigente: {planningLabel(p)}
                                  </small>
                                </div>
                              )}
                              {!p.request_id &&
                                p.last_change &&
                                decision[p.last_change.status] && (
                                  <div className="planning-history">
                                    <strong>
                                      {decision[p.last_change.status]}
                                    </strong>
                                    {p.last_change.decisionNote && (
                                      <p>{p.last_change.decisionNote}</p>
                                    )}
                                  </div>
                                )}
                              {p.locked_at ? (
                                <p className="registry-note">
                                  <ShieldCheck size={14} /> Planejamento
                                  bloqueado pela operação.
                                </p>
                              ) : p.service_date < p.today ? (
                                <p className="registry-note">
                                  Data passada · somente consulta.
                                </p>
                              ) : guardian ? (
                                <>
                                  {p.request_id ? (
                                    p.can_withdraw && (
                                      <button
                                        className="text-button planning-withdraw"
                                        disabled={busy}
                                        onClick={() => decide(p, "WITHDRAW")}
                                      >
                                        Retirar pedido de alteração
                                      </button>
                                    )
                                  ) : p.service_date > tomorrow(p.today) ? (
                                    <p className="registry-note">
                                      Confirme no dia anterior a esta data.
                                    </p>
                                  ) : (
                                    <>
                                      <label className="planning-reason">
                                        Motivo da alteração (obrigatório após o
                                        limite)
                                        <textarea
                                          value={notes[p.id] || ""}
                                          maxLength={1000}
                                          onChange={(e) =>
                                            setNotes({
                                              ...notes,
                                              [p.id]: e.target.value,
                                            })
                                          }
                                          placeholder={
                                            p.late
                                              ? "Descreva a necessidade da alteração"
                                              : "Opcional antes do limite"
                                          }
                                        />
                                      </label>
                                      <div className="planning-actions">
                                        <button
                                          className="button"
                                          disabled={busy}
                                          onClick={() => respond(p, true)}
                                        >
                                          {p.late
                                            ? "Solicitar uso"
                                            : "Confirmar uso"}
                                        </button>
                                        <button
                                          className="planning-secondary"
                                          disabled={busy}
                                          onClick={() => respond(p, false)}
                                        >
                                          {p.late
                                            ? "Solicitar não uso"
                                            : "Não utilizará"}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </>
                              ) : driver && p.request_id ? (
                                <>
                                  <label className="planning-reason">
                                    Registro da decisão (obrigatório para
                                    recusar)
                                    <textarea
                                      value={notes[p.id] || ""}
                                      maxLength={1000}
                                      onChange={(e) =>
                                        setNotes({
                                          ...notes,
                                          [p.id]: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <div className="planning-actions">
                                    <button
                                      className="button"
                                      disabled={busy}
                                      onClick={() => decide(p, "ACCEPT")}
                                    >
                                      Aceitar alteração
                                    </button>
                                    <button
                                      className="planning-secondary"
                                      disabled={busy}
                                      onClick={() => decide(p, "REFUSE")}
                                    >
                                      Recusar alteração
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </article>
                        ))}
                  </div>
                )}
              </>
            )}
            <p className="planning-footnote">
              <ShieldCheck size={15} /> Estes são estados de planejamento; não
              comprovam embarque ou entrega de uma criança.
            </p>
          </section>
        </div>
      )}
      {tab === "weekly" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>
                {guardian
                  ? "Rotina semanal por filho"
                  : "Rotina informada pelo responsável"}
              </h3>
              <p>
                Salve a ida e a volta de cada dia separadamente. Previsão não
                substitui a confirmação por data.
              </p>
            </div>
          </div>
          <label>
            Aluno e vínculo
            <select
              value={linkId}
              onChange={(e) => {
                setLinkId(e.target.value);
                setError("");
                setNotice("");
              }}
            >
              <option value="">Selecione um vínculo ativo</option>
              {options?.links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.student_name} · {l.school_name} · {l.transport_name} ·{" "}
                  {l.student_id.slice(-8)}
                </option>
              ))}
            </select>
          </label>
          {selected && routine && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Dia da semana</th>
                      <th>Ida</th>
                      <th>Volta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routine.days
                      .slice()
                      .sort((a, b) => a.weekday - b.weekday)
                      .map((d) => (
                        <tr key={d.weekday}>
                          <td>{weekdays[d.weekday]}</td>
                          <td>
                            <input
                              className="planning-checkbox"
                              aria-label={`Ida ${weekdays[d.weekday]}`}
                              type="checkbox"
                              disabled={!guardian || busy}
                              checked={d.outbound}
                              onChange={(e) =>
                                changeDay(
                                  d.weekday,
                                  "outbound",
                                  e.target.checked,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="planning-checkbox"
                              aria-label={`Volta ${weekdays[d.weekday]}`}
                              type="checkbox"
                              disabled={!guardian || busy}
                              checked={d.return}
                              onChange={(e) =>
                                changeDay(d.weekday, "return", e.target.checked)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="registry-note">
                Previsões já geradas não mudam ao salvar esta rotina. Para
                alterar uma data já gerada, use o planejamento diário.
              </p>
              <div className="planning-actions">
                {guardian && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(
                          "routines/" + linkId,
                          {
                            expectedRevision: routine.revision,
                            days: routine.days,
                          },
                          "PUT",
                        );
                        await loadRoutine();
                        setNotice(
                          "Rotina salva. Ida e volta continuam com confirmações próprias por data.",
                        );
                      })
                    }
                  >
                    <Check size={16} /> Salvar rotina
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => run(loadRoutine)}
                >
                  Recarregar rotina
                </button>
              </div>
            </>
          )}
          {!options?.links.length && (
            <p className="registry-note">
              Primeiro é necessário um vínculo operacional ativo e, para
              responsáveis, um vínculo familiar verificado.
            </p>
          )}
        </section>
      )}
      {tab === "policy" && driver && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Limite de confirmação da operação</h3>
              <p>
                Configuração para teste. O horário e a autoridade definitiva
                ainda dependem da validação operacional.
              </p>
            </div>
            <Clock3 className="green-icon" />
          </div>
          {options?.policy?.demo && (
            <div className="planning-request">
              <strong>Valor de demonstração</strong>
              <p>
                18:00 no fuso de São Paulo é uma proposta para testar o fluxo,
                sem aprovação operacional implícita.
              </p>
            </div>
          )}
          <form
            className="registry-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  "policy",
                  {
                    cutoffTime: cutoff,
                    timezone,
                    expectedRevision: options?.policy?.revision || 0,
                  },
                  "PUT",
                );
                await loadOptions();
                setNotice(
                  "Limite salvo para novas previsões. Prazos de previsões existentes foram preservados.",
                );
              });
            }}
          >
            <div className="registry-form-grid">
              <label>
                Horário limite no dia anterior
                <input
                  type="time"
                  required
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                />
              </label>
              <label>
                Fuso da operação
                <select
                  required
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {Array.from(
                    new Set([
                      "America/Sao_Paulo",
                      "America/Manaus",
                      "America/Rio_Branco",
                      "America/Fortaleza",
                      "America/Noronha",
                      timezone,
                    ]),
                  ).map((tz) => (
                    <option value={tz} key={tz}>
                      {tz.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button" disabled={busy}>
              Salvar limite
            </button>
          </form>
          <p className="registry-note">
            Sem configuração, o vínculo não gera previsões. A rotina não
            determina o tratamento definitivo de passageiros sem resposta, que
            será definido antes das viagens.
          </p>
        </section>
      )}
    </div>
  );
}
