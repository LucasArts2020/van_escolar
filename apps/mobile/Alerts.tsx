import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertDetail,
  AlertItem,
  AlertOptions,
  alertLevels,
  alertKinds,
  alertStatuses,
  alertRoutes,
  alertEventLabels,
} from "../shared/alerts";
import { movementRoleLabels } from "../shared/trips";
import { PushClient } from "./push";
import Movements from "./Movements";
import type { JourneyTarget } from "../shared/navigation";
type Context = {
  id: string;
  role: "DRIVER" | "SCHOOL" | "GUARDIAN";
  coordinator?: boolean;
};
export default function Alerts({
  context,
  client,
  initialId = "",
  onOpenTarget,
  onSelect,
  active = true,
}: {
  context: Context;
  client: PushClient;
  initialId?: string;
  onOpenTarget?: (target: JourneyTarget) => void;
  onSelect?: (id: string) => void;
  active?: boolean;
}) {
  const [items, setItems] = useState<AlertItem[]>([]),
    [options, setOptions] = useState<AlertOptions | null>(null),
    [selected, setSelected] = useState(initialId),
    [detail, setDetail] = useState<AlertDetail | null>(null),
    [closed, setClosed] = useState(false),
    [settings, setSettings] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [note, setNote] = useState(""),
    [action, setAction] = useState("CONTACT"),
    [minutes, setMinutes] = useState(["5", "10", "15"]);
  function select(id: string) {
    setSelected(id);
    onSelect?.(id);
  }
  useEffect(() => {
    setSelected(initialId);
  }, [initialId]);
  async function refresh() {
    if (selected) setDetail(await client<AlertDetail>("alerts/" + selected));
    else {
      const [list, opts] = await Promise.all([
        client<{ items: AlertItem[] }>("alerts?closed=" + closed),
        client<AlertOptions>("alerts/options"),
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
    setLoading(true);
    const load = async () => {
      try {
        if (selected) {
          const data = await client<AlertDetail>("alerts/" + selected);
          if (alive) setDetail(data);
        } else {
          const [list, opts] = await Promise.all([
            client<{ items: AlertItem[] }>("alerts?closed=" + closed),
            client<AlertOptions>("alerts/options"),
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
      if (AppState.currentState === "active") void load();
    }, 15000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [selected, closed, context.id, active]);
  useEffect(() => {
    if (options?.policy)
      setMinutes(
        [
          options.policy.reminder_minutes,
          options.policy.attention_minutes,
          options.policy.critical_minutes,
        ].map(String),
      );
  }, [options?.policy?.revision]);
  async function run(fn: () => Promise<void>, text: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(text);
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
  const button = (label: string, fn: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={fn}
      style={[s.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
  function record(type: string, text = note) {
    if (!a) return;
    void run(async () => {
      await client(`alerts/${a.id}/actions`, {
        expectedVersion: a.version,
        type,
        note: text,
      });
      setNote("");
    }, "Acompanhamento registrado. Ler ou assumir não comprova entrega.");
  }
  return (
    <View style={s.root}>
      <Text style={s.title}>
        {selected
          ? "Detalhe da ocorrência"
          : context.coordinator && context.role === "SCHOOL"
            ? "Central da coordenação"
            : "Alertas e ocorrências"}
      </Text>
      <Text style={s.note}>
        Gravidade e atendimento são independentes. Os prazos seguem com o
        aplicativo fechado.
      </Text>
      {button(
        "Atualizar alertas",
        () => void run(async () => {}, "Alertas atualizados."),
      )}
      {error !== "" && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {notice !== "" && <Text style={s.notice}>{notice}</Text>}
      {loading && <ActivityIndicator color="#55708b" />}
      {selected ? (
        button("← Voltar aos alertas", () => select(""))
      ) : (
        <>
          <View style={s.row}>
            {button("Em acompanhamento", () => setClosed(false))}
            {button("Resolvidas", () => setClosed(true))}
          </View>
          {options?.canConfigure && (
            <View style={s.card}>
              {button(
                settings ? "Fechar intervalos" : "Intervalos da operação",
                () => setSettings((v) => !v),
              )}
              {settings && (
                <>
                  <Text style={s.note}>
                    Proposta para teste: 5 / 10 / 15 minutos. Casos abertos
                    preservam seus intervalos. Na primeira configuração,
                    registros anteriores usam o horário original.
                  </Text>
                  {["Lembrete", "Atenção", "Crítico"].map((label, i) => (
                    <View key={label}>
                      <Text style={s.label}>{label} (minutos)</Text>
                      <TextInput
                        accessibilityLabel={label + " em minutos"}
                        style={s.input}
                        keyboardType="number-pad"
                        value={minutes[i]}
                        onChangeText={(v) =>
                          setMinutes((old) =>
                            old.map((x, j) => (j === i ? v : x)),
                          )
                        }
                      />
                    </View>
                  ))}
                  {button(
                    "Salvar intervalos",
                    () =>
                      void run(async () => {
                        setOptions(
                          await client<AlertOptions>("alerts/policy", {
                            expectedRevision: options.policy?.revision || 0,
                            reminderMinutes: Number(minutes[0]),
                            attentionMinutes: Number(minutes[1]),
                            criticalMinutes: Number(minutes[2]),
                          }),
                        );
                      }, "Intervalos registrados."),
                  )}
                </>
              )}
            </View>
          )}
          {items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              style={[
                s.card,
                item.level === 3 && s.critical,
                item.level === 2 && s.attention,
              ]}
              onPress={() => select(item.id)}
            >
              <Text style={s.level}>
                {alertLevels[item.level]} · {alertStatuses[item.status]}
              </Text>
              <Text style={s.child}>{item.student_name}</Text>
              <Text style={s.note}>
                {alertKinds[item.kind]} ·{" "}
                {item.movement_kind === "BOARDING" ? "Embarque" : "Desembarque"}{" "}
                · {item.direction === "OUTBOUND" ? "Ida" : "Volta"}
              </Text>
              <Text style={s.small}>
                Desde{" "}
                {new Date(item.origin_at).toLocaleString("pt-BR", {
                  timeZone: item.timezone,
                })}
                {item.assignedName ? ` · ${item.assignedName}` : ""}
              </Text>
              <Text style={s.link}>Abrir acompanhamento →</Text>
            </Pressable>
          ))}
          {!loading && !items.length && (
            <View style={s.card}>
              <Text style={s.note}>
                {closed
                  ? "Nenhum atendimento encerrado."
                  : "Nenhuma ocorrência em acompanhamento."}
              </Text>
              <Text style={s.small}>
                Sem nenhum registro de parada, o sistema não presume sozinho que
                houve omissão.
              </Text>
            </View>
          )}
        </>
      )}
      {a && detail && (
        <>
          <View
            style={[
              s.card,
              a.level === 3 && s.critical,
              a.level === 2 && s.attention,
            ]}
          >
            <Text style={s.level}>
              {alertLevels[a.level]} · {alertStatuses[a.status]}
            </Text>
            <Text style={s.child}>{a.student_name}</Text>
            <Text style={s.note}>
              {alertKinds[a.kind]} ·{" "}
              {a.movement_kind === "BOARDING" ? "Embarque" : "Desembarque"} ·{" "}
              {a.service_date.split("-").reverse().join("/")} ·{" "}
              {a.direction === "OUTBOUND" ? "Ida" : "Volta"}
            </Text>
            {a.report_note && <Text style={s.note}>{a.report_note}</Text>}
            <Text style={s.small}>Origem: {time(a.origin_at)}</Text>
            <Text style={s.small}>
              Próximo nível:{" "}
              {a.next_due_at ? time(a.next_due_at) : "Sem novo prazo"}
            </Text>
            <Text style={s.note}>
              Atendimento: {a.assignedName || "Ainda não assumido"}
            </Text>
            <Text style={s.note}>
              {a.missingRoles.length
                ? "Falta confirmar: " +
                  a.missingRoles.map((r) => movementRoleLabels[r]).join(" e ") +
                  "."
                : "As duas partes registraram esta movimentação."}
            </Text>
            <Text style={s.route}>{alertRoutes[a.routing_status]}</Text>
            {a.policy_snapshot && (
              <Text style={s.small}>
                Intervalos capturados: {a.policy_snapshot.reminder_minutes} /{" "}
                {a.policy_snapshot.attention_minutes} /{" "}
                {a.policy_snapshot.critical_minutes} min · revisão{" "}
                {a.policy_snapshot.revision}
              </Text>
            )}
            {a.actions.canAssume &&
              button("Assumir acompanhamento", () =>
                record(
                  "ASSUMED",
                  "Assumo o acompanhamento desta ocorrência e verificarei a situação com as partes envolvidas.",
                ),
              )}
            {a.resolution_note && (
              <Text style={s.note}>{a.resolution_note}</Text>
            )}
          </View>
          <Movements
            trip={detail.journey.trip}
            passenger={detail.journey.passenger}
            role={context.role}
            busy={busy}
            focusKind={a.movement_kind}
            onConfirm={(kind) =>
              void run(async () => {
                await client(
                  `trips/${a.trip_id}/passengers/${a.passenger_id}/movements/${kind}/confirm`,
                  {},
                );
              }, "Confirmação registrada.")
            }
          />
          {onOpenTarget &&
            button(
              a.kind === "CORRECTION_CONFLICT"
                ? "Abrir correção desta criança"
                : "Abrir histórico desta criança",
              () =>
                onOpenTarget({
                  view: "history",
                  contextId: context.id,
                  date: a.service_date,
                  studentId: detail.journey.passenger.student_id,
                  tripId: a.trip_id,
                  passengerId: a.passenger_id,
                  alertId: a.id,
                }),
            )}
          {a.actions.canRecord && (
            <View style={s.card}>
              <Text style={s.subtitle}>Registrar acompanhamento</Text>
              <Text style={s.note}>
                Informe um contato realizado ou uma verificação física que você
                efetivamente fez. A anotação não substitui confirmações.
              </Text>
              <View style={s.row}>
                {button(
                  action === "CONTACT"
                    ? "✓ Contato realizado"
                    : "Contato realizado",
                  () => setAction("CONTACT"),
                )}
                {button(
                  action === "VERIFICATION"
                    ? "✓ Verificação física"
                    : "Verificação física",
                  () => setAction("VERIFICATION"),
                )}
              </View>
              <TextInput
                style={[s.input, { minHeight: 100, textAlignVertical: "top" }]}
                accessibilityLabel="Fatos, pessoas contatadas e resultado"
                editable={!busy}
                multiline
                maxLength={2000}
                value={note}
                onChangeText={setNote}
                placeholder="Descreva fatos, pessoas contatadas e resultado (mínimo 20 caracteres)"
              />
              {button(
                "Registrar acompanhamento",
                () => record(action),
                busy || note.trim().length < 20,
              )}
              <Text style={s.small}>{a.actions.resolutionExplanation}</Text>
              {a.actions.canResolve &&
                button(
                  "Encerrar atendimento verificado",
                  () => record("RESOLVED"),
                  busy || note.trim().length < 20,
                )}
            </View>
          )}
          <View style={s.card}>
            <Text style={s.subtitle}>Histórico do atendimento</Text>
            {detail.history.map((e) => (
              <View key={e.id} style={s.history}>
                <Text style={s.small}>{time(e.occurred_at)}</Text>
                <Text style={s.label}>
                  {alertEventLabels[e.type]}
                  {e.details.level !== undefined
                    ? " · " + alertLevels[e.details.level]
                    : ""}
                </Text>
                <Text style={s.note}>{e.actor_name}</Text>
                {e.details.note && <Text style={s.note}>{e.details.note}</Text>}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 16 },
  title: { fontSize: 25, fontWeight: "700", color: "#344b61" },
  note: { fontSize: 13, lineHeight: 22, color: "#6a7d8f" },
  small: { fontSize: 11, lineHeight: 19, color: "#7b8fa1" },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce4eb",
    borderRadius: 20,
    padding: 20,
    gap: 13,
  },
  critical: { borderLeftWidth: 4, borderLeftColor: "#b86560" },
  attention: { borderLeftWidth: 4, borderLeftColor: "#d2a65b" },
  child: { fontSize: 22, fontWeight: "700", color: "#344b61" },
  level: { fontSize: 12, fontWeight: "700", color: "#94604e" },
  label: { fontSize: 13, fontWeight: "600", color: "#496178", marginBottom: 7 },
  subtitle: { fontSize: 17, fontWeight: "700", color: "#40586f" },
  button: {
    padding: 13,
    backgroundColor: "#e8eff5",
    borderWidth: 1,
    borderColor: "#d0dce6",
    borderRadius: 11,
    alignItems: "center",
  },
  buttonText: { fontSize: 12, fontWeight: "600", color: "#45617b" },
  input: {
    borderWidth: 1,
    borderColor: "#d6e0e8",
    backgroundColor: "#fafcfd",
    borderRadius: 11,
    padding: 13,
    fontSize: 14,
    color: "#344b61",
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  error: {
    padding: 14,
    color: "#984e43",
    backgroundColor: "#faeae7",
    borderRadius: 12,
  },
  notice: {
    padding: 14,
    color: "#316b55",
    backgroundColor: "#e9f2ed",
    borderRadius: 12,
  },
  route: { fontSize: 12, color: "#906534", lineHeight: 20 },
  link: { fontSize: 12, fontWeight: "600", color: "#466883" },
  history: {
    borderTopWidth: 1,
    borderTopColor: "#e3eaf0",
    paddingTop: 14,
    gap: 7,
  },
});
