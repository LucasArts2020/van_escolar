import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ChildrenHome,
  Inbox,
  Journey,
  pushLabels,
  shortDate,
} from "../shared/notifications";
import {
  MovementKind,
  passengerMovementLabels,
  movementRoleLabels,
} from "../shared/trips";
import Movements from "./Movements";
import { registerPush, unregisterPush, PushClient } from "./push";
type Context = { id: string; role: "GUARDIAN" | "DRIVER" | "SCHOOL" };
export default function Notifications({
  context,
  client,
  home = false,
  initialId = "",
  onOpenAlert,
}: {
  context: Context;
  client: PushClient;
  home?: boolean;
  initialId?: string;
  onOpenAlert?: (id: string) => void;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(null),
    [children, setChildren] = useState<ChildrenHome | null>(null);
  const [selection, setSelection] = useState(
    initialId
      ? { kind: "notification", id: initialId }
      : (null as null | { kind: string; id: string }),
  );
  const [journey, setJourney] = useState<Journey | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const path = selection
    ? "notifications/" +
      (selection.kind === "child" ? "children/" : "") +
      selection.id
    : "";
  async function load() {
    if (path) setJourney(await client<Journey>(path));
    else if (home)
      setChildren(await client<ChildrenHome>("notifications/home"));
    else setInbox(await client<Inbox>("notifications"));
  }
  useEffect(() => {
    let alive = true;
    setJourney(null);
    setError("");
    setLoaded(false);
    const refresh = async () => {
      try {
        const result = path
          ? await client<Journey>(path)
          : home
            ? await client<ChildrenHome>("notifications/home")
            : await client<Inbox>("notifications");
        if (!alive) return;
        if (path) setJourney(result as Journey);
        else if (home) setChildren(result as ChildrenHome);
        else setInbox(result as Inbox);
        setError("");
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setJourney(null);
          setInbox(null);
          setChildren(null);
        }
      } finally {
        if (alive) setLoaded(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [context.id, path, home]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(kind: MovementKind) {
    if (!journey) return;
    await client(
      `trips/${journey.trip.id}/passengers/${journey.passenger.id}/movements/${kind}/confirm`,
      {},
    );
  }
  const time = (at: string, timezone?: string) =>
    new Date(at).toLocaleString("pt-BR", {
      timeZone: timezone || journey?.trip.timezone || "America/Sao_Paulo",
    });
  const button = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      style={s.button}
      disabled={busy}
      onPress={onPress}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.root}>
      <View>
        <Text style={s.eyebrow}>
          {home ? "SEUS FILHOS, EM CADA ETAPA" : "ATUALIZAÇÕES DO SEU CONTEXTO"}
        </Text>
        <Text style={s.title}>
          {selection
            ? "Acompanhar criança"
            : home
              ? "Como está o caminho?"
              : "Notificações"}
        </Text>
        <Text style={s.note}>
          {home
            ? "Última viagem e confirmações de cada filho."
            : `${inbox?.unread || 0} não lidas · atualização a cada 15 segundos`}
        </Text>
      </View>
      {button("Atualizar", () => void run(async () => {}))}
      {selection && button("← Voltar", () => setSelection(null))}
      {error !== "" && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {notice !== "" && <Text style={s.success}>{notice}</Text>}
      {!loaded && <ActivityIndicator color="#536d86" />}
      {!selection &&
        home &&
        children?.children.map((child) => (
          <View style={s.card} key={child.id}>
            <Text style={s.child}>{child.name}</Text>
            {child.current ? (
              <>
                <Text style={s.state}>
                  {passengerMovementLabels[child.current.state]}
                </Text>
                <Text style={s.note}>
                  {shortDate(child.current.date)} ·{" "}
                  {child.current.direction === "OUTBOUND"
                    ? "Ida à escola"
                    : "Volta para casa"}
                </Text>
                {child.current.possiblyOnboard && (
                  <Text style={s.pending}>Possivelmente a bordo</Text>
                )}
                {child.current.deliveryUnderReview && (
                  <Text style={s.pending}>
                    Recebimento sob verificação · relato de risco aberto
                  </Text>
                )}
                {child.current.openIssues > 0 && (
                  <Text style={s.pending}>
                    {child.current.openIssues} ocorrência(s) aberta(s)
                  </Text>
                )}
                {child.current.movements
                  .filter((m) => m.state === "INFORMED")
                  .map((m) => (
                    <Text key={m.kind} style={s.note}>
                      {m.kind === "BOARDING" ? "Embarque" : "Desembarque"}:
                      falta{" "}
                      {m.missingRoles
                        .map((r) => movementRoleLabels[r])
                        .join(" e ")
                        .toLowerCase()}
                      .
                    </Text>
                  ))}
                {button("Acompanhar viagem →", () =>
                  setSelection({
                    kind: "child",
                    id: child.current!.passengerId,
                  }),
                )}
              </>
            ) : (
              <Text style={s.note}>
                Sem viagem registrada até hoje. Consulte o planejamento para os
                próximos dias.
              </Text>
            )}
          </View>
        ))}
      {!selection && home && children?.children.length === 0 && (
        <Text style={s.note}>Nenhum filho com vínculo operacional ativo.</Text>
      )}
      {!selection && !home && (
        <>
          <View style={s.card}>
            <Text style={s.subtitle}>Atualizações no celular</Text>
            <Text style={s.note}>
              Receba avisos no aparelho e abra os detalhes com seu acesso
              individual.
            </Text>
            {button(
              "Ativar neste aparelho",
              () =>
                void run(async () => {
                  await registerPush(client);
                  setNotice(
                    "Aparelho registrado. O envio depende da configuração do servidor.",
                  );
                }),
            )}
            {button(
              "Desativar neste aparelho",
              () =>
                void run(async () => {
                  await unregisterPush(client);
                  setNotice("Envios desativados neste aparelho.");
                }),
            )}
          </View>
          {inbox?.items.map((n) => (
            <Pressable
              accessibilityRole="button"
              style={[s.card, !n.readAt && s.unread]}
              key={n.id}
              onPress={() => setSelection({ kind: "notification", id: n.id })}
            >
              <Text style={s.subtitle}>{n.title}</Text>
              <Text style={s.note}>
                {n.studentName} · {shortDate(n.target.date)} ·{" "}
                {n.target.direction === "OUTBOUND" ? "Ida" : "Volta"}
              </Text>
              <Text style={s.body}>{n.body}</Text>
              <Text style={s.state}>
                {n.pending
                  ? "Sua confirmação está pendente"
                  : n.purpose === "ACTION"
                    ? "Ação não está mais pendente"
                    : "Atualização de acompanhamento"}
              </Text>
              <Text style={s.small}>
                {time(n.createdAt, n.timezone)} ·{" "}
                {n.readAt ? "Lida" : "Não lida"} →
              </Text>
            </Pressable>
          ))}
          {inbox?.items.length === 0 && (
            <View style={s.card}>
              <Text style={s.subtitle}>Tudo acompanhado por aqui.</Text>
              <Text style={s.note}>
                Novas confirmações e ocorrências aparecerão nesta central.
              </Text>
            </View>
          )}
          {inbox?.hasMore && (
            <Text style={s.note}>
              Exibindo as 50 atualizações mais recentes. Consulte a linha do
              tempo para o histórico.
            </Text>
          )}
        </>
      )}
      {journey && (
        <>
          {journey.notification && (
            <View style={[s.card, s.unread]}>
              <Text style={s.eyebrow}>REGISTRO DA ATUALIZAÇÃO</Text>
              <Text style={s.subtitle}>{journey.notification.title}</Text>
              {journey.notification.target.alertId &&
                onOpenAlert &&
                button("Abrir ocorrência e acompanhamento", () =>
                  onOpenAlert(journey.notification!.target.alertId!),
                )}
              <Text style={s.body}>{journey.notification.body}</Text>
              <Text style={s.note}>{time(journey.notification.createdAt)}</Text>
              <Text style={s.state}>
                {journey.notification.pending
                  ? "Sua confirmação está pendente agora."
                  : "Nenhuma confirmação sua é cobrada por esta mensagem agora."}
              </Text>
              {!journey.notification.readAt ? (
                button(
                  "Marcar como lida",
                  () =>
                    void run(async () => {
                      await client(
                        `notifications/${journey.notification!.id}/read`,
                        {},
                      );
                    }),
                )
              ) : (
                <Text style={s.small}>
                  Lida em {time(journey.notification.readAt)}
                </Text>
              )}
              <Text style={s.small}>
                Ler não confirma movimentação nem resolve ocorrência.
              </Text>
            </View>
          )}
          <Text style={s.child}>{journey.passenger.student_name}</Text>
          <Text style={s.note}>
            {shortDate(journey.trip.service_date)} ·{" "}
            {journey.trip.direction === "OUTBOUND"
              ? "Ida à escola"
              : "Volta para casa"}{" "}
            · {journey.passenger.school_name}
          </Text>
          <Movements
            client={client}
            trip={journey.trip}
            passenger={journey.passenger}
            role={context.role}
            busy={busy}
            onConfirm={(kind) => void run(() => confirm(kind))}
            focusKind={journey.notification?.target.kind}
          />
          <View style={s.card}>
            <Text style={s.subtitle}>Linha do tempo desta criança</Text>
            <Text style={s.small}>
              Horários no fuso {journey.trip.timezone}.
            </Text>
            {journey.timeline.map((item) => (
              <View key={item.id} style={s.timeline}>
                <Text style={s.small}>{time(item.at)}</Text>
                <Text style={s.subtitle}>{item.title}</Text>
                <Text style={s.note}>{item.body}</Text>
              </View>
            ))}
            {!journey.timeline.length && (
              <Text style={s.note}>
                Aguardando o primeiro registro de movimentação.
              </Text>
            )}
          </View>
          {journey.notification && (
            <View style={s.card}>
              <Text style={s.subtitle}>Envio ao celular</Text>
              <Text style={s.note}>
                {pushLabels[journey.notification.pushNote] ||
                  journey.notification.pushNote}
              </Text>
              {journey.notification.deliveries.map((d) => (
                <Text key={d.id} style={s.note}>
                  {pushLabels[d.status] || d.status} · {d.attempts} tentativa(s)
                  de envio · {d.receipt_attempts} consulta(s) de recibo{" "}
                  {d.error_code ? `· ${d.error_code}` : ""}
                </Text>
              ))}
              {journey.attempts?.map((a, i) => (
                <Text key={i} style={s.small}>
                  {time(a.created_at)} ·{" "}
                  {a.phase === "SEND" ? "Envio" : "Recibo"} {a.attempt} ·{" "}
                  {a.error_code || pushLabels[a.status] || a.status}
                </Text>
              ))}
              <Text style={s.small}>
                Aceitação pelo provedor não comprova exibição ou leitura no
                aparelho.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 16 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#344b61",
    marginVertical: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#76899b",
  },
  note: { fontSize: 13, color: "#687c8e", lineHeight: 21 },
  small: { fontSize: 11, color: "#748698", lineHeight: 18 },
  body: { fontSize: 14, color: "#40556a", lineHeight: 23 },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce4ec",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  unread: { backgroundColor: "#edf2f7" },
  child: { fontSize: 22, fontWeight: "700", color: "#344b61" },
  subtitle: { fontSize: 15, fontWeight: "700", color: "#40566d" },
  state: { fontSize: 13, fontWeight: "600", color: "#2b705b", lineHeight: 21 },
  pending: { fontSize: 13, color: "#876332" },
  button: {
    borderRadius: 12,
    padding: 13,
    backgroundColor: "#e1e9f1",
    alignItems: "center",
  },
  buttonText: { fontSize: 13, fontWeight: "600", color: "#415d77" },
  timeline: {
    borderLeftWidth: 2,
    borderLeftColor: "#c7d5e2",
    paddingLeft: 16,
    paddingVertical: 8,
    gap: 6,
  },
  error: {
    color: "#994b43",
    padding: 14,
    backgroundColor: "#f9ece9",
    borderRadius: 12,
  },
  success: {
    color: "#276651",
    padding: 14,
    backgroundColor: "#e5f1eb",
    borderRadius: 12,
  },
});
