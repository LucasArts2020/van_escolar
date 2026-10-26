"use client";
import MovementsPanel from "./movements-panel";
import TripClosure from "./trip-closure";
import { createPlanningMaterializer } from "../../shared/materialize-planning";
import { useEffect, useRef, useState } from "react";
import {
  BusFront,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Users,
  Play,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import {
  Trip,
  TripOptions,
  tripStatusLabel,
  dispositionLabels,
  planningLabels,
  tripCounts,
} from "../../shared/trips";
type Context = { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
const empty: TripOptions = { plans: [], drivers: [], vehicles: [] };
export default function TripsPanel({ context }: { context: Context }) {
  const materializePlanning = useRef(createPlanningMaterializer()).current;
  const driver = context.role === "DRIVER";
  const [date, setDate] = useState(""),
    [today, setToday] = useState(""),
    [direction, setDirection] = useState("OUTBOUND");
  const [trips, setTrips] = useState<Trip[]>([]),
    [options, setOptions] = useState<TripOptions>(empty),
    [selected, setSelected] = useState("");
  const [planningOptions, setPlanningOptions] = useState<{
    links: { id: string; today: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preparing, setPreparing] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [vehicleId, setVehicleId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [school, setSchool] = useState("");
  const [creationId, setCreationId] = useState(""),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [extra, setExtra] = useState(""),
    [newDriver, setNewDriver] = useState(""),
    [newVehicle, setNewVehicle] = useState("");
  async function api<T>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ): Promise<T> {
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
      throw new Error(data.message || "Não foi possível concluir.");
    return data;
  }
  async function refresh() {
    if (driver && planningOptions)
      await materializePlanning(date, planningOptions, (body) =>
        api("planning/generate", body),
      );
    const [list, opts] = await Promise.all([
      api<{ trips: Trip[] }>("trips?date=" + date),
      api<TripOptions>(`trips/options?date=${date}&direction=${direction}`),
    ]);
    setTrips(list.trips);
    setOptions(opts);
    setDriverId((old) =>
      opts.drivers.some((d) => d.id === old)
        ? old
        : opts.drivers.find((d) => d.id === context.id)?.id ||
          opts.drivers[0]?.id ||
          "",
    );
    setVehicleId((old) =>
      opts.vehicles.some((v) => v.id === old)
        ? old
        : opts.vehicles[0]?.id || "",
    );
  }
  useEffect(() => {
    let alive = true;
    api<{ defaultToday: string; links: { id: string; today: string }[] }>(
      "planning/options",
    )
      .then((data) => {
        if (alive) {
          setPlanningOptions(data);
          const value = data.links[0]?.today || data.defaultToday;
          setToday(value);
          setDate(value);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!date || !planningOptions) return;
    let alive = true;
    setLoading(true);
    setIds([]);
    setError("");
    setNotice("");
    (async () => {
      if (driver)
        await materializePlanning(date, planningOptions, (body) =>
          api("planning/generate", body),
        );
      if (!alive) return null;
      return Promise.all([
        api<{ trips: Trip[] }>("trips?date=" + date),
        api<TripOptions>(`trips/options?date=${date}&direction=${direction}`),
      ]);
    })()
      .then((result) => {
        if (!alive || !result) return;
        const [list, opts] = result;
        setTrips(list.trips);
        setOptions(opts);
        setDriverId(
          opts.drivers.find((d) => d.id === context.id)?.id ||
            opts.drivers[0]?.id ||
            "",
        );
        setVehicleId(opts.vehicles[0]?.id || "");
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date, direction, planningOptions]);
  const trip = trips.find((t) => t.id === selected);
  useEffect(() => {
    setNewDriver(trip?.driver_membership_id || "");
    setNewVehicle(trip?.vehicle_id || "");
  }, [selected, trip?.driver_membership_id, trip?.vehicle_id]);
  useEffect(() => {
    setExtra("");
    setReasons({});
  }, [selected]);
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
  function mutate(
    path: string,
    body: Record<string, unknown>,
    message: string,
    method = "POST",
  ) {
    if (trip)
      void run(async () => {
        await api(
          "trips/" + trip.id + "/" + path,
          { expectedVersion: trip.version, ...body },
          method,
        );
      }, message);
  }
  function reason(key: string) {
    return reasons[key] || "";
  }
  function note(key: string, value: string) {
    setReasons((old) => ({ ...old, [key]: value }));
  }
  const filtered = trips.filter((t) => t.direction === direction);
  const needsInitialException = options.plans.some(
    (p) => ids.includes(p.id) && p.status === "NOT_EXPECTED",
  );
  const candidates = options.plans.filter(
    (p) => !school || p.school_id === school,
  );
  const unassigned = options.plans.filter(
    (p) =>
      !p.trip_id &&
      (p.scheduled || p.status === "CONFIRMED" || p.status === "NOT_USING"),
  );
  const mutable =
    trip &&
    ["PLANNED", "IN_PROGRESS"].includes(trip.status) &&
    trip.service_date >= trip.today;
  const extraPlans = options.plans.filter(
    (p) => !p.trip_id && !p.locked_at && !p.pending_change,
  );
  return (
    <div className="trips-root">
      <div className="trips-toolbar panel">
        <label>
          Data das viagens
          <input
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setSelected("");
                setPreparing(false);
              }
            }}
          />
        </label>
        <div
          className="registry-tabs"
          role="tablist"
          aria-label="Trecho da viagem"
        >
          {[
            ["OUTBOUND", "Ida"],
            ["RETURN", "Volta"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={direction === id}
              disabled={busy}
              onClick={() => {
                setDirection(id);
                setSelected("");
                setPreparing(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          disabled={busy || !date}
          onClick={() => run(async () => {}, "Viagens atualizadas.")}
        >
          <RefreshCw size={15} />
          Atualizar viagens
        </button>
        {driver && (
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => {
              setPreparing(!preparing);
              setSelected("");
              setCreationId(crypto.randomUUID());
              setIds([]);
              setReasons({});
            }}
          >
            <Plus size={16} />
            Preparar viagem
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
      {loading ? (
        <p className="registry-note">Carregando viagens…</p>
      ) : (
        <>
          {!trip && (
            <div className="trips-day-summary">
              <span>
                <strong>{filtered.length}</strong> viagens de{" "}
                {direction === "OUTBOUND" ? "ida" : "volta"}
              </span>
              <span>
                <strong>{unassigned.length}</strong> trechos sem viagem
              </span>
              <small>
                {driver
                  ? "Defina a destinação de cada previsão."
                  : "Dados limitados aos alunos autorizados neste contexto."}
              </small>
            </div>
          )}
          {preparing && driver && (
            <section
              className="panel trips-preparation"
              aria-label="Preparação da viagem"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow green">PREPARAÇÃO</span>
                  <h2>Uma lista para cada trecho.</h2>
                </div>
                <BusFront size={27} />
              </div>
              <div className="trips-form-grid">
                <label>
                  Motorista da viagem
                  <select
                    aria-label="Motorista da viagem"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                  >
                    {options.drivers.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Veículo da viagem
                  <select
                    aria-label="Veículo da viagem"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                  >
                    {options.vehicles.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name} · {v.plate} · {v.capacity} lugares
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Filtrar escola
                  <select
                    aria-label="Filtrar escola"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                  >
                    <option value="">Todas as escolas</option>
                    {Array.from(
                      new Map(
                        options.plans.map((p) => [p.school_id, p.school_name]),
                      ),
                    ).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="registry-note">
                Selecione os passageiros. Sem resposta da família, o trecho fica
                em revisão. O não uso expresso entra como não transportada. Sem
                previsão, registre o motivo da inclusão excepcional abaixo.
              </p>
              {!options.plans.length && (
                <div className="registry-empty">
                  <p>Não há previsões nesta data e trecho.</p>
                  <p>
                    Confira os vínculos ativos e a configuração do transporte.
                    As previsões são preparadas automaticamente para datas
                    permitidas.
                  </p>
                </div>
              )}
              <div className="trips-plan-list">
                {candidates.map((p) => (
                  <label key={p.id} className="trips-plan-choice">
                    <input
                      type="checkbox"
                      aria-label={`Incluir ${p.student_name} · ${p.school_name} · ${p.student_id.slice(-8)}`}
                      checked={ids.includes(p.id)}
                      disabled={
                        busy ||
                        Boolean(p.trip_id) ||
                        Boolean(p.locked_at) ||
                        p.pending_change
                      }
                      onChange={(e) =>
                        setIds((old) =>
                          e.target.checked
                            ? [...old, p.id]
                            : old.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>
                      <strong>{p.student_name}</strong>
                      <small>
                        {p.school_name} · Cadastro {p.student_id.slice(-8)}
                      </small>
                    </span>
                    <span className="trips-plan-status">
                      {p.trip_id
                        ? "Já tem viagem"
                        : p.pending_change
                          ? "Alteração em análise"
                          : p.locked_at
                            ? "Bloqueado"
                            : planningLabels[p.status]}
                    </span>
                  </label>
                ))}
              </div>
              {needsInitialException && (
                <label>
                  Motivo das inclusões sem previsão
                  <textarea
                    aria-label="Motivo das inclusões sem previsão"
                    value={reason("initial")}
                    onChange={(e) => note("initial", e.target.value)}
                    maxLength={1000}
                    placeholder="Identifique os alunos e registre a autorização do transporte."
                  />
                </label>
              )}
              <div className="trips-form-actions">
                <span className="registry-note">
                  {ids.length} trecho(s) selecionado(s), incluindo não uso
                  expresso.
                </span>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !ids.length ||
                    !driverId ||
                    !vehicleId ||
                    (needsInitialException &&
                      reason("initial").trim().length < 10)
                  }
                  onClick={() =>
                    run(async () => {
                      const result = await api<{ id: string }>("trips", {
                        id: creationId,
                        date,
                        direction,
                        driverId,
                        vehicleId,
                        planIds: ids,
                        ...(needsInitialException
                          ? { exceptionReason: reason("initial") }
                          : {}),
                      });
                      setSelected(result.id);
                      setPreparing(false);
                      setIds([]);
                    }, "Viagem preparada. Revise os passageiros antes de iniciar.")
                  }
                >
                  Salvar viagem planejada
                </button>
              </div>
            </section>
          )}
          {trip ? (
            <section
              className="panel trip-detail"
              aria-label="Detalhes da viagem"
            >
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setSelected("")}
              >
                ← Voltar às viagens
              </button>
              <div className="trip-detail-heading">
                <div>
                  <span className="eyebrow green">
                    {trip.direction === "OUTBOUND"
                      ? "IDA · CASA → ESCOLA"
                      : "VOLTA · ESCOLA → CASA"}
                  </span>
                  <h2>{trip.vehicle_name}</h2>
                  <p className="registry-note">
                    {trip.vehicle_plate} · {trip.driver_name} ·{" "}
                    {trip.service_date.split("-").reverse().join("/")} ·{" "}
                    {trip.timezone.replaceAll("_", " ")}
                  </p>
                </div>
                <span
                  className={
                    "registry-badge " +
                    (trip.status === "IN_PROGRESS" ? "active" : "")
                  }
                >
                  {tripStatusLabel(trip.status, trip.closure.exceptional > 0)}
                </span>
              </div>
              <div className="trip-counts">
                {tripCounts(trip).map(([n, label]) => (
                  <div key={label}>
                    <strong>{n}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="trips-stage-note">
                <ShieldCheck size={16} />
                Confirme cada criança individualmente. A primeira parte informa;
                a segunda valida a movimentação. A conclusão exige
                contabilização individual, ocorrências tratadas e conferência
                física da van.
              </p>
              {trip.cancellation_reason && (
                <p className="registry-note">
                  Cancelamento: {trip.cancellation_reason}
                </p>
              )}
              <TripClosure
                trip={trip}
                busy={busy}
                onClose={(body) =>
                  run(async () => {
                    await api(`trips/${trip.id}/close`, body);
                  }, "Conferência registrada. Confira o resultado do encerramento acima.")
                }
              />
              <div className="trip-passengers">
                {trip.passengers.map((p) => (
                  <article
                    key={p.id}
                    className="trip-passenger"
                    data-passenger-id={p.id}
                  >
                    <div className="panel-heading">
                      <div>
                        <span className="planning-direction">
                          {dispositionLabels[p.disposition]}
                        </span>
                        <h3>{p.student_name}</h3>
                        <p>
                          {p.school_name} · Cadastro {p.student_id.slice(-8)}
                        </p>
                      </div>
                      <Users size={18} />
                    </div>
                    <p className="registry-note">
                      Planejamento: {planningLabels[p.planning_status]}
                      {p.exceptional
                        ? " · Inclusão autorizada pelo transporte"
                        : ""}
                    </p>
                    {p.reason && (
                      <p className="registry-note">Motivo: {p.reason}</p>
                    )}
                    <MovementsPanel
                      contextId={context.id}
                      trip={trip}
                      passenger={p}
                      role={context.role}
                      busy={busy}
                      onConfirm={(kind) =>
                        run(async () => {
                          await api(
                            `trips/${trip.id}/passengers/${p.id}/movements/${kind}/confirm`,
                            {},
                          );
                        }, "Confirmação registrada para esta criança.")
                      }
                    />
                    {p.link_status !== "ACTIVE" && (
                      <p className="message error">
                        Vínculo operacional inativo. Histórico preservado.
                      </p>
                    )}
                    {driver &&
                      (mutable || trip.closure.canInspect) &&
                      p.link_status === "ACTIVE" &&
                      !p.boarding_informed_at &&
                      !p.alighting_informed_at && (
                        <details
                          className="trip-inline-tools"
                          open={p.disposition === "REVIEW_REQUIRED"}
                        >
                          <summary>
                            {p.disposition === "REVIEW_REQUIRED"
                              ? "Definir destinação"
                              : "Alterar destinação"}
                            <ChevronDown size={14} />
                          </summary>
                          <label>
                            Motivo da destinação de {p.student_name}
                            <textarea
                              aria-label={
                                "Motivo da destinação de " + p.student_name
                              }
                              value={reason(p.id)}
                              maxLength={1000}
                              onChange={(e) => note(p.id, e.target.value)}
                              placeholder="Registre a verificação ou o motivo da ausência."
                            />
                          </label>
                          <div className="planning-actions">
                            {mutable && p.disposition !== "EXPECTED" && (
                              <button
                                className="button"
                                disabled={
                                  busy || reason(p.id).trim().length < 10
                                }
                                onClick={() =>
                                  mutate(
                                    "passengers/" + p.id,
                                    {
                                      disposition: "EXPECTED",
                                      reason: reason(p.id),
                                    },
                                    "Passageiro incluído para transporte.",
                                    "PATCH",
                                  )
                                }
                              >
                                Incluir para transporte
                              </button>
                            )}
                            {p.disposition !== "NOT_TRANSPORTED" && (
                              <button
                                className="planning-secondary"
                                disabled={
                                  busy || reason(p.id).trim().length < 10
                                }
                                onClick={() =>
                                  mutate(
                                    "passengers/" + p.id,
                                    {
                                      disposition: "NOT_TRANSPORTED",
                                      reason: reason(p.id),
                                    },
                                    "Ausência registrada; participação e histórico preservados.",
                                    "PATCH",
                                  )
                                }
                              >
                                Registrar ausência
                              </button>
                            )}
                          </div>
                        </details>
                      )}
                  </article>
                ))}
              </div>
              {driver && mutable && (
                <div className="trip-operation-actions">
                  {trip.status === "PLANNED" && (
                    <div className="trip-start">
                      <p className="registry-note">
                        Revise as destinações. Só o motorista designado pode
                        iniciar, na data da viagem.
                      </p>
                      <button
                        className="button"
                        disabled={
                          busy ||
                          trip.counts.review > 0 ||
                          !trip.counts.expected ||
                          trip.service_date !== trip.today ||
                          trip.driver_membership_id !== context.id
                        }
                        onClick={() =>
                          mutate(
                            "start",
                            {},
                            "Viagem iniciada. Nenhum embarque foi registrado automaticamente.",
                          )
                        }
                      >
                        <Play size={15} />
                        Iniciar viagem
                      </button>
                    </div>
                  )}
                  {trip.direction === direction && (
                    <details className="trip-inline-tools">
                      <summary>
                        Inclusão excepcional de aluno
                        <Plus size={15} />
                      </summary>
                      <p className="registry-note">
                        Exige vínculo ativo, previsão para esta data/trecho e
                        motivo. Esta autorização do transporte não confirma uso
                        em nome da família.
                      </p>
                      <label>
                        Aluno para inclusão excepcional
                        <select
                          aria-label="Aluno para inclusão excepcional"
                          value={extra}
                          onChange={(e) => setExtra(e.target.value)}
                        >
                          <option value="">
                            Selecione um trecho sem viagem
                          </option>
                          {extraPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.student_name} · {p.school_name} ·{" "}
                              {planningLabels[p.status]} ·{" "}
                              {p.student_id.slice(-8)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Motivo da inclusão excepcional
                        <textarea
                          aria-label="Motivo da inclusão excepcional"
                          value={reason("extra")}
                          onChange={(e) => note("extra", e.target.value)}
                          maxLength={1000}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={
                          busy || !extra || reason("extra").trim().length < 10
                        }
                        onClick={() =>
                          mutate(
                            "passengers",
                            { planId: extra, reason: reason("extra") },
                            "Inclusão excepcional registrada.",
                          )
                        }
                      >
                        Autorizar inclusão
                      </button>
                    </details>
                  )}
                  <details className="trip-inline-tools">
                    <summary>
                      Substituir motorista ou veículo
                      <ChevronDown size={15} />
                    </summary>
                    <div className="trips-form-grid">
                      <label>
                        Novo motorista
                        <select
                          aria-label="Novo motorista"
                          value={newDriver}
                          onChange={(e) => setNewDriver(e.target.value)}
                        >
                          {options.drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Novo veículo
                        <select
                          aria-label="Novo veículo"
                          value={newVehicle}
                          onChange={(e) => setNewVehicle(e.target.value)}
                        >
                          {options.vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} · {v.plate} · {v.capacity} lugares
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Motivo da substituição
                      <textarea
                        aria-label="Motivo da substituição"
                        value={reason("assignment")}
                        onChange={(e) => note("assignment", e.target.value)}
                        maxLength={1000}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        !newDriver ||
                        !newVehicle ||
                        reason("assignment").trim().length < 10 ||
                        (newDriver === trip.driver_membership_id &&
                          newVehicle === trip.vehicle_id)
                      }
                      onClick={() =>
                        mutate(
                          "assignment",
                          {
                            driverId: newDriver,
                            vehicleId: newVehicle,
                            reason: reason("assignment"),
                          },
                          "Substituição registrada com histórico.",
                          "PATCH",
                        )
                      }
                    >
                      Registrar substituição
                    </button>
                  </details>
                  {trip.status === "PLANNED" && (
                    <details className="trip-inline-tools">
                      <summary>
                        Cancelar viagem planejada
                        <ChevronDown size={15} />
                      </summary>
                      <label>
                        Motivo do cancelamento
                        <textarea
                          aria-label="Motivo do cancelamento"
                          value={reason("cancel")}
                          onChange={(e) => note("cancel", e.target.value)}
                          maxLength={1000}
                        />
                      </label>
                      <button
                        className="planning-secondary"
                        disabled={busy || reason("cancel").trim().length < 10}
                        onClick={() =>
                          mutate(
                            "cancel",
                            { reason: reason("cancel") },
                            "Viagem cancelada. Os registros foram preservados e as previsões liberadas.",
                          )
                        }
                      >
                        Cancelar viagem planejada
                      </button>
                    </details>
                  )}
                </div>
              )}
              <details className="trip-inline-tools">
                <summary>
                  Histórico de motorista e veículo
                  <ChevronDown size={15} />
                </summary>
                {trip.assignments.map((a) => (
                  <div className="trip-assignment" key={a.id}>
                    <strong>
                      {a.driver_name} · {a.vehicle_name} · {a.vehicle_plate}
                    </strong>
                    <p>{a.reason}</p>
                    <small>
                      {a.actor_name} ·{" "}
                      {new Date(a.created_at).toLocaleString("pt-BR", {
                        timeZone: trip.timezone,
                      })}
                    </small>
                  </div>
                ))}
              </details>
            </section>
          ) : (
            <>
              <div className="trips-list">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    className="trip-list-item"
                    onClick={() => {
                      setSelected(t.id);
                      setPreparing(false);
                    }}
                  >
                    <span className="trip-bus">
                      <BusFront size={24} />
                    </span>
                    <span>
                      <small>
                        {t.direction === "OUTBOUND" ? "IDA" : "VOLTA"} ·{" "}
                        {tripStatusLabel(t.status, t.closure.exceptional > 0)}
                      </small>
                      <strong>
                        {t.vehicle_name} <span>· {t.vehicle_plate}</span>
                      </strong>
                      <small>
                        {t.driver_name} · {t.counts.total} participações ·{" "}
                        {t.counts.review} a revisar
                      </small>
                      <small>
                        {Array.from(
                          new Set(t.passengers.map((p) => p.school_name)),
                        ).join(" · ")}
                      </small>
                    </span>
                    <ArrowUpRight size={20} />
                  </button>
                ))}
              </div>
              {!filtered.length && !preparing && (
                <section className="panel registry-empty">
                  <BusFront size={29} />
                  <h3>Nenhuma viagem neste trecho.</h3>
                  <p>
                    {driver
                      ? "Prepare uma viagem e selecione as previsões autorizadas."
                      : "As viagens aparecerão quando o transporte preparar a lista."}
                  </p>
                </section>
              )}
              {unassigned.length > 0 && (
                <details className="panel trips-unassigned" open>
                  <summary>Trechos sem viagem · {unassigned.length}</summary>
                  <p className="registry-note">
                    Ainda precisam de destinação. Nenhum trecho pendente é
                    considerado ausente automaticamente.
                  </p>
                  {unassigned.map((p) => (
                    <div className="trip-unassigned-row" key={p.id}>
                      <span>
                        <strong>{p.student_name}</strong>
                        <small>
                          {p.school_name} · Cadastro {p.student_id.slice(-8)}
                        </small>
                      </span>
                      <small>
                        {p.pending_change
                          ? "Alteração em análise"
                          : planningLabels[p.status]}
                      </small>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
