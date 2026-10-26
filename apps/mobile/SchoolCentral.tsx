import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SchoolDay, SchoolDayRow } from "../shared/school-day";
import { schoolPlanningLabels } from "../shared/school-day";
import type { JourneyTarget } from "../shared/navigation";
import type { MovementConfirmationResult, Passenger } from "../shared/trips";
import { alertKinds, alertLevels } from "../shared/alerts";

type Client = <T>(path: string, body?: unknown) => Promise<T>;
type RowState = { busy?: boolean; uncertain?: boolean; error?: string };
const valid = (c: Passenger["movements"][number]["confirmations"][number]) =>
  c.correctionStatus !== "APPROVED";
function mergeDay(previous: SchoolDay | null, next: SchoolDay) {
  if (!previous || previous.date !== next.date) return next;
  const incoming = new Map(next.rows.map((row) => [row.id, row]));
  const rows: SchoolDayRow[] = [];
  for (const row of previous.rows) {
    const fresh = incoming.get(row.id);
    if (fresh) {
      rows.push(fresh);
      incoming.delete(row.id);
    }
  }
  const oldTrips = new Map(previous.trips.map((trip) => [trip.id, trip]));
  return {
    ...next,
    rows: [...rows, ...incoming.values()],
    trips: next.trips.map((trip) => {
      const old = oldTrips.get(trip.id);
      return old && old.version > trip.version ? old : trip;
    }),
  };
}
export default function SchoolCentral({
  client,
  contextId,
  active,
  onOpenTarget,
}: {
  client: Client;
  contextId: string;
  active: boolean;
  onOpenTarget: (target: JourneyTarget) => void;
}) {
  const api = useRef(client);
  api.current = client;
  const [date, setDate] = useState(""),
    [dateDraft, setDateDraft] = useState(""),
    [day, setDay] = useState<SchoolDay | null>(null);
  const [direction, setDirection] = useState("OUTBOUND"),
    [query, setQuery] = useState(""),
    [transport, setTransport] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({}),
    [expanded, setExpanded] = useState("");
  const [showNotUsing, setShowNotUsing] = useState(false),
    [showNotExpected, setShowNotExpected] = useState(false);
  const alive = useRef(true),
    epoch = useRef(0),
    serial = useRef(0),
    mutations = useRef(0),
    inFlight = useRef(new Set<string>());
  const latest = useRef(day);
  latest.current = day;
  const dateRef = useRef(date);
  dateRef.current = date;
  const pendingRead = useRef(false),
    revoked = useRef(false);
  const passengerVersions = useRef(new Map<string, number>());
  function clearAccess(message: string) {
    revoked.current = true;
    serial.current++;
    latest.current = null;
    setDay(null);
    setRows({});
    setQuery("");
    setTransport("");
    setVehicle("");
    setExpanded("");
    setError(message);
  }
  async function read(selectedDate = dateRef.current) {
    if (pendingRead.current || revoked.current) return;
    pendingRead.current = true;
    const request = ++serial.current,
      revision = mutations.current,
      scope = epoch.current;
    try {
      const result = await api.current<SchoolDay>(
        "school/day" + (selectedDate ? "?date=" + selectedDate : ""),
      );
      if (
        !alive.current ||
        request !== serial.current ||
        scope !== epoch.current ||
        revision !== mutations.current
      )
        return;
      const next = mergeDay(latest.current, result);
      for (const trip of next.trips)
        for (const passenger of trip.passengers)
          passengerVersions.current.set(
            passenger.id,
            Math.max(
              passengerVersions.current.get(passenger.id) || 0,
              trip.version,
            ),
          );
      latest.current = next;
      setDay(next);
      if (!selectedDate) setDate(result.date);
      setError("");
      setRows((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([id]) =>
            result.rows.some((row) => row.id === id),
          ),
        ),
      );
      return result;
    } catch (e) {
      if (!alive.current || scope !== epoch.current) return;
      if ([401, 403].includes((e as { status?: number }).status || 0))
        clearAccess((e as Error).message);
      else setError((e as Error).message);
    } finally {
      pendingRead.current = false;
      if (alive.current && scope === epoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      serial.current++;
    };
  }, []);
  useEffect(() => {
    setDateDraft(date);
    setVehicle("");
    epoch.current++;
    serial.current++;
    latest.current = null;
    setDay(null);
    setRows({});
    setExpanded("");
    setError("");
    setLoading(true);
    // A response for the previous date must finish before the next read is applied.
    let cancelled = false;
    const load = async () => {
      if (pendingRead.current) {
        retry = setTimeout(load, 50);
        return;
      }
      if (!cancelled) await read(date);
    };
    let retry: ReturnType<typeof setTimeout> | undefined;
    void load();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [date]);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (AppState.currentState === "active") void read();
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void read();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [active, date]);
  function target(
    row: SchoolDayRow,
    view: "history" | "alerts",
    alertId?: string,
  ) {
    onOpenTarget({
      view,
      contextId,
      date,
      studentId: row.student_id,
      operatingLinkId: row.operating_link_id,
      passengerId: row.passenger_id || undefined,
      tripId: row.trip_id || undefined,
      alertId,
    });
  }
  async function confirm(row: SchoolDayRow) {
    if (inFlight.current.has(row.id) || revoked.current) return;
    const trip = latest.current?.trips.find((t) => t.id === row.trip_id);
    const passenger = trip?.passengers.find((p) => p.id === row.passenger_id);
    const kind = row.direction === "OUTBOUND" ? "ALIGHTING" : "BOARDING";
    const movement = passenger?.movements.find((m) => m.kind === kind);
    if (!trip || !passenger || !movement?.canConfirm || rows[row.id]?.uncertain)
      return;
    inFlight.current.add(row.id);
    mutations.current++;
    const scope = epoch.current;
    setRows((old) => ({ ...old, [row.id]: { busy: true } }));
    setNotice("");
    try {
      const result = await api.current<MovementConfirmationResult>(
        `trips/${trip.id}/passengers/${passenger.id}/movements/${kind}/confirm`,
        {},
      );
      if (!alive.current || scope !== epoch.current) return;
      mutations.current++;
      const current = latest.current;
      if (current) {
        const canApply =
          result.tripVersion >=
          (passengerVersions.current.get(passenger.id) || 0);
        if (canApply)
          passengerVersions.current.set(passenger.id, result.tripVersion);
        const next = {
          ...current,
          trips: current.trips.map((t) =>
            t.id === trip.id
              ? {
                  ...t,
                  version: Math.max(t.version, result.tripVersion),
                  passengers: t.passengers.map((p) =>
                    p.id === passenger.id && canApply ? result.passenger : p,
                  ),
                }
              : t,
          ),
        };
        latest.current = next;
        setDay(next);
      }
      setRows((old) => ({ ...old, [row.id]: {} }));
      setNotice("Confirmação registrada pelo servidor.");
    } catch (e) {
      if (!alive.current || scope !== epoch.current) return;
      mutations.current++;
      if ([401, 403].includes((e as { status?: number }).status || 0)) {
        clearAccess((e as Error).message);
        return;
      }
      setRows((old) => ({
        ...old,
        [row.id]: {
          uncertain: true,
          error:
            "Resposta não confirmada. Consulte o estado antes de tentar novamente.",
        },
      }));
      // No retry of a physical confirmation without reading its current server state.
      await verify(row.id);
    } finally {
      inFlight.current.delete(row.id);
    }
  }
  async function verify(id: string) {
    const result = await read();
    if (result && alive.current) setRows((old) => ({ ...old, [id]: {} }));
  }
  const selected =
    day?.rows.filter(
      (row) =>
        row.direction === direction &&
        (!transport || row.transport_id === transport) &&
        (!vehicle ||
          day.trips.find((trip) => trip.id === row.trip_id)?.vehicle_id ===
            vehicle) &&
        (row.student_name + " " + row.student_id.slice(-8))
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
    ) || [];
  const category = (row: SchoolDayRow) =>
    row.trip_id ? "ACTIVE" : row.planning.status;
  const visible = selected.filter(
    (row) =>
      !["NOT_USING", "NOT_EXPECTED"].includes(category(row)) ||
      (category(row) === "NOT_USING" ? showNotUsing : showNotExpected),
  );
  return (
    <View style={s.root}>
      <View style={s.tools}>
        <Button
          label="Receber na escola"
          selected={direction === "OUTBOUND"}
          onPress={() => setDirection("OUTBOUND")}
        />
        <Button
          label="Entregar ao transporte"
          selected={direction === "RETURN"}
          onPress={() => setDirection("RETURN")}
        />
      </View>
      <View style={s.tools}>
        <Button label="Hoje" onPress={() => day && setDate(day.today)} />
        <Button label="Amanhã" onPress={() => day && setDate(day.tomorrow)} />
        <Button label="Atualizar" onPress={() => void read()} />
      </View>
      <Text style={s.note}>Data (AAAA-MM-DD)</Text>
      <TextInput
        accessibilityLabel="Data"
        style={s.input}
        value={dateDraft}
        onChangeText={setDateDraft}
        onBlur={() => {
          if (
            /^\d{4}-\d{2}-\d{2}$/.test(dateDraft) &&
            !Number.isNaN(Date.parse(dateDraft))
          )
            setDate(dateDraft);
          else {
            setDateDraft(date);
            setError("Informe uma data no formato AAAA-MM-DD.");
          }
        }}
      />
      <TextInput
        accessibilityLabel="Buscar criança"
        placeholder="Buscar criança ou identificador"
        style={s.input}
        value={query}
        onChangeText={setQuery}
      />
      <View style={s.tools}>
        <Button
          label="Todos os transportes"
          selected={!transport}
          onPress={() => setTransport("")}
        />
        {[
          ...new Map(
            day?.rows.map((r) => [r.transport_id, r.transport_name]),
          ).entries(),
        ].map(([id, name]) => (
          <Button
            key={id}
            label={name}
            selected={transport === id}
            onPress={() => setTransport(id)}
          />
        ))}
      </View>
      <View style={s.tools}>
        <Button
          label="Todas as vans"
          selected={!vehicle}
          onPress={() => setVehicle("")}
        />
        {[
          ...new Map(
            day?.trips
              .filter((trip) => trip.direction === direction)
              .map((trip) => [trip.vehicle_id, trip]),
          ).values(),
        ].map((trip) => (
          <Button
            key={trip.vehicle_id}
            label={`${trip.vehicle_name} · ${trip.vehicle_plate}`}
            selected={vehicle === trip.vehicle_id}
            onPress={() => setVehicle(trip.vehicle_id)}
          />
        ))}
      </View>
      {loading && <Text style={s.note}>Carregando o dia escolar…</Text>}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.note}>
          {notice}
        </Text>
      )}
      {day && (
        <View style={s.card}>
          <Button
            label={`${day.attention?.openCount || 0} ocorrências abertas · ${day.attention?.criticalCount || 0} críticas · ${day.attention?.otherDatesCount || 0} de outras datas`}
            onPress={() => onOpenTarget({ view: "alerts", contextId, date })}
          />
          {day.attention?.items.map((item) => (
            <Button
              key={item.id}
              label={`${alertLevels[item.level]} · ${item.studentName} · ${item.date}`}
              onPress={() =>
                onOpenTarget({
                  view: "alerts",
                  contextId,
                  date: item.date,
                  studentId: item.studentId,
                  tripId: item.tripId,
                  passengerId: item.passengerId,
                  alertId: item.id,
                })
              }
            />
          ))}
        </View>
      )}
      {visible.map((row) => {
        const trip = day?.trips.find((t) => t.id === row.trip_id),
          passenger = trip?.passengers.find((p) => p.id === row.passenger_id);
        const movement = passenger?.movements.find(
          (m) =>
            m.kind ===
            (row.direction === "OUTBOUND" ? "ALIGHTING" : "BOARDING"),
        );
        const school = movement?.confirmations.find(
          (c) => c.side === "COUNTERPART" && valid(c),
        );
        const driver = movement?.confirmations.find(
          (c) => c.side === "DRIVER" && valid(c),
        );
        const state = rows[row.id] || {};
        return (
          <View key={row.id} style={s.card}>
            <Text style={s.name}>{row.student_name}</Text>
            <Text style={s.note}>ID {row.student_id.slice(-8)}</Text>
            <Text style={s.note}>
              {trip
                ? `${trip.vehicle_name} · ${trip.vehicle_plate} · ${trip.driver_name}`
                : `${row.transport_name} · van a definir`}
            </Text>
            <Text style={s.status}>
              {schoolPlanningLabels[row.planning.status]}
            </Text>
            {!!row.planning.pendingChange && (
              <Text style={s.warning}>
                Alteração aguardando transporte. Situação vigente mantida.
              </Text>
            )}
            {!!row.planning.missingConfiguration.length && (
              <Text style={s.note}>
                Falta configurar{" "}
                {row.planning.missingConfiguration
                  .map((v) =>
                    v === "ROUTINE" ? "rotina familiar" : "prazo do transporte",
                  )
                  .join(" e ")}
                .
              </Text>
            )}
            {passenger && (
              <>
                <Text style={s.note}>
                  {school
                    ? `Escola confirmou por ${school.actorName}${driver ? "" : " · aguardando motorista"}`
                    : "Escola ainda não confirmou"}
                </Text>
                <Text style={s.note}>
                  {driver
                    ? `Motorista confirmou por ${driver.actorName}`
                    : "Motorista ainda não confirmou"}
                </Text>
                {!!passenger.issues.filter((i) => i.status === "OPEN")
                  .length && (
                  <Text style={s.warning}>
                    Há ocorrência aberta, independente das confirmações.
                  </Text>
                )}
              </>
            )}
            <Button
              label={
                state.busy
                  ? "Registrando…"
                  : state.uncertain
                    ? "Verificar estado"
                    : school
                      ? "Escola já confirmou"
                      : row.direction === "OUTBOUND"
                        ? "Recebi na escola"
                        : "Entreguei ao motorista"
              }
              disabled={
                state.busy || (!state.uncertain && !movement?.canConfirm)
              }
              primary
              onPress={() =>
                void (state.uncertain ? verify(row.id) : confirm(row))
              }
            />
            {!movement?.canConfirm && !school && (
              <Text style={s.note}>
                {movement?.blockedReason ||
                  (trip
                    ? "Aguardando motorista iniciar a viagem."
                    : "Aguardando o transporte preparar a viagem.")}
              </Text>
            )}
            {!!state.error && <Text style={s.error}>{state.error}</Text>}
            <Button
              label={
                expanded === row.id
                  ? "Recolher detalhes"
                  : "Detalhes e histórico"
              }
              onPress={() => setExpanded(expanded === row.id ? "" : row.id)}
            />
            {expanded === row.id && (
              <View>
                {movement?.confirmations.map((c) => (
                  <Text key={c.id} style={s.note}>
                    {c.actorName} ·{" "}
                    {new Date(c.receivedAt).toLocaleString("pt-BR")}
                    {c.correctionStatus === "APPROVED"
                      ? " · invalidada por correção"
                      : c.correctionStatus === "PENDING"
                        ? " · correção em análise"
                        : ""}
                  </Text>
                ))}
                {passenger?.alerts
                  ?.filter((a) => !["RESOLVED", "CANCELLED"].includes(a.status))
                  .map((a) => (
                    <Button
                      key={a.id}
                      label={alertKinds[a.kind] || "Abrir ocorrência"}
                      onPress={() => target(row, "alerts", a.id)}
                    />
                  ))}
                <Button
                  label="Abrir histórico desta criança"
                  onPress={() => target(row, "history")}
                />
              </View>
            )}
          </View>
        );
      })}
      {!!selected.filter((r) => category(r) === "NOT_USING").length && (
        <Button
          label={`${showNotUsing ? "Recolher" : "Mostrar"} não utilizarão (${selected.filter((r) => category(r) === "NOT_USING").length})`}
          onPress={() => setShowNotUsing(!showNotUsing)}
        />
      )}
      {!!selected.filter((r) => category(r) === "NOT_EXPECTED").length && (
        <Button
          label={`${showNotExpected ? "Recolher" : "Mostrar"} sem uso previsto (${selected.filter((r) => category(r) === "NOT_EXPECTED").length})`}
          onPress={() => setShowNotExpected(!showNotExpected)}
        />
      )}
      {!loading && !selected.length && !error && (
        <Text style={s.note}>Nenhuma criança neste filtro.</Text>
      )}
    </View>
  );
}
function Button({
  label,
  onPress,
  disabled = false,
  primary = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={[
        s.button,
        (primary || selected) && s.primary,
        disabled && s.disabled,
      ]}
    >
      <Text style={primary || selected ? s.white : s.buttonText}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { gap: 12 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    backgroundColor: "white",
    borderColor: "#d8e2dc",
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    padding: 12,
  },
  card: {
    backgroundColor: "white",
    borderColor: "#dce5de",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  name: { fontSize: 17, fontWeight: "700", color: "#213b35" },
  note: { fontSize: 12, color: "#536c61", lineHeight: 18 },
  status: { color: "#23705b", fontWeight: "600", fontSize: 13 },
  warning: { color: "#855c13", fontSize: 13 },
  error: { color: "#a33131", fontSize: 13 },
  button: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#edf3ef",
    justifyContent: "center",
    alignItems: "center",
  },
  primary: { backgroundColor: "#23705b" },
  disabled: { opacity: 0.55 },
  buttonText: { color: "#23705b", fontWeight: "600", fontSize: 12 },
  white: { color: "white", fontWeight: "600", fontSize: 13 },
});
