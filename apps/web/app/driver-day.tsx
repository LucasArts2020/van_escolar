"use client";
import { useEffect, useRef, useState } from "react";
import {
  BusFront,
  Check,
  ChevronDown,
  ClipboardCheck,
  Search,
  Play,
  Plus,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { useDriverDay, type DriverClient } from "../../shared/use-driver-day";
import { movementPresentation } from "../../shared/movement-presentation";
import {
  tripStartBlockReason,
  tripStatusLabel,
  type MovementKind,
} from "../../shared/trips";
import type { DriverTripCard } from "../../shared/driver-day";
import type { JourneyTarget } from "../../shared/navigation";
import { alertKinds } from "../../shared/alerts";
import DriverPreparationSummary from "./driver-preparation-summary";
import TripClosure from "./trip-closure";
import TripsPanel from "./trips-panel";
import MovementsPanel from "./movements-panel";
import "./driver-day.css";

export default function DriverDay({
  context,
  active,
  onOpenTarget,
  target,
}: {
  context: { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
  active: boolean;
  onOpenTarget: (target: JourneyTarget) => void;
  target?: JourneyTarget;
}) {
  const [visible, setVisible] = useState(true),
    [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => {
      setVisible(!document.hidden);
      setOffline(!navigator.onLine);
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("offline", update);
    window.addEventListener("online", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("online", update);
    };
  }, []);
  const api: DriverClient = async (
    path,
    body,
    method = body ? "POST" : "GET",
  ) => {
    const response = await fetch("/api/" + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Context-Id": context.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(data.message || "Não foi possível atualizar."),
        { status: response.status },
      );
    return data;
  };
  const state = useDriverDay(api, active && visible && !offline);
  const { day, date, trip, rows, busy, selected } = state;
  const startReason = trip ? tripStartBlockReason(trip, context.id) : null;
  const [kind, setKind] = useState<MovementKind>("BOARDING"),
    [search, setSearch] = useState(""),
    [school, setSchool] = useState("");
  const [mode, setMode] = useState<
      "operation" | "prepare" | "manage" | "closure"
    >("operation"),
    [others, setOthers] = useState(false);
  const [showAttention, setShowAttention] = useState(false);
  useEffect(() => {
    if (state.revoked) {
      setSearch("");
      setSchool("");
      setKind("BOARDING");
      setMode("operation");
      setOthers(false);
      setShowAttention(false);
    }
  }, [state.revoked]);
  const previousTrip = useRef("");
  const refresh = useRef(state.refresh);
  refresh.current = state.refresh;
  useEffect(() => {
    const focus = () => {
      if (active && !document.hidden && navigator.onLine)
        void refresh.current();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [active]);
  useEffect(() => {
    if (selected !== previousTrip.current) {
      setKind("BOARDING");
      setSearch("");
      setSchool("");
      setMode("operation");
      previousTrip.current = selected;
    }
  }, [selected]);
  useEffect(() => {
    if (target?.tripId && target.contextId === context.id)
      state.openTrip(target.tripId);
  }, [target]);
  const cards = day?.trips.items.filter((c) => others || c.mine) || [];
  const mineCount = day?.trips.items.filter((c) => c.mine).length || 0;
  const openTarget = (
    view: "history" | "alerts",
    p: NonNullable<typeof trip>["passengers"][number],
    alertId?: string,
  ) =>
    onOpenTarget({
      view,
      contextId: context.id,
      date: trip!.service_date,
      tripId: trip!.id,
      studentId: p.student_id,
      passengerId: p.id,
      ...(alertId ? { alertId } : {}),
    });
  async function inspect() {
    const current = await state.readTrip().catch(() => null);
    if (current) setMode("closure");
  }
  const card = (c: DriverTripCard) => (
    <button className="dd-trip" key={c.id} onClick={() => state.openTrip(c.id)}>
      <i className="dd-trip-icon" aria-hidden="true">
        <BusFront size={23} />
      </i>
      <span className="dd-trip-copy">
        <strong>
          {c.vehicle_name} · {c.vehicle_plate}
        </strong>
        <small>
          {c.service_date.split("-").reverse().join("/")} ·{" "}
          {c.direction === "OUTBOUND" ? "Ida" : "Volta"} · {c.driver_name}
        </small>
        <small>
          {c.total} {c.total === 1 ? "criança" : "crianças"}
          <span className="dd-trip-status" data-status={c.status}>
            {tripStatusLabel(c.status)}
          </span>
          {c.review ? ` · ${c.review} a revisar` : ""}
        </small>
      </span>
      <ChevronRight className="dd-trip-arrow" size={18} aria-hidden="true" />
    </button>
  );
  const pageControl = (
    name: "page" | "openPage" | "attentionPage",
    info: { page: number; hasMore: boolean },
  ) => (
    <div className="dd-actions">
      {info.page > 0 && (
        <button
          className="text-button"
          onClick={() =>
            state.setPages((p) => ({ ...p, [name]: info.page - 1 }))
          }
        >
          Página anterior
        </button>
      )}
      {info.hasMore && (
        <button
          className="text-button"
          onClick={() =>
            state.setPages((p) => ({ ...p, [name]: info.page + 1 }))
          }
        >
          Próxima página
        </button>
      )}
    </div>
  );
  return (
    <div className="driver-day">
      {offline && (
        <p className="message error" role="status">
          Sem conexão. Reconecte para consultar e registrar confirmações.
        </p>
      )}
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {mode === "prepare" || mode === "manage" ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              setMode("operation");
              void state.refresh();
            }}
          >
            <ArrowLeft size={16} /> Voltar ao Meu dia
          </button>
          <TripsPanel
            key={mode + selected + date}
            context={context}
            initialDate={date}
            initialTripId={mode === "manage" ? selected : ""}
            initialDirection={
              mode === "prepare" ? state.preparationDirection : trip?.direction
            }
            initialPreparing={mode === "prepare"}
            onPrepared={(id, serviceDate) => {
              if (serviceDate !== date) state.changeDate(serviceDate);
              state.openTrip(id);
              setMode("operation");
            }}
            managementOnly
          />
        </>
      ) : (
        <>
          {!selected && (
            <>
              <section className="panel dd-toolbar">
                <div className="dd-date-controls">
                  <label>
                    <span>
                      <CalendarDays size={16} aria-hidden="true" /> Dia de
                      trabalho
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) state.changeDate(e.target.value);
                      }}
                    />
                  </label>
                  <div className="dd-actions">
                    <button
                      className="planning-secondary"
                      aria-pressed={!!day && date === day.today}
                      onClick={() => day && state.changeDate(day.today)}
                    >
                      Hoje
                    </button>
                    <button
                      className="planning-secondary"
                      aria-pressed={!!day && date === day.tomorrow}
                      onClick={() => day && state.changeDate(day.tomorrow)}
                    >
                      Amanhã
                    </button>
                  </div>
                </div>
                <button
                  className="button"
                  disabled={!date || offline}
                  onClick={() => setMode("prepare")}
                >
                  <Plus size={16} /> Preparar viagem
                </button>
              </section>
              {day && (
                <div className="dd-overview">
                  {!day.attention.total &&
                    !day.openTrips.total &&
                    !day.pendingAcknowledgements && (
                      <p className="dd-no-pending">
                        Tudo em dia · nenhuma pendência.
                      </p>
                    )}
                  {!!day.pendingAcknowledgements && (
                    <button
                      className="planning-secondary"
                      onClick={() =>
                        onOpenTarget({
                          view: "alerts",
                          contextId: context.id,
                          date: day.date,
                          awaitingAcknowledgement: true,
                        })
                      }
                    >
                      Ciências de urgências pendentes:{" "}
                      {day.pendingAcknowledgements}
                    </button>
                  )}
                  {day.attention.total > 0 && (
                    <section className="panel dd-attention">
                      <h2>
                        <AlertTriangle size={20} aria-hidden="true" />{" "}
                        Pendências{" "}
                        <span className="dd-count">{day.attention.total}</span>
                      </h2>
                      <p>
                        {day.attention.criticalCount} críticas ·{" "}
                        {day.attention.otherDatesCount} de outras datas
                      </p>
                      {(showAttention
                        ? day.attention.items
                        : day.attention.items.slice(0, 3)
                      ).map((a) => (
                        <button
                          className="dd-attention-link"
                          key={a.id}
                          onClick={() =>
                            onOpenTarget({
                              view: "alerts",
                              contextId: context.id,
                              date: a.date,
                              studentId: a.studentId,
                              tripId: a.tripId,
                              passengerId: a.passengerId,
                              alertId: a.id,
                            })
                          }
                        >
                          {a.level === 3 ? "Crítico · " : ""}
                          {a.studentName} ·{" "}
                          {a.date.split("-").reverse().join("/")} ·{" "}
                          {alertKinds[a.kind] || a.kind} →
                        </button>
                      ))}
                      {day.attention.total > 3 && (
                        <button
                          className="text-button"
                          onClick={() => setShowAttention(!showAttention)}
                        >
                          {showAttention
                            ? "Recolher pendências"
                            : "Ver todas as pendências"}
                        </button>
                      )}
                      {showAttention &&
                        pageControl("attentionPage", day.attention)}
                    </section>
                  )}
                  <DriverPreparationSummary
                    value={day.preparation}
                    direction={state.preparationDirection}
                    onDirection={state.changePreparationDirection}
                    onPage={(page) =>
                      state.setPages((old) => ({
                        ...old,
                        preparationPage: page,
                      }))
                    }
                  />
                  {day.openTrips.total > 0 && (
                    <details className="panel dd-open-trips">
                      <summary>
                        Viagens de outras datas para retomar (
                        {day.openTrips.total})
                      </summary>
                      <h2>
                        Viagens de outras datas{" "}
                        <span className="dd-count">{day.openTrips.total}</span>
                      </h2>
                      <p className="dd-section-note">
                        Ainda precisam de acompanhamento ou encerramento.
                      </p>
                      <div className="dd-trip-grid">
                        {day.openTrips.items.map(card)}
                      </div>
                      {pageControl("openPage", day.openTrips)}
                    </details>
                  )}
                  <details className="panel dd-today">
                    <summary>
                      Viagens preparadas nesta data ({day.trips.total})
                    </summary>
                    <div className="dd-heading">
                      <h2>
                        <BusFront size={21} aria-hidden="true" /> Viagens do dia
                      </h2>
                      <button
                        className="text-button"
                        aria-pressed={others}
                        onClick={() => setOthers(!others)}
                      >
                        {others
                          ? "Priorizar minhas viagens"
                          : "Outras viagens do transporte"}
                      </button>
                    </div>
                    <div className="dd-trip-grid">{cards.map(card)}</div>
                    {!cards.length && (
                      <div className="dd-empty">
                        <span className="dd-empty-icon">
                          <CalendarDays size={25} aria-hidden="true" />
                        </span>
                        <div>
                          <h3>Nenhuma viagem nesta lista</h3>
                          <p className="registry-note">
                            {mineCount === 0 && !others
                              ? "Nenhuma viagem atribuída a você nesta página. Consulte as demais viagens ou prepare uma viagem."
                              : "Sem viagens nesta data."}
                          </p>
                        </div>
                      </div>
                    )}
                    {pageControl("page", day.trips)}
                  </details>
                </div>
              )}
              {!day && state.loading && (
                <p role="status">Carregando seu dia…</p>
              )}
              {!day && !state.loading && (
                <button
                  className="planning-secondary"
                  onClick={() => void state.refresh()}
                >
                  Tentar atualizar
                </button>
              )}
            </>
          )}
          {selected && (
            <>
              <button
                className="text-button"
                onClick={() => state.openTrip("")}
              >
                <ArrowLeft size={16} /> Voltar às viagens
              </button>
              {!trip && <p role="status">Consultando a viagem…</p>}
              {trip && (
                <>
                  <section className="panel dd-trip-header">
                    <div>
                      <span className="eyebrow green">
                        {trip.direction === "OUTBOUND"
                          ? "IDA · CASA → ESCOLA"
                          : "VOLTA · ESCOLA → CASA"}
                      </span>
                      <h2>
                        {trip.vehicle_name} · {trip.vehicle_plate}
                      </h2>
                      <p>
                        {trip.driver_name} ·{" "}
                        {trip.service_date.split("-").reverse().join("/")}
                      </p>
                      <span className="registry-badge">
                        {tripStatusLabel(
                          trip.status,
                          trip.closure.exceptional > 0,
                        )}
                      </span>
                    </div>
                    <div className="dd-actions">
                      {trip.status === "PLANNED" && (
                        <button
                          className="button"
                          disabled={busy || offline || !!startReason}
                          aria-describedby={
                            startReason ? "dd-start-block" : undefined
                          }
                          onClick={() => void state.start()}
                        >
                          <Play size={16} /> Iniciar viagem
                        </button>
                      )}
                      {trip.closure.canInspect && (
                        <button
                          className="planning-secondary"
                          disabled={busy || offline}
                          onClick={() => void inspect()}
                        >
                          <ClipboardCheck size={16} /> Conferência e
                          encerramento
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setMode("manage")}
                      >
                        Ajustar viagem e destinações
                      </button>
                    </div>
                  </section>
                  {trip.status === "PLANNED" && startReason && (
                    <section
                      className="panel dd-start-warning"
                      id="dd-start-block"
                    >
                      <h3>Antes de iniciar</h3>
                      <p>{startReason}</p>
                      {trip.counts.review > 0 && (
                        <button
                          className="planning-secondary"
                          disabled={busy}
                          onClick={() => setMode("manage")}
                        >
                          Revisar participações
                        </button>
                      )}
                    </section>
                  )}
                  {mode === "closure" ? (
                    <section className="panel">
                      <button
                        className="text-button"
                        onClick={() => setMode("operation")}
                      >
                        ← Voltar às confirmações
                      </button>
                      <TripClosure
                        trip={trip}
                        busy={busy}
                        onClose={state.close}
                      />
                    </section>
                  ) : (
                    <>
                      <section className="panel dd-execution-tools">
                        <div
                          className="registry-tabs"
                          role="tablist"
                          aria-label="Etapa da confirmação"
                        >
                          {(["BOARDING", "ALIGHTING"] as const).map((k) => (
                            <button
                              key={k}
                              role="tab"
                              aria-selected={kind === k}
                              onClick={() => setKind(k)}
                            >
                              {k === "BOARDING" ? (
                                <ArrowUpRight size={19} aria-hidden="true" />
                              ) : (
                                <ArrowDownLeft size={19} aria-hidden="true" />
                              )}
                              {k === "BOARDING" ? "Embarque" : "Desembarque"}
                            </button>
                          ))}
                        </div>
                        <div className="dd-metrics">
                          <span>
                            <strong>{trip.counts.expected}</strong> Incluídos na
                            viagem
                          </span>
                          <span>
                            <strong>
                              {kind === "BOARDING"
                                ? trip.counts.boardingValidated
                                : trip.counts.delivered}
                            </strong>
                            Dupla confirmação
                          </span>
                          {trip.counts.review > 0 && (
                            <span>
                              <strong>{trip.counts.review}</strong> Em revisão
                              pelo transporte
                            </span>
                          )}
                          <span>
                            <strong>{trip.counts.openIssues}</strong>{" "}
                            Ocorrências abertas
                          </span>
                        </div>
                        <div className="dd-filters">
                          <label>
                            <Search size={16} /> Buscar criança
                            <input
                              type="search"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder="Nome ou identificação"
                            />
                          </label>
                          <label>
                            Escola
                            <select
                              value={school}
                              onChange={(e) => setSchool(e.target.value)}
                            >
                              <option value="">Todas as escolas</option>
                              {Array.from(
                                new Set(
                                  trip.passengers.map((p) => p.school_name),
                                ),
                              ).map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </section>
                      <div className="dd-passengers">
                        {trip.passengers
                          .filter(
                            (p) =>
                              (!school || p.school_name === school) &&
                              `${p.student_name} ${p.student_id}`
                                .toLocaleLowerCase()
                                .includes(search.toLocaleLowerCase()),
                          )
                          .map((p) => {
                            const presentation = movementPresentation(
                                p,
                                kind,
                                "DRIVER",
                                context.id,
                              ),
                              row = rows[p.id] || {};
                            const can =
                              !row.busy &&
                              !busy &&
                              !offline &&
                              (row.uncertain ||
                                presentation.movement.canConfirm);
                            return (
                              <article
                                key={p.id}
                                className="panel dd-child"
                                data-passenger-id={p.id}
                              >
                                <div className="dd-child-main">
                                  <div>
                                    <div className="dd-child-identity">
                                      <span
                                        className="dd-child-avatar"
                                        aria-hidden="true"
                                      >
                                        {p.student_name
                                          .split(" ")
                                          .filter(Boolean)
                                          .slice(0, 2)
                                          .map((n) => n[0])
                                          .join("")}
                                      </span>
                                      <div>
                                        <h3>{p.student_name}</h3>
                                        <small>
                                          {p.school_name} · Identificação{" "}
                                          {p.student_id.slice(-8)}
                                        </small>
                                      </div>
                                    </div>
                                    <p
                                      className={
                                        presentation.pendingReview
                                          ? "dd-status dd-warning"
                                          : "dd-status"
                                      }
                                    >
                                      {presentation.status}
                                    </p>
                                    <p className="dd-occurrence dd-warning">
                                      {presentation.hasOccurrence
                                        ? "Ocorrência aberta · ver detalhes"
                                        : ""}
                                    </p>
                                  </div>
                                  <button
                                    className="button dd-confirm"
                                    aria-disabled={!can}
                                    aria-busy={!!row.busy}
                                    aria-label={`${presentation.actionLabel}: ${p.student_name}, identificação ${p.student_id.slice(-8)}, ${trip.service_date}`}
                                    onClick={() => {
                                      if (can) void state.confirm(p.id, kind);
                                    }}
                                  >
                                    <Check size={16} />
                                    {row.busy
                                      ? "Registrando…"
                                      : row.uncertain
                                        ? "Verificar estado"
                                        : presentation.actionLabel}
                                  </button>
                                </div>
                                {!presentation.movement.canConfirm &&
                                  !presentation.record && (
                                    <p className="registry-note">
                                      {presentation.movement.blockedReason}
                                    </p>
                                  )}
                                {row.error && (
                                  <p className="message error" role="alert">
                                    {row.error}
                                  </p>
                                )}
                                <p
                                  className="dd-feedback registry-note"
                                  role="status"
                                >
                                  {row.notice || ""}
                                </p>
                                {trip.status === "PLANNED" &&
                                  p.disposition === "REVIEW_REQUIRED" && (
                                    <button
                                      className="planning-secondary"
                                      disabled={busy}
                                      onClick={() => setMode("manage")}
                                    >
                                      Revisar participação de {p.student_name}
                                    </button>
                                  )}
                                <details className="dd-details">
                                  <summary>
                                    <ChevronDown size={15} /> Autores, horários
                                    e histórico
                                  </summary>
                                  <MovementsPanel
                                    trip={trip}
                                    passenger={p}
                                    role="DRIVER"
                                    busy={!!row.busy}
                                    onConfirm={() => {}}
                                    contextId={context.id}
                                    hideConfirm
                                  />
                                  <button
                                    className="planning-secondary"
                                    onClick={() => openTarget("history", p)}
                                  >
                                    Histórico e correções desta criança
                                  </button>
                                  {(p.alerts || [])
                                    .filter((a) => a.status !== "RESOLVED")
                                    .map((a) => (
                                      <button
                                        key={a.id}
                                        className="planning-secondary"
                                        onClick={() =>
                                          openTarget("alerts", p, a.id)
                                        }
                                      >
                                        {alertKinds[a.kind] ||
                                          "Atender ocorrência"}
                                      </button>
                                    ))}
                                </details>
                              </article>
                            );
                          })}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
