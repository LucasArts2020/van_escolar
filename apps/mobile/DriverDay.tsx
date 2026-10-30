import DriverPreparationSummary from "./DriverPreparationSummary";
import { tripStartBlockReason } from "../shared/trips";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNetworkState } from "expo-network";
import { useDriverDay } from "../shared/use-driver-day";
import { movementPresentation } from "../shared/movement-presentation";
import { tripStatusLabel, type MovementKind } from "../shared/trips";
import type { JourneyTarget } from "../shared/navigation";
import type { DriverTripCard } from "../shared/driver-day";
import type { PushClient } from "./push";
import { alertKinds } from "../shared/alerts";
import Trips from "./Trips";
import { theme } from "./theme";
import TripClosure from "./TripClosure";
import Movements from "./Movements";

export default function DriverDay({
  context,
  client,
  active,
  onOpenTarget,
  target,
}: {
  context: { id: string; role: "DRIVER" | "SCHOOL" | "GUARDIAN" };
  client: PushClient;
  active: boolean;
  onOpenTarget: (target: JourneyTarget) => void;
  target?: JourneyTarget;
}) {
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const network = useNetworkState(),
    offline =
      network.isConnected === false || network.isInternetReachable === false;
  useEffect(() => {
    const s = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => s.remove();
  }, []);
  const state = useDriverDay(
    (path, body, method) => client(path, body, undefined, method),
    active && foreground && !offline,
  );
  const { day, date, trip, rows, busy, selected } = state;
  const startReason = trip ? tripStartBlockReason(trip, context.id) : null;
  const [kind, setKind] = useState<MovementKind>("BOARDING"),
    [search, setSearch] = useState(""),
    [school, setSchool] = useState("");
  const [mode, setMode] = useState<
      "operation" | "prepare" | "manage" | "closure"
    >("operation"),
    [others, setOthers] = useState(false),
    [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showTrips, setShowTrips] = useState(false);
  const [showAttention, setShowAttention] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  useEffect(() => setDateDraft(date), [date]);
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
  useEffect(() => {
    if (selected !== previousTrip.current) {
      setKind("BOARDING");
      setSearch("");
      setSchool("");
      setExpanded({});
      setMode("operation");
      previousTrip.current = selected;
    }
  }, [selected]);
  useEffect(() => {
    if (target?.tripId && target.contextId === context.id)
      state.openTrip(target.tripId);
  }, [target]);
  const action = (
    label: string,
    fn: () => void,
    disabled = false,
    primary = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={fn}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        pressed && !disabled && s.pressed,
        disabled && s.disabled,
      ]}
    >
      <Text
        style={[primary ? s.primaryText : s.link, disabled && s.disabledText]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const targetFor = (
    view: "history" | "alerts",
    p: NonNullable<typeof trip>["passengers"][number],
    alertId?: string,
  ) =>
    onOpenTarget({
      view,
      contextId: context.id,
      date: trip!.service_date,
      studentId: p.student_id,
      tripId: trip!.id,
      passengerId: p.id,
      ...(alertId ? { alertId } : {}),
    });
  const card = (c: DriverTripCard) => (
    <Pressable
      key={c.id}
      accessibilityRole="button"
      onPress={() => state.openTrip(c.id)}
      style={({ pressed }) => [s.trip, pressed && s.pressed]}
    >
      <Text style={s.title}>
        {c.vehicle_name} · {c.vehicle_plate}
      </Text>
      <Text style={s.note}>
        {c.service_date.split("-").reverse().join("/")} ·{" "}
        {c.direction === "OUTBOUND" ? "Ida" : "Volta"} · {c.driver_name}
      </Text>
      <Text style={s.tripStatus}>
        {c.total} crianças · {tripStatusLabel(c.status)}
        {c.review ? ` · ${c.review} a revisar` : ""} →
      </Text>
    </Pressable>
  );
  const pages = (
    key: "page" | "openPage" | "attentionPage",
    info: { page: number; hasMore: boolean },
  ) => (
    <View style={s.actions}>
      {info.page > 0 &&
        action("Página anterior", () =>
          state.setPages((p) => ({ ...p, [key]: info.page - 1 })),
        )}
      {info.hasMore &&
        action("Próxima página", () =>
          state.setPages((p) => ({ ...p, [key]: info.page + 1 })),
        )}
    </View>
  );
  async function inspect() {
    const value = await state.readTrip().catch(() => null);
    if (value) setMode("closure");
  }
  return (
    <View style={s.root}>
      {offline && (
        <Text style={s.warning}>
          Sem conexão. Reconecte para consultar e registrar confirmações.
        </Text>
      )}
      {!!state.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {state.error}
        </Text>
      )}
      {mode === "prepare" || mode === "manage" ? (
        <>
          {action("← Voltar ao Meu dia", () => {
            setMode("operation");
            void state.refresh();
          })}
          <Trips
            key={mode + selected + date}
            context={context}
            client={client}
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
              <View style={s.card}>
                <Text style={s.label}>Dia de trabalho (AAAA-MM-DD)</Text>
                <TextInput
                  accessibilityLabel="Dia de trabalho"
                  style={s.input}
                  value={dateDraft}
                  onChangeText={setDateDraft}
                  onEndEditing={() => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateDraft))
                      state.changeDate(dateDraft);
                    else setDateDraft(date);
                  }}
                  maxLength={10}
                />
                <View style={s.actions}>
                  {action("Hoje", () => day && state.changeDate(day.today))}
                  {action(
                    "Amanhã",
                    () => day && state.changeDate(day.tomorrow),
                  )}
                </View>
                {action(
                  "+ Preparar viagem",
                  () => setMode("prepare"),
                  !date || offline,
                  true,
                )}
              </View>
              {day && (
                <>
                  {!day.attention.total &&
                    !day.openTrips.total &&
                    !day.pendingAcknowledgements && (
                      <Text style={s.note}>
                        Tudo em dia · nenhuma pendência.
                      </Text>
                    )}
                  {action(
                    showTrips
                      ? "Recolher viagens preparadas e abertas"
                      : "Ver viagens preparadas e retomar abertas",
                    () => setShowTrips(!showTrips),
                  )}
                  {!!day.pendingAcknowledgements &&
                    action(
                      `Ciências de urgências pendentes: ${day.pendingAcknowledgements}`,
                      () =>
                        onOpenTarget({
                          view: "alerts",
                          contextId: context.id,
                          date: day.date,
                          awaitingAcknowledgement: true,
                        }),
                    )}
                  {day.attention.total > 0 && (
                    <View style={s.card}>
                      <Text style={s.title}>
                        Pendências ({day.attention.total})
                      </Text>
                      <Text style={s.note}>
                        {day.attention.criticalCount} críticas ·{" "}
                        {day.attention.otherDatesCount} de outras datas
                      </Text>
                      {(showAttention
                        ? day.attention.items
                        : day.attention.items.slice(0, 3)
                      ).map((a) => (
                        <View key={a.id}>
                          {action(
                            `${a.level === 3 ? "Crítico · " : ""}${a.studentName} · ${a.date.split("-").reverse().join("/")} · ${alertKinds[a.kind] || a.kind}`,
                            () =>
                              onOpenTarget({
                                view: "alerts",
                                contextId: context.id,
                                date: a.date,
                                studentId: a.studentId,
                                tripId: a.tripId,
                                passengerId: a.passengerId,
                                alertId: a.id,
                              }),
                          )}
                        </View>
                      ))}
                      {day.attention.total > 3 &&
                        action(
                          showAttention
                            ? "Recolher pendências"
                            : "Ver todas as pendências",
                          () => setShowAttention(!showAttention),
                        )}
                      {showAttention && pages("attentionPage", day.attention)}
                    </View>
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
                  {showTrips && day.openTrips.total > 0 && (
                    <View style={s.card}>
                      <Text style={s.title}>
                        Viagens abertas de outras datas ({day.openTrips.total})
                      </Text>
                      {day.openTrips.items.map(card)}
                      {pages("openPage", day.openTrips)}
                    </View>
                  )}
                  {showTrips && (
                    <View style={s.card}>
                      <Text style={s.title}>Viagens do dia</Text>
                      {action(
                        others
                          ? "Priorizar minhas viagens"
                          : "Outras viagens do transporte",
                        () => setOthers(!others),
                      )}
                      {day.trips.items
                        .filter((c) => others || c.mine)
                        .map(card)}
                      {!day.trips.items.some((c) => others || c.mine) && (
                        <Text style={s.note}>
                          Nenhuma viagem atribuída nesta página. Consulte as
                          demais viagens ou prepare uma viagem.
                        </Text>
                      )}
                      {pages("page", day.trips)}
                    </View>
                  )}
                </>
              )}
              {!day &&
                action(
                  state.loading ? "Carregando seu dia…" : "Tentar atualizar",
                  () => void state.refresh(),
                  state.loading,
                )}
            </>
          )}
          {!!selected && (
            <>
              {action("← Voltar às viagens", () => state.openTrip(""))}
              {!trip && <Text style={s.note}>Consultando a viagem…</Text>}
              {trip && (
                <>
                  <View style={s.card}>
                    <Text style={s.label}>
                      {trip.direction === "OUTBOUND"
                        ? "IDA · CASA → ESCOLA"
                        : "VOLTA · ESCOLA → CASA"}
                    </Text>
                    <Text style={s.title}>
                      {trip.vehicle_name} · {trip.vehicle_plate}
                    </Text>
                    <Text style={s.note}>
                      {trip.driver_name} ·{" "}
                      {trip.service_date.split("-").reverse().join("/")}
                    </Text>
                    <Text style={s.label}>
                      {tripStatusLabel(
                        trip.status,
                        trip.closure.exceptional > 0,
                      )}
                    </Text>
                    {trip.status === "PLANNED" &&
                      action(
                        "Iniciar viagem",
                        () => void state.start(),
                        busy || offline || !!startReason,
                        true,
                      )}
                    {trip.closure.canInspect &&
                      action(
                        "Conferência e encerramento",
                        () => void inspect(),
                        busy || offline,
                      )}
                    {action(
                      "Ajustar viagem e destinações",
                      () => setMode("manage"),
                      busy,
                    )}
                  </View>
                  {trip.status === "PLANNED" && startReason && (
                    <View style={s.card}>
                      <Text style={s.title}>Antes de iniciar</Text>
                      <Text style={s.warning}>{startReason}</Text>
                      {trip.counts.review > 0 &&
                        action(
                          "Revisar participações",
                          () => setMode("manage"),
                          busy,
                        )}
                    </View>
                  )}
                  {mode === "closure" ? (
                    <View style={s.card}>
                      {action("← Voltar às confirmações", () =>
                        setMode("operation"),
                      )}
                      <TripClosure
                        trip={trip}
                        busy={busy}
                        onClose={state.close}
                      />
                    </View>
                  ) : (
                    <>
                      <View style={s.card}>
                        <View style={s.segmented}>
                          {(["BOARDING", "ALIGHTING"] as const).map((k) => (
                            <Pressable
                              key={k}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: kind === k }}
                              onPress={() => setKind(k)}
                              style={({ pressed }) => [
                                s.button,
                                s.segmentButton,
                                kind === k && s.primary,
                                pressed && s.pressed,
                              ]}
                            >
                              <Text style={kind === k ? s.primaryText : s.link}>
                                {k === "BOARDING" ? "Embarque" : "Desembarque"}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={s.note}>
                          {trip.counts.expected} incluídos ·{" "}
                          {kind === "BOARDING"
                            ? trip.counts.boardingValidated
                            : trip.counts.delivered}{" "}
                          com dupla confirmação · {trip.counts.openIssues}{" "}
                          ocorrências
                        </Text>
                        <TextInput
                          accessibilityLabel="Buscar criança"
                          placeholder="Nome ou identificação"
                          placeholderTextColor={theme.color.muted}
                          style={s.input}
                          value={search}
                          onChangeText={setSearch}
                        />
                        <Text style={s.label}>Escola</Text>
                        <View style={s.actions}>
                          {action("Todas", () => setSchool(""), false, !school)}
                          {Array.from(
                            new Set(trip.passengers.map((p) => p.school_name)),
                          ).map((name) => (
                            <View key={name}>
                              {action(
                                name,
                                () => setSchool(name),
                                false,
                                school === name,
                              )}
                            </View>
                          ))}
                        </View>
                      </View>
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
                          const disabled =
                            !!row.busy ||
                            busy ||
                            offline ||
                            (!row.uncertain &&
                              !presentation.movement.canConfirm);
                          return (
                            <View style={s.card} key={p.id}>
                              <Text style={s.title}>{p.student_name}</Text>
                              <Text style={s.note}>
                                {p.school_name} · Identificação{" "}
                                {p.student_id.slice(-8)}
                              </Text>
                              <Text
                                style={[
                                  s.movementStatus,
                                  presentation.pendingReview
                                    ? s.warning
                                    : s.note,
                                ]}
                              >
                                {presentation.status}
                              </Text>
                              {trip.status === "PLANNED" &&
                                p.disposition === "REVIEW_REQUIRED" &&
                                action(
                                  `Revisar participação de ${p.student_name}`,
                                  () => setMode("manage"),
                                  busy,
                                )}
                              <Text style={[s.warning, { minHeight: 20 }]}>
                                {presentation.hasOccurrence
                                  ? "Ocorrência aberta · ver detalhes"
                                  : ""}
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${presentation.actionLabel}: ${p.student_name}, identificação ${p.student_id.slice(-8)}, ${trip.service_date}`}
                                accessibilityState={{
                                  disabled,
                                  busy: !!row.busy,
                                }}
                                disabled={disabled}
                                style={({ pressed }) => [
                                  s.button,
                                  s.primary,
                                  pressed && !disabled && s.pressed,
                                  disabled && s.disabled,
                                ]}
                                onPress={() => void state.confirm(p.id, kind)}
                              >
                                <Text
                                  style={[
                                    s.primaryText,
                                    disabled && s.disabledText,
                                  ]}
                                >
                                  {row.busy
                                    ? "Registrando…"
                                    : row.uncertain
                                      ? "Verificar estado"
                                      : presentation.actionLabel}
                                </Text>
                              </Pressable>
                              {!presentation.movement.canConfirm &&
                                !presentation.record && (
                                  <Text style={s.note}>
                                    {presentation.movement.blockedReason}
                                  </Text>
                                )}
                              {!!row.error && (
                                <Text
                                  accessibilityRole="alert"
                                  style={s.warning}
                                >
                                  {row.error}
                                </Text>
                              )}
                              <Text style={[s.note, { minHeight: 20 }]}>
                                {row.notice || ""}
                              </Text>
                              {action(
                                expanded[p.id]
                                  ? "Recolher detalhes"
                                  : "Autores, horários e histórico",
                                () =>
                                  setExpanded((old) => ({
                                    ...old,
                                    [p.id]: !old[p.id],
                                  })),
                              )}
                              {expanded[p.id] && (
                                <>
                                  <Movements
                                    trip={trip}
                                    passenger={p}
                                    role="DRIVER"
                                    busy={!!row.busy}
                                    onConfirm={() => {}}
                                    client={client}
                                    hideConfirm
                                  />
                                  {action(
                                    "Histórico e correções desta criança",
                                    () => targetFor("history", p),
                                  )}
                                  {(p.alerts || [])
                                    .filter((a) => a.status !== "RESOLVED")
                                    .map((a) => (
                                      <View key={a.id}>
                                        {action(
                                          alertKinds[a.kind] ||
                                            "Atender ocorrência",
                                          () => targetFor("alerts", p, a.id),
                                        )}
                                      </View>
                                    ))}
                                </>
                              )}
                            </View>
                          );
                        })}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  movementStatus: { minHeight: 40 },
  root: { gap: 16 },
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.card,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
    color: theme.color.ink,
  },
  label: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.color.muted,
    fontWeight: "700",
  },
  note: { fontSize: 13, color: theme.color.muted, lineHeight: 20 },
  warning: { color: theme.color.warning, lineHeight: 20, fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    minHeight: 50,
    backgroundColor: theme.color.background,
    borderColor: theme.color.line,
    borderWidth: 1,
    borderRadius: theme.radius.control,
    padding: 13,
    fontSize: 14,
    color: theme.color.ink,
  },
  button: {
    minHeight: 48,
    borderRadius: theme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.color.soft,
  },
  segmented: {
    flexDirection: "row",
    gap: 5,
    padding: 5,
    backgroundColor: theme.color.background,
    borderRadius: 16,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    backgroundColor: "transparent",
  },
  primary: { backgroundColor: theme.color.primary },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  link: {
    color: theme.color.primary,
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  disabled: { backgroundColor: theme.color.disabled },
  disabledText: { color: theme.color.muted },
  pressed: { opacity: 0.78 },
  trip: {
    backgroundColor: theme.color.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.primary,
    padding: 16,
    gap: 7,
    minHeight: 108,
  },
  tripStatus: {
    color: theme.color.primary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
});
