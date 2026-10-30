import { planningLabel } from "../shared/planning-presentation";
import { useEffect, useRef, useState } from "react";
import Movements from "./Movements";
import TripClosure from "./TripClosure";
import { createPlanningMaterializer } from "../shared/materialize-planning";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Trip,
  TripOptions,
  tripStatusLabel,
  dispositionLabels,
  planningLabels,
  tripCounts,
} from "../shared/trips";
type Context = { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
type Client = <T>(
  path: string,
  body?: unknown,
  auth?: string | null,
  method?: string,
) => Promise<T>;
export default function Trips({
  context,
  client,
  initialDate,
  initialTripId = "",
  initialDirection = "OUTBOUND",
  initialPreparing = false,
  managementOnly = false,
  onPrepared,
}: {
  context: Context;
  client: Client;
  initialDate?: string;
  initialTripId?: string;
  initialDirection?: string;
  initialPreparing?: boolean;
  managementOnly?: boolean;
  onPrepared?: (tripId: string, serviceDate: string) => void;
}) {
  const materializePlanning = useRef(createPlanningMaterializer()).current;
  const driver = context.role === "DRIVER";
  const [planningOptions, setPlanningOptions] = useState<{
    links: { id: string; today: string }[];
  } | null>(null);
  const [date, setDate] = useState(""),
    [today, setToday] = useState(""),
    [direction, setDirection] = useState(initialDirection),
    [trips, setTrips] = useState<Trip[]>([]),
    [options, setOptions] = useState<TripOptions>({
      plans: [],
      drivers: [],
      vehicles: [],
    });
  const [selected, setSelected] = useState(initialTripId),
    [preparing, setPreparing] = useState(false),
    [driverId, setDriverId] = useState(""),
    [vehicleId, setVehicleId] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [creationId, setCreationId] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reasons, setReasons] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState(""),
    [newDriver, setNewDriver] = useState(""),
    [newVehicle, setNewVehicle] = useState(""),
    [tools, setTools] = useState("");
  const api = <T,>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ) => client<T>(path, body, undefined, method);
  useEffect(() => {
    let alive = true;
    if (initialPreparing)
      api<{ id: string }>("trips/preparation-key", {})
        .then((key) => {
          if (alive) {
            setCreationId(key.id);
            setPreparing(true);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, []);
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
          setDate(initialDate || value);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setTrips([]);
      setOptions({ plans: [], drivers: [], vehicles: [] });
      if (date) setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    setNotice("");
    setIds([]);
    setTrips([]);
    setOptions({ plans: [], drivers: [], vehicles: [] });
    if (!planningOptions) return;
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
        if (alive && result) {
          const [list, opts] = result;
          setTrips(list.trips);
          setOptions(opts);
          setDriverId(
            opts.drivers.find((d) => d.id === context.id)?.id ||
              opts.drivers[0]?.id ||
              "",
          );
          setVehicleId(opts.vehicles[0]?.id || "");
        }
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
    setTools("");
  }, [selected]);
  async function run(
    fn: () => Promise<void>,
    message: string,
    refreshAfter = true,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (refreshAfter) await refresh();
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
  function note(id: string, value: string) {
    setReasons((old) => ({ ...old, [id]: value }));
  }
  const mutable =
    trip &&
    ["PLANNED", "IN_PROGRESS"].includes(trip.status) &&
    trip.service_date >= trip.today;
  const unassigned = options.plans.filter(
    (p) =>
      !p.trip_id &&
      (p.scheduled || p.status === "CONFIRMED" || p.status === "NOT_USING"),
  );
  const needsInitialException = options.plans.some(
    (p) => ids.includes(p.id) && p.status === "NOT_EXPECTED",
  );
  const extraPlans = options.plans.filter(
    (p) => !p.trip_id && !p.locked_at && !p.pending_change,
  );
  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
  ) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        maxLength={1000}
        multiline
      />
    </View>
  );
  const choices = (
    label: string,
    items: { id: string; name: string }[],
    value: string,
    onChange: (v: string) => void,
  ) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === item.id }}
          disabled={busy}
          onPress={() => onChange(item.id)}
          style={[s.choice, value === item.id && s.selected]}
        >
          <Text style={s.text}>
            {value === item.id ? "● " : "○ "}
            {item.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.label}>Data das viagens (AAAA-MM-DD)</Text>
        <TextInput
          accessibilityLabel="Data das viagens (AAAA-MM-DD)"
          value={date}
          editable={!busy}
          autoCapitalize="none"
          style={s.input}
          onChangeText={(value) => {
            setDate(value);
            setSelected("");
            setPreparing(false);
          }}
        />
        <View style={s.row}>
          {[
            ["OUTBOUND", "Ida"],
            ["RETURN", "Volta"],
          ].map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: direction === id }}
              disabled={busy}
              onPress={() => {
                setDirection(id);
                setSelected("");
                setPreparing(false);
              }}
              style={[s.tab, direction === id && s.selected]}
            >
              <Text style={s.text}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Action
          title="Atualizar viagens"
          secondary
          busy={busy}
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onPress={() => run(async () => {}, "Viagens atualizadas.")}
        />
        {driver && (
          <Action
            title="Preparar viagem"
            busy={busy}
            disabled={loading || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
            onPress={() =>
              run(async () => {
                const key = await api<{ id: string }>(
                  "trips/preparation-key",
                  {},
                );
                setPreparing(!preparing);
                setSelected("");
                setIds([]);
                setCreationId(key.id);
                setReasons({});
              }, "Selecione os passageiros da viagem.")
            }
          />
        )}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.success}>
          {notice}
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator color="#43566d" />
      ) : (
        <>
          {!trip && (
            <Text style={s.note}>
              {unassigned.length} trecho(s) sem viagem. Defina a destinação de
              cada previsão.
            </Text>
          )}
          {preparing && driver && (
            <View style={s.card}>
              <Text style={s.title}>Preparação da viagem</Text>
              {choices(
                "Motorista da viagem",
                options.drivers,
                driverId,
                setDriverId,
              )}
              {choices(
                "Veículo da viagem",
                options.vehicles.map((v) => ({
                  id: v.id,
                  name: `${v.name} · ${v.plate} · ${v.capacity} lugares`,
                })),
                vehicleId,
                setVehicleId,
              )}
              <Text style={s.note}>
                Sem resposta, a previsão exige revisão. Não uso expresso entra
                como não transportada. Sem previsão, registre o motivo da
                inclusão excepcional abaixo.
              </Text>
              {!options.plans.length && (
                <Text style={s.note}>
                  Não há previsões neste trecho. Confira os vínculos ativos e a
                  configuração do transporte. Datas permitidas são preparadas
                  automaticamente.
                </Text>
              )}
              {options.plans.map((p) => {
                const disabled =
                  busy ||
                  Boolean(p.trip_id) ||
                  Boolean(p.locked_at) ||
                  p.pending_change;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: ids.includes(p.id),
                      disabled,
                    }}
                    accessibilityLabel={`Incluir ${p.student_name}, ${p.school_name}, cadastro ${p.student_id.slice(-8)}`}
                    disabled={disabled}
                    style={[
                      s.choice,
                      ids.includes(p.id) && s.selected,
                      disabled && { opacity: 0.55 },
                    ]}
                    onPress={() =>
                      setIds((old) =>
                        old.includes(p.id)
                          ? old.filter((id) => id !== p.id)
                          : [...old, p.id],
                      )
                    }
                  >
                    <Text style={s.strong}>
                      {ids.includes(p.id) ? "● " : "○ "}
                      {p.student_name}
                    </Text>
                    <Text style={s.note}>
                      {p.school_name} · Cadastro {p.student_id.slice(-8)}
                    </Text>
                    <Text style={s.note}>
                      {p.trip_id
                        ? "Já tem viagem"
                        : p.pending_change
                          ? "Alteração em análise"
                          : p.locked_at
                            ? "Bloqueado"
                            : planningLabel({
                                status: p.status,
                                routine_revision: p.routine_revision ?? null,
                              })}
                    </Text>
                  </Pressable>
                );
              })}
              <Text style={s.note}>
                {ids.length} trecho(s) selecionado(s), incluindo não uso
                expresso.
              </Text>
              {needsInitialException &&
                field(
                  "Motivo das inclusões sem previsão",
                  reasons.initial || "",
                  (value) => note("initial", value),
                )}
              <Action
                title="Salvar viagem planejada"
                busy={busy}
                disabled={
                  !ids.length ||
                  !driverId ||
                  !vehicleId ||
                  (needsInitialException &&
                    (reasons.initial || "").trim().length < 10)
                }
                onPress={() =>
                  run(
                    async () => {
                      const result = await api<{ id: string }>("trips", {
                        id: creationId,
                        date,
                        direction,
                        driverId,
                        vehicleId,
                        planIds: ids,
                        ...(needsInitialException
                          ? { exceptionReason: reasons.initial }
                          : {}),
                      });
                      if (onPrepared) onPrepared(result.id, date);
                      else setSelected(result.id);
                      setPreparing(false);
                      setIds([]);
                    },
                    "Viagem preparada. Revise os passageiros.",
                    !onPrepared,
                  )
                }
              />
            </View>
          )}
          {trip ? (
            <View style={s.card}>
              <Action
                title="← Voltar às viagens"
                secondary
                busy={busy}
                onPress={() => setSelected("")}
              />
              <Text style={s.meta}>
                {trip.direction === "OUTBOUND"
                  ? "IDA · CASA → ESCOLA"
                  : "VOLTA · ESCOLA → CASA"}
              </Text>
              <Text style={s.title}>{trip.vehicle_name}</Text>
              <Text style={s.text}>
                {tripStatusLabel(trip.status, trip.closure.exceptional > 0)}
              </Text>
              <Text style={s.note}>
                {trip.vehicle_plate} · {trip.driver_name}
                {"\n"}
                {trip.service_date.split("-").reverse().join("/")} ·{" "}
                {trip.timezone.replaceAll("_", " ")}
              </Text>
              <View style={s.counts}>
                {tripCounts(trip).map(([n, label]) => (
                  <View style={s.count} key={label}>
                    <Text style={s.number}>{n}</Text>
                    <Text style={s.note}>{label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.stage}>
                Confirme cada criança individualmente. A primeira parte informa;
                a segunda valida. A conclusão exige contabilização individual,
                ocorrências tratadas e conferência física da van.
              </Text>
              {trip.cancellation_reason && (
                <Text style={s.note}>
                  Cancelamento: {trip.cancellation_reason}
                </Text>
              )}
              {!managementOnly && (
                <TripClosure
                  trip={trip}
                  busy={busy}
                  onClose={(body) =>
                    run(async () => {
                      await api(`trips/${trip.id}/close`, body);
                    }, "Conferência registrada. Confira o resultado do encerramento acima.")
                  }
                />
              )}
              {trip.passengers.map((p) => (
                <View key={p.id} style={s.passenger}>
                  <Text style={s.meta}>
                    {dispositionLabels[p.disposition].toUpperCase()}
                  </Text>
                  <Text style={s.title}>{p.student_name}</Text>
                  <Text style={s.note}>
                    {p.school_name} · Cadastro {p.student_id.slice(-8)}
                    {"\n"}Planejamento:{" "}
                    {planningLabel({
                      status: p.planning_status,
                      routine_revision:
                        p.routine_revision === undefined
                          ? 1
                          : p.routine_revision,
                    })}
                    {p.exceptional
                      ? " · Inclusão autorizada pelo transporte"
                      : ""}
                  </Text>
                  {p.reason && <Text style={s.note}>Motivo: {p.reason}</Text>}
                  {!managementOnly && (
                    <Movements
                      client={client}
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
                  )}
                  {p.link_status !== "ACTIVE" && (
                    <Text style={s.error}>
                      Vínculo inativo. Histórico preservado.
                    </Text>
                  )}
                  {driver &&
                    (mutable || trip.closure.canInspect) &&
                    p.link_status === "ACTIVE" &&
                    !p.boarding_informed_at &&
                    !p.alighting_informed_at && (
                      <>
                        {field(
                          "Motivo da destinação de " + p.student_name,
                          reasons[p.id] || "",
                          (value) => note(p.id, value),
                        )}
                        {mutable && p.disposition !== "EXPECTED" && (
                          <Action
                            title="Incluir para transporte"
                            busy={busy}
                            disabled={(reasons[p.id] || "").trim().length < 10}
                            onPress={() =>
                              mutate(
                                "passengers/" + p.id,
                                {
                                  disposition: "EXPECTED",
                                  reason: reasons[p.id],
                                },
                                "Passageiro incluído para transporte.",
                                "PATCH",
                              )
                            }
                          />
                        )}
                        {p.disposition !== "NOT_TRANSPORTED" && (
                          <Action
                            title="Registrar ausência"
                            busy={busy}
                            secondary
                            disabled={(reasons[p.id] || "").trim().length < 10}
                            onPress={() =>
                              mutate(
                                "passengers/" + p.id,
                                {
                                  disposition: "NOT_TRANSPORTED",
                                  reason: reasons[p.id],
                                },
                                "Ausência registrada. Histórico preservado.",
                                "PATCH",
                              )
                            }
                          />
                        )}
                      </>
                    )}
                </View>
              ))}
              {driver && mutable && (
                <>
                  {trip.status === "PLANNED" && (
                    <>
                      <Text style={s.note}>
                        Somente o motorista designado inicia na data da viagem,
                        após revisar todas as destinações.
                      </Text>
                      <Action
                        title="Iniciar viagem"
                        busy={busy}
                        disabled={
                          trip.counts.review > 0 ||
                          !trip.counts.expected ||
                          trip.service_date !== trip.today ||
                          trip.driver_membership_id !== context.id
                        }
                        onPress={() =>
                          mutate(
                            "start",
                            {},
                            "Viagem iniciada. Nenhum embarque automático.",
                          )
                        }
                      />
                    </>
                  )}
                  <Action
                    title="Inclusão excepcional de aluno"
                    secondary
                    busy={busy}
                    onPress={() => setTools(tools === "extra" ? "" : "extra")}
                  />
                  {tools === "extra" && (
                    <>
                      {choices(
                        "Aluno para inclusão excepcional",
                        extraPlans.map((p) => ({
                          id: p.id,
                          name: `${p.student_name} · ${p.school_name} · ${planningLabel({ status: p.status, routine_revision: p.routine_revision ?? null })} · ${p.student_id.slice(-8)}`,
                        })),
                        extra,
                        setExtra,
                      )}
                      {field(
                        "Motivo da inclusão excepcional",
                        reasons.extra || "",
                        (value) => note("extra", value),
                      )}
                      <Text style={s.note}>
                        Autorização do transporte com vínculo ativo. Não
                        confirma uso em nome da família.
                      </Text>
                      <Action
                        title="Autorizar inclusão"
                        busy={busy}
                        disabled={
                          !extra || (reasons.extra || "").trim().length < 10
                        }
                        onPress={() =>
                          mutate(
                            "passengers",
                            { planId: extra, reason: reasons.extra },
                            "Inclusão excepcional registrada.",
                          )
                        }
                      />
                    </>
                  )}
                  <Action
                    title="Substituir motorista ou veículo"
                    secondary
                    busy={busy}
                    onPress={() =>
                      setTools(tools === "assignment" ? "" : "assignment")
                    }
                  />
                  {tools === "assignment" && (
                    <>
                      {choices(
                        "Novo motorista",
                        options.drivers,
                        newDriver,
                        setNewDriver,
                      )}
                      {choices(
                        "Novo veículo",
                        options.vehicles.map((v) => ({
                          id: v.id,
                          name: `${v.name} · ${v.plate} · ${v.capacity} lugares`,
                        })),
                        newVehicle,
                        setNewVehicle,
                      )}
                      {field(
                        "Motivo da substituição",
                        reasons.assignment || "",
                        (value) => note("assignment", value),
                      )}
                      <Action
                        title="Registrar substituição"
                        busy={busy}
                        disabled={
                          !newDriver ||
                          !newVehicle ||
                          (reasons.assignment || "").trim().length < 10 ||
                          (newDriver === trip.driver_membership_id &&
                            newVehicle === trip.vehicle_id)
                        }
                        onPress={() =>
                          mutate(
                            "assignment",
                            {
                              driverId: newDriver,
                              vehicleId: newVehicle,
                              reason: reasons.assignment,
                            },
                            "Substituição registrada com histórico.",
                            "PATCH",
                          )
                        }
                      />
                    </>
                  )}
                  {trip.status === "PLANNED" && (
                    <>
                      <Action
                        title="Cancelar viagem planejada"
                        secondary
                        busy={busy}
                        onPress={() =>
                          setTools(tools === "cancel" ? "" : "cancel")
                        }
                      />
                      {tools === "cancel" && (
                        <>
                          {field(
                            "Motivo do cancelamento",
                            reasons.cancel || "",
                            (value) => note("cancel", value),
                          )}
                          <Action
                            title="Registrar cancelamento"
                            busy={busy}
                            disabled={(reasons.cancel || "").trim().length < 10}
                            onPress={() =>
                              mutate(
                                "cancel",
                                { reason: reasons.cancel },
                                "Viagem cancelada. Registros preservados e previsões liberadas.",
                              )
                            }
                          />
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <Text style={s.section}>Histórico de motorista e veículo</Text>
              {trip.assignments.map((a) => (
                <View key={a.id} style={s.assignment}>
                  <Text style={s.strong}>
                    {a.driver_name} · {a.vehicle_name} · {a.vehicle_plate}
                  </Text>
                  <Text style={s.note}>
                    {a.reason}
                    {"\n"}
                    {a.actor_name} ·{" "}
                    {new Date(a.created_at).toLocaleString("pt-BR", {
                      timeZone: trip.timezone,
                    })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              {trips
                .filter((t) => t.direction === direction)
                .map((t) => (
                  <Pressable
                    key={t.id}
                    style={s.trip}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelected(t.id);
                      setPreparing(false);
                    }}
                  >
                    <Text style={s.meta}>
                      {t.direction === "OUTBOUND" ? "IDA" : "VOLTA"} ·{" "}
                      {tripStatusLabel(t.status, t.closure.exceptional > 0)}
                    </Text>
                    <Text style={s.title}>{t.vehicle_name} ↗</Text>
                    <Text style={s.note}>
                      {t.vehicle_plate} · {t.driver_name}
                      {"\n"}
                      {t.counts.total} participações · {t.counts.review} a
                      revisar{"\n"}
                      {Array.from(
                        new Set(t.passengers.map((p) => p.school_name)),
                      ).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
              {!trips.some((t) => t.direction === direction) && !preparing && (
                <View style={s.card}>
                  <Text style={s.text}>Nenhuma viagem neste trecho.</Text>
                  <Text style={s.note}>
                    {driver
                      ? "Prepare uma viagem com as previsões autorizadas."
                      : "O transporte ainda não preparou a lista."}
                  </Text>
                </View>
              )}
              {unassigned.length > 0 && (
                <View style={s.card}>
                  <Text style={s.title}>
                    Trechos sem viagem · {unassigned.length}
                  </Text>
                  <Text style={s.note}>Pendência não equivale a ausência.</Text>
                  {unassigned.map((p) => (
                    <View key={p.id} style={s.assignment}>
                      <Text style={s.strong}>{p.student_name}</Text>
                      <Text style={s.note}>
                        {p.school_name} · Cadastro {p.student_id.slice(-8)}
                        {"\n"}
                        {p.pending_change
                          ? "Alteração em análise"
                          : planningLabel({
                              status: p.status,
                              routine_revision: p.routine_revision ?? null,
                            })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
function Action({
  title,
  busy,
  disabled = false,
  onPress,
  secondary = false,
}: {
  title: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={[
        s.action,
        secondary && s.secondary,
        (busy || disabled) && { opacity: 0.45 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? "#43566d" : "white"} />
      ) : (
        <Text style={[s.actionText, secondary && { color: "#526b83" }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { gap: 17 },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2eaf2",
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#43566d",
    marginVertical: 10,
  },
  text: { fontSize: 12, color: "#526b83", lineHeight: 21 },
  strong: { fontSize: 12, fontWeight: "600", color: "#526b83", lineHeight: 21 },
  note: { fontSize: 10, color: "#7a8fa3", lineHeight: 20 },
  label: { fontSize: 11, color: "#62778b", marginBottom: 9 },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#dce5ee",
    borderRadius: 8,
    color: "#43566d",
    backgroundColor: "white",
  },
  field: { marginTop: 18 },
  row: { flexDirection: "row", gap: 8, marginTop: 14 },
  tab: {
    paddingHorizontal: 23,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f6f9",
  },
  selected: { backgroundColor: "#dce7f1", borderColor: "#9db1c5" },
  choice: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#e1e9f1",
    borderRadius: 9,
    marginBottom: 7,
    marginTop: 5,
  },
  action: {
    padding: 14,
    backgroundColor: "#43566d",
    borderRadius: 9,
    alignItems: "center",
    marginTop: 13,
  },
  secondary: { backgroundColor: "#eaf0f5" },
  actionText: { color: "white", fontSize: 11, fontWeight: "600" },
  error: {
    fontSize: 11,
    lineHeight: 20,
    color: "#9b3b2b",
    backgroundColor: "#fff0ed",
    borderRadius: 9,
    padding: 14,
  },
  success: {
    fontSize: 11,
    lineHeight: 20,
    color: "#276147",
    backgroundColor: "#e6f2e4",
    borderRadius: 9,
    padding: 14,
  },
  trip: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#e1e9f1",
    backgroundColor: "#eaf0f5",
    borderRadius: 17,
  },
  meta: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.7,
    color: "#7b90a5",
    marginTop: 12,
  },
  counts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 20,
  },
  count: {
    minWidth: 100,
    flexGrow: 1,
    padding: 12,
    backgroundColor: "#f2f6fa",
    borderRadius: 10,
  },
  number: { fontSize: 24, color: "#43566d" },
  stage: {
    fontSize: 10,
    lineHeight: 20,
    color: "#70869b",
    padding: 13,
    borderRadius: 9,
    backgroundColor: "#edf2f7",
  },
  passenger: {
    borderWidth: 1,
    borderColor: "#e1e9f1",
    borderRadius: 14,
    padding: 16,
    marginVertical: 12,
    backgroundColor: "#f9fbfd",
  },
  section: { fontSize: 13, fontWeight: "600", color: "#526b83", marginTop: 24 },
  assignment: {
    borderTopWidth: 1,
    borderColor: "#e2eaf2",
    paddingVertical: 15,
    marginTop: 10,
  },
});
