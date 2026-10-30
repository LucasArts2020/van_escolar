"use client";
import { schoolPlanningLabel } from "../../shared/school-day";
import { sidePresentation } from "../../shared/movement-presentation";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BusFront,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type {
  Movement,
  MovementConfirmationResult,
  MovementKind,
  Passenger,
  Trip,
} from "../../shared/trips";
import { tripStatusLabel } from "../../shared/trips";
import { alertKinds, alertLevels } from "../../shared/alerts";
import type { SchoolDay, SchoolDayRow } from "../../shared/school-day";
import { schoolPlanningLabels } from "../../shared/school-day";
import type { JourneyTarget } from "../../shared/navigation";

type Context = { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
type Props = {
  context: Context;
  active?: boolean;
  onNavigate?: (view: string) => void;
  onOpenTarget?: (target: JourneyTarget) => void;
};
type RowState = {
  busy?: boolean;
  uncertain?: boolean;
  error?: string;
  notice?: string;
};
class RequestFailure extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const validConfirmation = (c: Movement["confirmations"][number]) =>
  c.correctionStatus !== "APPROVED";
const movementFor = (p: Passenger, kind: MovementKind) =>
  p.movements.find((m) => m.kind === kind);
const schoolRecord = (m?: Movement) =>
  m?.confirmations.find(
    (c) => c.side === "COUNTERPART" && validConfirmation(c),
  );
const emptyDay = (date = ""): SchoolDay => ({
  date,
  today: "",
  tomorrow: "",
  serverNow: "",
  rows: [],
  trips: [],
  attention: { openCount: 0, criticalCount: 0, otherDatesCount: 0, items: [] },
});

function preserveRows(previous: SchoolDayRow[], incoming: SchoolDayRow[]) {
  const pending = new Map(incoming.map((row) => [row.id, row]));
  const ordered: SchoolDayRow[] = [];
  for (const row of previous) {
    const next = pending.get(row.id);
    if (next) {
      ordered.push(next);
      pending.delete(row.id);
    }
  }
  return [...ordered, ...pending.values()];
}

function preserveOrder(previous: Trip[], incoming: Trip[]) {
  const byId = new Map(incoming.map((trip) => [trip.id, trip]));
  const result: Trip[] = [];
  for (const previousTrip of previous) {
    const next = byId.get(previousTrip.id);
    if (!next) continue;
    byId.delete(next.id);
    if (next.version < previousTrip.version) {
      result.push(previousTrip);
      continue;
    }
    const passengers = new Map(next.passengers.map((p) => [p.id, p]));
    const ordered: Passenger[] = [];
    for (const previousPassenger of previousTrip.passengers) {
      const passenger = passengers.get(previousPassenger.id);
      if (passenger) {
        ordered.push(passenger);
        passengers.delete(passenger.id);
      }
    }
    result.push({ ...next, passengers: [...ordered, ...passengers.values()] });
  }
  return [...result, ...byId.values()];
}

export default function SchoolCentral(props: Props) {
  // Changing context unmounts the whole state, including in-flight actions.
  return <SchoolCentralContext key={props.context.id} {...props} />;
}

function SchoolCentralContext({
  context,
  active = true,
  onNavigate,
  onOpenTarget,
}: Props) {
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [direction, setDirection] = useState("OUTBOUND");
  const [query, setQuery] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [data, setData] = useState<SchoolDay>(emptyDay);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [revoked, setRevoked] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const alive = useRef(true);
  const generation = useRef(0);
  const requestSerial = useRef(0);
  const mutationRevision = useRef(0);
  const passengerVersions = useRef(new Map<string, number>());
  const inFlight = useRef(new Set<string>());
  const latestData = useRef(data);
  const refreshCurrent = useRef<() => Promise<void>>(async () => {});
  const blockedAccess = useRef(false);
  const activeRef = useRef(active);
  const initialData = useRef<SchoolDay | null>(null);
  activeRef.current = active;
  latestData.current = data;

  async function api<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      let response: Response;
      try {
        response = await fetch("/api/" + path, {
          method: body === undefined ? "GET" : "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Context-Id": context.id,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch {
        throw new RequestFailure("Sem comunicação com o servidor.");
      }
      let result;
      try {
        result = await response.json();
      } catch {
        throw new RequestFailure(
          "Não foi possível verificar a resposta do servidor.",
          response.status >= 400 ? response.status : 0,
        );
      }
      if (!response.ok)
        throw new RequestFailure(
          Array.isArray(result.message)
            ? result.message.join(", ")
            : result.message || "Não foi possível concluir.",
          response.status,
        );
      return result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  function loseAccess(message: string) {
    blockedAccess.current = true;
    requestSerial.current++;
    latestData.current = emptyDay();
    setData(latestData.current);
    setRows({});
    setQuery("");
    setVehicle("");
    setCheckedAt("");
    setLoading(false);
    setRefreshing(false);
    setRevoked(true);
    setError(message);
  }

  useEffect(() => {
    alive.current = true;
    setOffline(!navigator.onLine);
    let current = true;
    let ready = false;
    let pending = false;
    async function initialize() {
      if (
        !current ||
        ready ||
        pending ||
        blockedAccess.current ||
        !activeRef.current
      )
        return;
      pending = true;
      setLoading(true);
      setRefreshing(true);
      try {
        const snapshot = await api<SchoolDay>("school/day");
        if (!current) return;
        ready = true;
        initialData.current = snapshot;
        setToday(snapshot.today);
        setTomorrow(snapshot.tomorrow);
        setDate(snapshot.date);
        setOffline(false);
      } catch (e) {
        if (!current) return;
        const failure = e as RequestFailure;
        if (failure.status === 401 || failure.status === 403)
          loseAccess(failure.message);
        else {
          setError(
            failure.message + " Use Atualizar para consultar novamente.",
          );
          if (failure.status === 0) setOffline(true);
        }
        setLoading(false);
      } finally {
        pending = false;
        if (current) setRefreshing(false);
      }
    }
    refreshCurrent.current = initialize;
    const retryInitialization = () => {
      if (
        !ready &&
        activeRef.current &&
        navigator.onLine &&
        document.visibilityState === "visible"
      )
        void initialize();
    };
    window.addEventListener("online", retryInitialization);
    window.addEventListener("focus", retryInitialization);
    void initialize();
    return () => {
      current = false;
      alive.current = false;
      generation.current++;
      window.removeEventListener("online", retryInitialization);
      window.removeEventListener("focus", retryInitialization);
    };
  }, []);

  useEffect(() => {
    if (!date || blockedAccess.current) return;
    const currentGeneration = ++generation.current;
    const isCurrent = () =>
      alive.current &&
      generation.current === currentGeneration &&
      !blockedAccess.current;
    const seed =
      initialData.current?.date === date ? initialData.current : null;
    initialData.current = null;
    setLoading(!seed);
    setError("");
    setRows({});
    setVehicle("");
    setCheckedAt("");
    passengerVersions.current.clear();
    latestData.current = seed || emptyDay(date);
    setData(latestData.current);

    async function fetchOnce() {
      if (!isCurrent()) return;
      const serial = ++requestSerial.current;
      const beforeMutation = mutationRevision.current;
      setRefreshing(true);
      try {
        const list = await api<SchoolDay>("school/day?date=" + date);
        if (
          !isCurrent() ||
          serial !== requestSerial.current ||
          beforeMutation !== mutationRevision.current
        )
          return;
        const trips = preserveOrder(
          latestData.current.date === date ? latestData.current.trips : [],
          list.trips,
        );
        for (const trip of trips)
          for (const p of trip.passengers)
            passengerVersions.current.set(
              p.id,
              Math.max(passengerVersions.current.get(p.id) || 0, trip.version),
            );
        latestData.current = {
          ...list,
          rows: preserveRows(
            latestData.current.date === date ? latestData.current.rows : [],
            list.rows,
          ),
          trips,
        };
        setData(latestData.current);
        setToday(list.today);
        setTomorrow(list.tomorrow);
        setError("");
        setOffline(false);
        setCheckedAt(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
        setRows((previous) => {
          const next = { ...previous };
          for (const [key, state] of Object.entries(previous)) {
            if (!state.uncertain || state.busy) continue;
            const row = list.rows.find((r) => r.id === key);
            const passenger = trips
              .find((t) => t.id === row?.trip_id)
              ?.passengers.find((p) => p.id === row?.passenger_id);
            if (!passenger) {
              delete next[key];
              continue;
            }
            const registered = schoolRecord(
              movementFor(
                passenger,
                row?.direction === "OUTBOUND" ? "ALIGHTING" : "BOARDING",
              ),
            );
            next[key] = registered
              ? {
                  notice: `Registro da escola conferido no servidor: ${registered.actorName}.`,
                }
              : {
                  error:
                    "Servidor consultado. Não há confirmação vigente da escola; confira a situação antes de tentar novamente.",
                };
          }
          return next;
        });
      } catch (e) {
        if (!isCurrent() || serial !== requestSerial.current) return;
        const failure = e as RequestFailure;
        if (failure.status === 401 || failure.status === 403)
          loseAccess(failure.message);
        else {
          setError(
            failure.message +
              " Atualize a central para conferir a situação atual.",
          );
          if (failure.status === 0) setOffline(true);
        }
      } finally {
        if (isCurrent() && serial === requestSerial.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    let refreshFlight: Promise<void> | null = null;
    let refreshQueued = false;
    function refresh(): Promise<void> {
      if (!isCurrent()) return Promise.resolve();
      if (refreshFlight) {
        refreshQueued = true;
        return refreshFlight;
      }
      refreshFlight = (async () => {
        do {
          refreshQueued = false;
          await fetchOnce();
        } while (refreshQueued && isCurrent());
      })().finally(() => {
        refreshFlight = null;
      });
      return refreshFlight;
    }
    refreshCurrent.current = refresh;
    if (!seed && activeRef.current) void refresh();
    const refreshWhenVisible = () => {
      if (
        activeRef.current &&
        document.visibilityState === "visible" &&
        navigator.onLine
      )
        void refresh();
    };
    const networkRestored = () => {
      setOffline(false);
      refreshWhenVisible();
    };
    const networkLost = () => setOffline(true);
    const interval = window.setInterval(refreshWhenVisible, 15000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", networkRestored);
    window.addEventListener("offline", networkLost);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      generation.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", networkRestored);
      window.removeEventListener("offline", networkLost);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [date]);

  useEffect(() => {
    if (active && navigator.onLine && document.visibilityState === "visible")
      void refreshCurrent.current();
  }, [active]);

  async function confirm(row: SchoolDayRow, kind: MovementKind) {
    const key = row.id;
    const { trip_id: tripId, passenger_id: passengerId } = row;
    if (!tripId || !passengerId) return;
    const currentGeneration = generation.current;
    const trip = latestData.current.trips.find((t) => t.id === tripId);
    const passenger = trip?.passengers.find((p) => p.id === passengerId);
    if (
      !passenger ||
      !movementFor(passenger, kind)?.canConfirm ||
      inFlight.current.has(key) ||
      rows[key]?.uncertain ||
      blockedAccess.current
    )
      return;
    inFlight.current.add(key);
    mutationRevision.current++;
    setRows((previous) => ({ ...previous, [key]: { busy: true } }));
    const isCurrent = () =>
      alive.current &&
      generation.current === currentGeneration &&
      !blockedAccess.current;
    try {
      const result = await api<MovementConfirmationResult>(
        `trips/${tripId}/passengers/${passengerId}/movements/${kind}/confirm`,
        {},
      );
      if (!isCurrent()) return;
      mutationRevision.current++;
      const current = latestData.current;
      const canUpdate =
        result.tripVersion >= (passengerVersions.current.get(passengerId) || 0);
      if (canUpdate)
        passengerVersions.current.set(passengerId, result.tripVersion);
      const trips = current.trips.map((t) =>
        t.id !== tripId
          ? t
          : {
              ...t,
              version: Math.max(t.version, result.tripVersion),
              passengers: t.passengers.map((p) =>
                p.id === passengerId && canUpdate ? result.passenger : p,
              ),
            },
      );
      latestData.current = { ...current, trips };
      setData(latestData.current);
      setRows((previous) => ({
        ...previous,
        [key]: {
          notice: result.unchanged
            ? "Registro já recebido pelo servidor."
            : "Confirmação recebida pelo servidor.",
        },
      }));
    } catch (e) {
      if (!isCurrent()) return;
      mutationRevision.current++;
      const failure = e as RequestFailure;
      if (failure.status === 401 || failure.status === 403)
        loseAccess(failure.message);
      else {
        const uncertain = failure.status === 0 || failure.status >= 500;
        setRows((previous) => ({
          ...previous,
          [key]: {
            uncertain,
            error: uncertain
              ? "Recebimento ainda não verificado. Consultando o servidor antes de permitir outra tentativa…"
              : failure.message,
          },
        }));
        if (uncertain || failure.status === 409 || failure.status === 404)
          await refreshCurrent.current();
      }
    } finally {
      inFlight.current.delete(key);
      if (isCurrent())
        setRows((previous) => ({
          ...previous,
          [key]: { ...previous[key], busy: false },
        }));
    }
  }

  const trips = data.date === date ? data.trips : [];
  const dayRows = data.date === date ? data.rows : [];
  const matchingDirection = dayRows.filter((r) => r.direction === direction);
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const passengerById = new Map(
    trips.flatMap((trip) => trip.passengers.map((p) => [p.id, p] as const)),
  );
  const transports = [
    ...new Map(
      matchingDirection.map((r) => [
        r.transport_id,
        { id: r.transport_id, name: r.transport_name },
      ]),
    ).values(),
  ];
  const vehicles = [
    ...new Map(
      trips
        .filter((t) => t.direction === direction)
        .map((t) => [
          t.vehicle_id,
          { id: t.vehicle_id, name: t.vehicle_name, plate: t.vehicle_plate },
        ]),
    ).values(),
  ];
  const search = query.trim().toLocaleLowerCase("pt-BR");
  const filteredRows = matchingDirection.filter((r) => {
    const trip = r.trip_id ? tripById.get(r.trip_id) : undefined;
    return (
      (!vehicle ||
        vehicle === `transport:${r.transport_id}` ||
        vehicle === `vehicle:${trip?.vehicle_id}`) &&
      `${r.student_name} ${r.student_id}`
        .toLocaleLowerCase("pt-BR")
        .includes(search)
    );
  });
  // Actual participation remains in the operational list even when a later plan says no use.
  const operational = filteredRows.filter(
    (r) =>
      r.passenger_id ||
      !["NOT_USING", "NOT_EXPECTED"].includes(r.planning.status),
  );
  const notUsing = filteredRows.filter(
    (r) => !r.passenger_id && r.planning.status === "NOT_USING",
  );
  const notExpected = filteredRows.filter(
    (r) => !r.passenger_id && r.planning.status === "NOT_EXPECTED",
  );
  const kind: MovementKind =
    direction === "OUTBOUND" ? "ALIGHTING" : "BOARDING";
  const passengers = operational.flatMap((r) =>
    r.passenger_id && passengerById.get(r.passenger_id)
      ? [passengerById.get(r.passenger_id)!]
      : [],
  );
  const pendingSchool = passengers.filter(
    (p) => movementFor(p, kind)?.canConfirm,
  ).length;
  const waitingDriver = passengers.filter((p) => {
    const m = movementFor(p, kind);
    return (
      schoolRecord(m) &&
      !m?.confirmations.some((c) => c.side === "DRIVER" && validConfirmation(c))
    );
  }).length;
  const occurrences = passengers.filter(
    (p) =>
      p.alerts?.some((a) => a.status !== "RESOLVED") ||
      p.issues.some((i) => i.status !== "RESOLVED"),
  ).length;
  const anyBusy = Object.values(rows).some((state) => state.busy);

  function renderRows(selectedRows: SchoolDayRow[]) {
    const groups = new Map<string, SchoolDayRow[]>();
    for (const row of selectedRows) {
      const groupId = row.trip_id
        ? `trip:${row.trip_id}`
        : `transport:${row.transport_id}`;
      groups.set(groupId, [...(groups.get(groupId) || []), row]);
    }
    const nodes: ReactNode[] = [];
    for (const [groupId, groupRows] of groups) {
      const first = groupRows[0];
      const trip = first.trip_id ? tripById.get(first.trip_id) : undefined;
      nodes.push(
        <header
          className="sc-trip-header"
          key={`header:${groupId}`}
          data-trip-id={trip?.id}
          data-vehicle-id={trip?.vehicle_id}
        >
          <span className="sc-van-icon">
            <BusFront size={22} />
          </span>
          <div>
            <h3>
              {trip ? trip.vehicle_name : first.transport_name}{" "}
              <span>{trip ? trip.vehicle_plate : "van a definir"}</span>
            </h3>
            <p>
              {trip ? (
                <>
                  Motorista: <strong>{trip.driver_name}</strong>
                  <span className="sc-trip-reference">
                    {" "}
                    · {first.transport_name} · Viagem {trip.id.slice(-8)}
                  </span>
                </>
              ) : (
                "Aguardando a preparação pelo transporte. Nenhuma van foi atribuída."
              )}
            </p>
          </div>
          <span className="sc-trip-status">
            {trip
              ? tripStatusLabel(trip.status, trip.closure?.exceptional > 0)
              : "Sem viagem preparada"}
          </span>
        </header>,
      );
      for (const row of groupRows) {
        const passenger = row.passenger_id
          ? passengerById.get(row.passenger_id)
          : undefined;
        nodes.push(
          <SchoolRow
            key={row.id}
            row={row}
            trip={trip}
            passenger={passenger}
            kind={kind}
            date={date}
            contextId={context.id}
            state={rows[row.id] || {}}
            offline={offline}
            onConfirm={() => void confirm(row, kind)}
            onNavigate={onNavigate}
            onOpenTarget={onOpenTarget}
          />,
        );
      }
    }
    // Rows and headers share a parent, so assigning a trip never reparents a child.
    return nodes;
  }

  if (context.role !== "SCHOOL")
    return (
      <p className="message error" role="alert">
        A central é exclusiva do contexto escolar.
      </p>
    );

  return (
    <div className="school-central">
      <section className="sc-intro">
        <div>
          <p>Confirme o que presenciou. O motorista registra a parte dele.</p>
        </div>
        <span className="sc-live">
          <span /> Atualização a cada 15 s
        </span>
      </section>

      <section
        className="sc-controls panel"
        aria-label="Filtros da central escolar"
      >
        <div
          className="sc-tabs"
          role="tablist"
          aria-label="Movimento na escola"
        >
          {[
            ["OUTBOUND", "Receber na escola"],
            ["RETURN", "Entregar ao transporte"],
          ].map(([value, label]) => (
            <button
              key={value}
              id={`sc-tab-${value}`}
              role="tab"
              tabIndex={direction === value ? 0 : -1}
              aria-selected={direction === value}
              aria-controls="sc-list"
              onClick={() => {
                setDirection(value);
                setVehicle("");
              }}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "OUTBOUND"
                    : event.key === "End"
                      ? "RETURN"
                      : value === "OUTBOUND"
                        ? "RETURN"
                        : "OUTBOUND";
                setDirection(next);
                setVehicle("");
                document.getElementById(`sc-tab-${next}`)?.focus();
              }}
            >
              {value === "OUTBOUND" ? (
                <ArrowDownToLine size={18} />
              ) : (
                <ArrowUpFromLine size={18} />
              )}
              <span>{label}</span>
              <small>
                {value === "OUTBOUND" ? "Chegada · ida" : "Saída · volta"}
              </small>
            </button>
          ))}
        </div>
        <div className="sc-date-shortcuts" aria-label="Atalhos de data">
          <button
            aria-pressed={date === today}
            disabled={!today || anyBusy || revoked}
            onClick={() => setDate(today)}
          >
            Hoje
          </button>
          <button
            aria-pressed={date === tomorrow}
            disabled={!tomorrow || anyBusy || revoked}
            onClick={() => setDate(tomorrow)}
          >
            Amanhã
          </button>
        </div>
        <div className="sc-filters">
          <label>
            Data
            <input
              type="date"
              value={date}
              disabled={anyBusy || revoked}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
          <label className="sc-search">
            Buscar criança
            <span>
              <Search size={17} />
              <input
                type="search"
                placeholder="Nome ou identificação"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
          </label>
          <label>
            Transporte ou van
            <select
              aria-label="Transporte ou van"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            >
              <option value="">Todos os transportes e vans</option>
              <optgroup label="Transportes">
                {transports.map((t) => (
                  <option key={t.id} value={`transport:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              {vehicles.length > 0 && (
                <optgroup label="Vans preparadas">
                  {vehicles.map((v) => (
                    <option key={v.id} value={`vehicle:${v.id}`}>
                      {v.name} · {v.plate}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button
            className="sc-refresh"
            disabled={refreshing || revoked}
            onClick={() => void refreshCurrent.current()}
            aria-label="Atualizar central"
          >
            <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>
        <div className="sc-updated">
          <span>
            {date && date !== today
              ? "Consultando outra data"
              : "Hoje na escola"}
            {checkedAt ? ` · Consultado às ${checkedAt}` : ""}
          </span>
          <span>
            Planejamento e viagens autorizadas · uso não confirmado permanece
            visível
          </span>
        </div>
      </section>

      {!!data.pendingAcknowledgements && onOpenTarget && (
        <button
          className="planning-secondary"
          onClick={() =>
            onOpenTarget({
              view: "alerts",
              contextId: context.id,
              date,
              awaitingAcknowledgement: true,
            })
          }
        >
          Ciências de urgências pendentes: {data.pendingAcknowledgements}
        </button>
      )}
      {offline && (
        <p className="sc-offline" role="status">
          <WifiOff size={17} /> Sem comunicação verificada. As ações aguardam
          conexão; nenhum registro será guardado para envio depois.
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="sc-loading" role="status">
          <LoaderCircle size={20} className="spin" /> Consultando o dia da
          escola…
        </p>
      )}
      {!loading && !revoked && (
        <>
          {!!data.attention?.openCount && (
            <section
              className={
                "sc-all-attention" +
                (data.attention?.criticalCount ? " sc-attention" : "")
              }
              aria-label="Pendências de todas as datas"
            >
              <button
                className="text-button"
                onClick={() => onNavigate?.("alerts")}
              >
                <CircleAlert size={17} /> {data.attention?.openCount || 0}{" "}
                ocorrências abertas · {data.attention?.criticalCount || 0}{" "}
                críticas · {data.attention?.otherDatesCount || 0} de outras
                datas
              </button>
              {!!data.attention?.items.length && (
                <details>
                  <summary>Ver crianças com pendências</summary>
                  {data.attention.items.map((item) => (
                    <button
                      className="text-button"
                      key={item.id}
                      onClick={() =>
                        onOpenTarget?.({
                          view: "alerts",
                          contextId: context.id,
                          date: item.date,
                          studentId: item.studentId,
                          tripId: item.tripId,
                          passengerId: item.passengerId,
                          alertId: item.id,
                        })
                      }
                    >
                      {alertLevels[item.level]} · {item.studentName} ·{" "}
                      {item.date.split("-").reverse().join("/")} ·{" "}
                      {alertKinds[item.kind] || "Ocorrência"}
                    </button>
                  ))}
                </details>
              )}
            </section>
          )}
          <section className="sc-summary" aria-label="Resumo da seleção">
            <span>
              <strong>{pendingSchool}</strong> para a escola confirmar
            </span>
            <span>
              <strong>{waitingDriver}</strong> aguardando motorista
            </span>
            <span className={occurrences ? "sc-attention" : ""}>
              <strong>{occurrences}</strong> com ocorrência aberta
            </span>
          </section>
          <div
            id="sc-list"
            role="tabpanel"
            aria-labelledby={`sc-tab-${direction}`}
            className="sc-groups sc-day-list"
          >
            {operational.length === 0 ? (
              <div className="panel sc-empty">
                <BusFront size={30} />
                <h3>
                  {search || vehicle
                    ? "Nenhuma criança neste filtro"
                    : "Nenhuma criança prevista nesta etapa"}
                </h3>
                <p>
                  {search || vehicle
                    ? "Ajuste o nome ou o transporte para consultar a lista."
                    : "Confira também os grupos de não uso abaixo. A falta de resposta da família não é tratada como ausência."}
                </p>
              </div>
            ) : (
              renderRows(operational)
            )}
          </div>
          {[
            {
              title: "Não utilizarão",
              records: notUsing,
              explanation: "A família informou que não utilizará este trecho.",
            },
            {
              title: "Sem uso previsto",
              records: notExpected,
              explanation:
                "A rotina ou o planejamento não prevê uso neste trecho. Falta de resposta aparece na lista principal.",
            },
          ].map((section) => (
            <details className="sc-non-use panel" key={section.title}>
              <summary>
                <ChevronDown size={16} /> <strong>{section.title}</strong>
                <span>{section.records.length}</span>
              </summary>
              <p>{section.explanation}</p>
              {section.records.length ? (
                <div className="sc-day-list">{renderRows(section.records)}</div>
              ) : (
                <p>Nenhuma criança neste grupo e filtro.</p>
              )}
            </details>
          ))}
        </>
      )}
      <p className="sc-footer">
        <ShieldCheck size={16} /> A escola confirma o recebimento na ida e a
        entrega ao motorista na volta. A conferência da van é feita pelo
        motorista.
      </p>
    </div>
  );
}

function SchoolRow({
  row,
  trip,
  passenger: p,
  kind,
  date,
  contextId,
  state,
  offline,
  onConfirm,
  onNavigate,
  onOpenTarget,
}: {
  row: SchoolDayRow;
  trip?: Trip;
  passenger?: Passenger;
  kind: MovementKind;
  date: string;
  contextId: string;
  state: RowState;
  offline: boolean;
  onConfirm: () => void;
  onNavigate?: (view: string) => void;
  onOpenTarget?: (target: JourneyTarget) => void;
}) {
  const movement = p ? movementFor(p, kind) : undefined;
  const school = schoolRecord(movement);
  const driver = movement?.confirmations.find(
    (c) => c.side === "DRIVER" && validConfirmation(c),
  );
  const schoolReview = school?.correctionStatus === "PENDING";
  const driverReview = driver?.correctionStatus === "PENDING";
  const invalidSchool = movement?.confirmations.find(
    (c) => c.side === "COUNTERPART" && !validConfirmation(c),
  );
  const invalidDriver = movement?.confirmations.find(
    (c) => c.side === "DRIVER" && !validConfirmation(c),
  );
  const openAlerts = p?.alerts?.filter((a) => a.status !== "RESOLVED") || [];
  const openIssues = p?.issues.filter((i) => i.status !== "RESOLVED") || [];
  const action =
    kind === "ALIGHTING" ? "Recebi na escola" : "Entreguei ao motorista";
  const unavailableLabel = !p
    ? row.planning.status === "NOT_USING"
      ? "Não utilizará este trecho"
      : row.planning.status === "NOT_EXPECTED"
        ? "Sem uso previsto"
        : row.planning.status === "NO_HISTORICAL_PLAN"
          ? "Sem participação registrada"
          : "Aguardando viagem preparada"
    : p.exceptionalResolution
      ? "Contabilização excepcional"
      : school
        ? schoolReview
          ? "Registro da escola sob correção"
          : "Escola já confirmou"
        : p.disposition === "NOT_TRANSPORTED"
          ? "Não transportada"
          : trip?.status === "PLANNED"
            ? "Aguardando início da viagem"
            : "Confirmação indisponível";
  const actionable =
    !!movement?.canConfirm && !state.busy && !state.uncertain && !offline;
  const descriptionId = `sc-description-${row.id.replace(/:/g, "-")}`;
  const target = (
    view: JourneyTarget["view"],
    alertId?: string,
  ): JourneyTarget => ({
    view,
    contextId,
    date,
    studentId: row.student_id,
    operatingLinkId: row.operating_link_id,
    ...(trip ? { tripId: trip.id } : {}),
    ...(p ? { passengerId: p.id } : {}),
    ...(alertId ? { alertId } : {}),
  });
  return (
    <article
      className="sc-child"
      data-row-id={row.id}
      data-passenger-id={p?.id}
      data-planning-status={row.planning.status}
      aria-label={`${row.student_name}, identificação ${row.student_id.slice(-8)}`}
    >
      <div className="sc-child-main">
        <div className="sc-identity">
          <span className="sc-avatar" aria-hidden="true">
            {row.student_name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0])
              .join("")}
          </span>
          <div>
            <h4>{row.student_name}</h4>
            <span>Identificação {row.student_id.slice(-8)}</span>
            <span
              className={`sc-planning-badge sc-plan-${row.planning.status.toLowerCase()}`}
            >
              {schoolPlanningLabel(row.planning)}
            </span>
          </div>
        </div>
        <div className="sc-confirmations" id={descriptionId}>
          {!p ? (
            <span className="sc-forecast-note">
              <Clock3 size={15} />
              <span>
                {row.planning.source === "ROUTINE"
                  ? "Estimativa da rotina; ainda sem planejamento registrado."
                  : row.planning.status === "NO_HISTORICAL_PLAN"
                    ? "Nenhuma estimativa é feita para datas passadas."
                    : "A escola acompanha o uso. O transporte prepara a viagem."}
              </span>
            </span>
          ) : (
            <>
              <span
                className={`sc-side ${schoolReview || invalidSchool ? "sc-corrected" : school ? "sc-confirmed" : ""}`}
              >
                {schoolReview ? (
                  <CircleAlert size={14} />
                ) : school ? (
                  <Check size={14} />
                ) : (
                  <Clock3 size={14} />
                )}
                <span>{sidePresentation(movement, "COUNTERPART")}</span>
              </span>
              <span
                className={`sc-side ${driverReview || invalidDriver ? "sc-corrected" : driver ? "sc-confirmed" : ""}`}
              >
                {driverReview ? (
                  <CircleAlert size={14} />
                ) : driver ? (
                  <Check size={14} />
                ) : (
                  <Clock3 size={14} />
                )}
                <span>{sidePresentation(movement, "DRIVER")}</span>
              </span>
              {school && driver && (
                <span
                  className={`sc-two-confirmations ${schoolReview || driverReview ? "sc-corrected" : ""}`}
                >
                  {schoolReview || driverReview
                    ? "Dois registros; confirmação sob correção"
                    : "Duas confirmações vigentes"}
                </span>
              )}
            </>
          )}
        </div>
        <div className="sc-action">
          <button
            className={`button sc-confirm-button ${!movement?.canConfirm ? "sc-unavailable" : ""}`}
            aria-disabled={!actionable}
            aria-busy={!!state.busy}
            onClick={() => {
              if (actionable) onConfirm();
            }}
            aria-label={`${movement?.canConfirm ? action : unavailableLabel}: ${row.student_name}, identificação ${row.student_id.slice(-8)}`}
            aria-describedby={descriptionId}
          >
            {state.busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : schoolReview ? (
              <CircleAlert size={17} />
            ) : school || movement?.canConfirm ? (
              <Check size={17} />
            ) : (
              <Clock3 size={17} />
            )}
            {state.busy
              ? "Registrando…"
              : state.uncertain
                ? "Verificando recebimento…"
                : movement?.canConfirm
                  ? action
                  : unavailableLabel}
          </button>
          {!movement?.canConfirm && !school && movement?.blockedReason && (
            <p className="sc-blocked">{movement.blockedReason}</p>
          )}
        </div>
      </div>
      {row.planning.pendingChange && (
        <p className="sc-planning-pending">
          <Clock3 size={15} />
          <span>
            Alteração solicitada para{" "}
            <strong>
              {row.planning.pendingChange.requestedUsage
                ? "utilizar"
                : "não utilizar"}
            </strong>
            ; aguardando decisão do transporte. A situação vigente acima foi
            mantida.
          </span>
        </p>
      )}
      {row.planning.status === "MISSING_CONFIGURATION" && (
        <p className="sc-planning-warning">
          {row.planning.missingConfiguration.includes("POLICY")
            ? "O transporte precisa definir as regras de planejamento."
            : ""}{" "}
          {row.planning.missingConfiguration.includes("ROUTINE")
            ? "A família precisa definir a rotina semanal."
            : ""}{" "}
          A falta de configuração não significa ausência.
        </p>
      )}
      {(openAlerts.length > 0 || openIssues.length > 0) && (
        <div className="sc-occurrences">
          <CircleAlert size={15} />
          <strong>Ocorrência aberta</strong>
          <span>
            {openAlerts.length ? (
              openAlerts.map((a) => (
                <a
                  key={a.id}
                  href={`?alert=${a.id}&context=${contextId}`}
                  onClick={
                    onOpenTarget
                      ? (event) => {
                          if (
                            event.button === 0 &&
                            !event.ctrlKey &&
                            !event.metaKey &&
                            !event.shiftKey &&
                            !event.altKey
                          ) {
                            event.preventDefault();
                            onOpenTarget(target("alerts", a.id));
                          }
                        }
                      : undefined
                  }
                >
                  {alertLevels[a.level]} · {alertKinds[a.kind] || a.kind}
                </a>
              ))
            ) : (
              <>
                <span>
                  Sequência de embarque incompleta; precisa de verificação.
                </span>
                {onOpenTarget && (
                  <button
                    className="sc-occurrence-link"
                    onClick={() => onOpenTarget(target("history"))}
                  >
                    Ver ocorrência e histórico
                  </button>
                )}
              </>
            )}
          </span>
        </div>
      )}
      {p?.exceptionalResolution && (
        <p className="sc-exception">
          Contabilizada excepcionalmente por {p.exceptionalResolution.actorName}
          . Não equivale às duas confirmações normais.
        </p>
      )}
      {state.error && (
        <p className="sc-row-error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="sc-row-notice" role="status">
          {state.notice}
        </p>
      )}
      <details className="sc-details">
        <summary>
          <ChevronDown size={14} /> Autores, horários e histórico
        </summary>
        <div>
          {row.planning.missingConfiguration.length > 0 && (
            <p>
              <strong>Configuração para próximos planejamentos</strong>
              <span>
                {row.planning.missingConfiguration.includes("POLICY")
                  ? "O transporte ainda precisa definir as regras de planejamento. "
                  : ""}
                {row.planning.missingConfiguration.includes("ROUTINE")
                  ? "A família ainda precisa definir a rotina semanal."
                  : ""}
              </span>
              <span>
                A configuração de dias futuros não altera respostas já
                registradas.
              </span>
            </p>
          )}
          {row.planning.source !== "UNAVAILABLE" && (
            <p>
              <strong>
                {row.planning.source === "PERSISTED"
                  ? "Planejamento registrado"
                  : "Estimativa da rotina"}
              </strong>
              <span>{schoolPlanningLabel(row.planning)}</span>
              {row.planning.deadlineAt && (
                <span>
                  Limite para resposta:{" "}
                  {new Date(row.planning.deadlineAt).toLocaleString("pt-BR", {
                    timeZone: trip?.timezone || "America/Sao_Paulo",
                  })}
                </span>
              )}
            </p>
          )}
          {row.planning.pendingChange && (
            <p>
              <strong>Solicitação pendente</strong>
              <span>{row.planning.pendingChange.reason}</span>
              <span>
                A escola apenas acompanha; o transporte decide a mudança tardia.
              </span>
            </p>
          )}
          {movement?.confirmations.length ? (
            movement.confirmations.map((c) => (
              <p
                key={c.id}
                className={
                  c.correctionStatus === "APPROVED" ||
                  c.correctionStatus === "PENDING"
                    ? "sc-corrected"
                    : ""
                }
              >
                <strong>
                  {c.side === "DRIVER" ? "Motorista" : "Escola"}: {c.actorName}
                </strong>
                <span>
                  {new Date(c.receivedAt).toLocaleString("pt-BR", {
                    timeZone: trip?.timezone || "America/Sao_Paulo",
                  })}{" "}
                  · {c.organizationName}
                </span>
                {c.correctionStatus && (
                  <span>
                    {c.correctionStatus === "APPROVED"
                      ? "Correção aprovada; original preservado, sem validade para confirmar esta etapa."
                      : "Confirmação com solicitação de correção; consulte o histórico."}
                  </span>
                )}
              </p>
            ))
          ) : (
            <p>
              {p
                ? "Nenhuma confirmação nesta etapa."
                : "A previsão não representa embarque, desembarque ou confirmação presencial."}
            </p>
          )}
          {p && (onOpenTarget || onNavigate) && (
            <button
              className="sc-history-link"
              onClick={() =>
                onOpenTarget
                  ? onOpenTarget(target("history"))
                  : onNavigate?.("history")
              }
            >
              Abrir histórico e correções
            </button>
          )}
        </div>
      </details>
    </article>
  );
}
