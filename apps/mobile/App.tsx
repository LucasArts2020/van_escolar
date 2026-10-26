import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import Registry from "./Registry";
import Planning from "./Planning";
import Trips from "./Trips";
import History from "./History";
import Operation from "./Operation";
import Notifications from "./Notifications";
import Alerts from "./Alerts";
import SchoolCentral from "./SchoolCentral";
import type { JourneyTarget } from "../shared/navigation";
import { notificationsModule, registerPush } from "./push";
type Context = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: "GUARDIAN" | "DRIVER" | "SCHOOL";
  coordinator: boolean;
  manage_team: boolean;
};
type Me = { user: { name: string; email: string }; contexts: Context[] };
const labels = {
  GUARDIAN: "Responsável",
  DRIVER: "Motorista",
  SCHOOL: "Escola",
};
const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";
const storeKey = "caminho.session";
export default function App() {
  const [session, setSession] = useState<string | null>(null),
    [me, setMe] = useState<Me | null>(null),
    [context, setContext] = useState<Context | null>(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [boot, setBoot] = useState(true);
  const [view, setView] = useState("home"),
    [flow, setFlow] = useState("login"),
    [linkToken, setLinkToken] = useState("");
  const [pendingNotification, setPendingNotification] = useState<{
      id: string;
      context: string;
    } | null>(null),
    [notificationId, setNotificationId] = useState("");
  const [notificationVisit, setNotificationVisit] = useState(0);
  const [alertId, setAlertId] = useState(""),
    [alertVisit, setAlertVisit] = useState(0);
  const [journeyTarget, setJourneyTarget] = useState<JourneyTarget | null>(
    null,
  );
  const [canGoBack, setCanGoBack] = useState(false),
    [schoolAlertsContext, setSchoolAlertsContext] = useState("");
  const schoolReturns = useRef<
    Array<{
      view: string;
      target: JourneyTarget | null;
      alertId: string;
      notificationId: string;
      position: number;
    }>
  >([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    scrollPosition = useRef(0),
    schoolPosition = useRef(0);
  function saveSchoolReturn() {
    if (context?.role !== "SCHOOL") return;
    schoolReturns.current.push({
      view,
      target: journeyTarget,
      alertId,
      notificationId,
      position: scrollPosition.current,
    });
    setCanGoBack(true);
  }
  function clearSchoolReturns() {
    schoolReturns.current = [];
    setCanGoBack(false);
  }
  function openSchoolTarget(target: JourneyTarget) {
    if (target.contextId !== context?.id) return;
    if (view === "home") schoolPosition.current = scrollPosition.current;
    saveSchoolReturn();
    setJourneyTarget(target);
    if (target.view === "alerts") {
      setAlertId(target.alertId || "");
      setAlertVisit((v) => v + 1);
    }
    setView(target.view);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function returnToSchool() {
    clearSchoolReturns();
    setJourneyTarget(null);
    setView("home");
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: schoolPosition.current, animated: false }),
    );
  }
  function returnToPreviousSchoolPoint() {
    const previous = schoolReturns.current.pop();
    if (!previous) returnToSchool();
    else {
      setJourneyTarget(previous.target);
      setAlertId(previous.alertId);
      setNotificationId(previous.notificationId);
      setCanGoBack(schoolReturns.current.length > 0);
      setView(previous.view);
      requestAnimationFrame(() =>
        scroll.current?.scrollTo({ y: previous.position, animated: false }),
      );
    }
  }
  useEffect(() => {
    clearSchoolReturns();
    setJourneyTarget(null);
    setSchoolAlertsContext("");
    schoolPosition.current = 0;
    scrollPosition.current = 0;
  }, [context?.id, session]);
  useEffect(() => {
    if (context?.role === "SCHOOL" && view === "alerts")
      setSchoolAlertsContext(context.id);
  }, [context?.id, view]);
  async function api<T>(
    path: string,
    body?: unknown,
    auth: string | null = session,
    method = body ? "POST" : "GET",
  ): Promise<T> {
    const res = await fetch(base + "/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Client": "mobile",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
        ...(context ? { "X-Context-Id": context.id } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok)
      throw Object.assign(
        new Error(data.message || "Não foi possível continuar."),
        { status: res.status },
      );
    return data;
  }
  async function refresh(auth: string) {
    const data = await api<Me>("auth/me", undefined, auth);
    setMe(data);
    setName(data.user.name);
    setContext(
      (old) =>
        data.contexts.find((c) => c.id === old?.id) || data.contexts[0] || null,
    );
  }
  useEffect(() => {
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(storeKey);
        if (value) {
          setSession(value);
          await refresh(value);
        }
      } catch {
        setError(
          "Não foi possível restaurar a sessão. Entre novamente ou verifique sua conexão.",
        );
      } finally {
        setBoot(false);
      }
    })();
  }, []);
  useEffect(() => {
    let alive = true,
      subscription: { remove: () => void } | undefined;
    void notificationsModule()
      .then((module) => {
        if (!module || !alive) return;
        module.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        const receive = (
          response: import("expo-notifications").NotificationResponse,
        ) => {
          const data = response.notification.request.content.data || {};
          if (
            typeof data.notificationId === "string" &&
            typeof data.membershipId === "string" &&
            /^[0-9a-f-]{36}$/i.test(data.notificationId)
          )
            setPendingNotification({
              id: data.notificationId,
              context: data.membershipId,
            });
          module.clearLastNotificationResponse();
        };
        subscription = module.addNotificationResponseReceivedListener(receive);
        const last = module.getLastNotificationResponse();
        if (last) receive(last);
      })
      .catch(() => {});
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, []);
  useEffect(() => {
    if (!me || !pendingNotification) return;
    const allowed = me.contexts.find(
      (c) => c.id === pendingNotification.context,
    );
    if (allowed) {
      clearSchoolReturns();
      setJourneyTarget(null);
      setContext(allowed);
      setNotificationId(pendingNotification.id);
      setNotificationVisit((v) => v + 1);
      setView("notifications");
    } else
      setError("A atualização não está disponível nos seus contextos atuais.");
    setPendingNotification(null);
  }, [me, pendingNotification]);
  useEffect(() => {
    if (!session || !context) return;
    const refresh = () => void registerPush(api, false).catch(() => {});
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    let alive = true,
      tokenSubscription: { remove: () => void } | undefined;
    void notificationsModule()
      .then((module) => {
        if (module && alive)
          tokenSubscription = module.addPushTokenListener(refresh);
      })
      .catch(() => {});
    return () => {
      alive = false;
      subscription.remove();
      tokenSubscription?.remove();
    };
  }, [session, context?.id]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Sem conexão com a API. Verifique o endereço e a rede Wi-Fi."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    await run(async () => {
      if (flow === "login") {
        const data = await api<{ token: string }>(
          "auth/login",
          { email, password },
          null,
        );
        await SecureStore.setItemAsync(storeKey, data.token);
        setSession(data.token);
        await refresh(data.token);
        setPassword("");
      } else if (flow === "recovery") {
        const data = await api<{ message: string }>(
          "auth/recovery",
          { email },
          null,
        );
        setNotice(
          data.message + " No teste local, consulte o terminal da API.",
        );
      } else {
        await api(
          "auth/" + (flow === "reset" ? "reset" : "accept-invite"),
          {
            token: linkToken,
            password,
            ...(flow === "invite" ? { name } : {}),
          },
          null,
        );
        setPassword("");
        setLinkToken("");
        setFlow("login");
        setNotice("Tudo certo. Entre com sua conta.");
      }
    });
  }
  async function switchContext(c: Context) {
    await run(async () => {
      const res = await fetch(base + "/workspace", {
        headers: { Authorization: "Bearer " + session, "X-Context-Id": c.id },
      });
      if (!res.ok) throw new Error("Este vínculo não está mais disponível.");
      setContext(c);
      setJourneyTarget(null);
      schoolPosition.current = 0;
      setView("home");
    });
  }
  if (boot)
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator size="large" color="#23705b" />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          onScroll={(event) => {
            scrollPosition.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={100}
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.brandRow}>
            <View style={s.brandIcon}>
              <Text style={{ color: "white", fontSize: 24 }}>↝</Text>
            </View>
            <Text style={s.brand}>
              caminho<Text style={{ color: "#bda56a" }}>.</Text>
            </Text>
          </View>
          {!me ? (
            <>
              <Text style={s.eyebrow}>ESCOLA, TRANSPORTE E FAMÍLIA</Text>
              <Text style={s.title}>
                {flow === "login"
                  ? "O cuidado começa\nno caminho."
                  : flow === "recovery"
                    ? "Recupere seu acesso."
                    : flow === "invite"
                      ? "Aceite seu convite."
                      : "Crie uma nova senha."}
              </Text>
              <Text style={s.description}>
                Escola, motorista e família conectados pelo cuidado.
              </Text>
              {(flow === "login" || flow === "recovery") && (
                <>
                  <Text style={s.label}>E-mail</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="E-mail"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="voce@exemplo.com.br"
                  />
                </>
              )}
              {(flow === "invite" || flow === "reset") && (
                <>
                  <Text style={s.label}>Token do link recebido</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Token"
                    autoCapitalize="none"
                    value={linkToken}
                    onChangeText={setLinkToken}
                    placeholder="Cole somente o token do link"
                  />
                </>
              )}
              {flow === "invite" && (
                <>
                  <Text style={s.label}>Nome completo</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Nome completo"
                    autoComplete="name"
                    value={name}
                    onChangeText={setName}
                  />
                  <Text style={s.note}>
                    Se já possui conta, informe sua senha atual.
                  </Text>
                </>
              )}
              {flow !== "recovery" && (
                <>
                  <Text style={s.label}>
                    {flow === "reset" ? "Nova senha" : "Senha"}
                  </Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Senha"
                    secureTextEntry
                    autoComplete={
                      flow === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChangeText={setPassword}
                    placeholder={
                      flow === "login"
                        ? "Digite sua senha"
                        : "Pelo menos 12 caracteres"
                    }
                  />
                </>
              )}
              <Action
                title={
                  flow === "login"
                    ? "Entrar na minha conta →"
                    : flow === "recovery"
                      ? "Solicitar recuperação"
                      : "Concluir"
                }
                busy={busy}
                onPress={submit}
              />
              <View style={s.flowButtons}>
                {flow === "login" ? (
                  <>
                    <Link
                      title="Esqueci minha senha"
                      onPress={() => {
                        setFlow("recovery");
                        setError("");
                      }}
                    />
                    <Link
                      title="Tenho um convite"
                      onPress={() => setFlow("invite")}
                    />
                    <Link
                      title="Tenho um token de recuperação"
                      onPress={() => setFlow("reset")}
                    />
                  </>
                ) : (
                  <Link
                    title="Voltar para entrar"
                    onPress={() => {
                      setFlow("login");
                      setError("");
                      setNotice("");
                    }}
                  />
                )}
              </View>
              <View style={s.card}>
                <Text style={s.eyebrow}>AMBIENTE DE TESTE</Text>
                <Text style={s.note}>
                  Contas fictícias: motorista@demo.local e
                  responsavel@demo.local
                </Text>
                <Text style={s.note}>Senha: Caminho@2026!</Text>
                <View style={s.demoRow}>
                  {["motorista", "responsavel"].map((d) => (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      style={s.chip}
                      onPress={() => {
                        setEmail(d + "@demo.local");
                        setPassword("Caminho@2026!");
                        setFlow("login");
                      }}
                    >
                      <Text style={s.link}>
                        {d === "motorista" ? "Motorista" : "Responsável"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              {context?.role === "SCHOOL" && (
                <View style={s.tabs}>
                  <Link
                    title="Mensagens"
                    onPress={() => {
                      clearSchoolReturns();
                      setJourneyTarget(null);
                      setNotificationId("");
                      setNotificationVisit((v) => v + 1);
                      setView("notifications");
                    }}
                  />
                  <Link
                    title={context.organization_name + " · trocar contexto"}
                    onPress={() => {
                      clearSchoolReturns();
                      setJourneyTarget(null);
                      setView("contexts");
                    }}
                  />
                  <Link
                    title="Meu perfil"
                    onPress={() => {
                      clearSchoolReturns();
                      setJourneyTarget(null);
                      setView("profile");
                    }}
                  />
                </View>
              )}
              <View style={s.tabs}>
                {(context?.role === "SCHOOL"
                  ? [
                      ["home", "Central"],
                      ["registry", "Alunos e transportes"],
                      ["more", "Mais"],
                    ]
                  : [
                      ["home", "Meu espaço"],
                      ["notifications", "Notificações"],
                      ["alerts", "Alertas"],
                      ["trips", "Viagens"],
                      ["history", "Histórico"],
                      ["operation", "Preparação"],
                      ["planning", "Planejamento"],
                      [
                        "registry",
                        context?.role === "GUARDIAN" ? "Filhos" : "Cadastros",
                      ],
                      ["contexts", "Contextos"],
                      ["profile", "Meu perfil"],
                    ]
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[s.tab, view === key && s.tabSelected]}
                    onPress={() => {
                      setNotificationId("");
                      if (key === "alerts") {
                        setAlertId("");
                        setAlertVisit((v) => v + 1);
                      }
                      if (key === "notifications")
                        setNotificationVisit((v) => v + 1);
                      if (context?.role === "SCHOOL" && key === "home")
                        returnToSchool();
                      else {
                        clearSchoolReturns();
                        setJourneyTarget(null);
                        setView(key);
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={s.link}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.eyebrow}>
                {context
                  ? labels[context.role].toUpperCase()
                  : "SEM VÍNCULO ATIVO"}
              </Text>
              <Text style={s.title}>
                {context?.role === "SCHOOL" && view === "home"
                  ? "Central da escola."
                  : view === "more"
                    ? "Mais."
                    : view === "operation"
                      ? "Preparação para operação."
                      : view === "profile"
                        ? "Seu perfil."
                        : view === "notifications"
                          ? "Cada atualização, mais cuidado."
                          : view === "alerts"
                            ? "Alertas e ocorrências."
                            : view === "history"
                              ? "Histórico e correções."
                              : view === "trips"
                                ? "Viagens e passageiros."
                                : view === "planning"
                                  ? "Rotina e planejamento."
                                  : view === "registry"
                                    ? context?.role === "GUARDIAN"
                                      ? "Seus filhos."
                                      : "Cadastros e vínculos."
                                    : view === "contexts"
                                      ? "Seus contextos."
                                      : `Olá, ${me.user.name.split(" ")[0]}.`}
              </Text>
              {context?.role === "SCHOOL" && view !== "home" && (
                <Link
                  title={
                    canGoBack
                      ? "← Voltar ao ponto anterior"
                      : "← Voltar à Central"
                  }
                  onPress={
                    canGoBack ? returnToPreviousSchoolPoint : returnToSchool
                  }
                />
              )}
              {context?.role === "SCHOOL" && (
                <View style={view !== "home" ? { display: "none" } : undefined}>
                  <SchoolCentral
                    key={context.id}
                    contextId={context.id}
                    client={api}
                    active={view === "home"}
                    onOpenTarget={openSchoolTarget}
                  />
                </View>
              )}
              {context?.role === "SCHOOL" && view === "more" && (
                <View style={s.card}>
                  <Link
                    title="Pendências e ocorrências · todas as datas"
                    onPress={() => {
                      setAlertId("");
                      setAlertVisit((v) => v + 1);
                      setView("alerts");
                    }}
                  />
                  <Link
                    title="Histórico das crianças"
                    onPress={() => {
                      setJourneyTarget(null);
                      setView("history");
                    }}
                  />
                  <Link
                    title="Orientações de operação"
                    onPress={() => setView("operation")}
                  />
                  <Text style={s.note}>
                    Ambiente de teste · uso real não liberado.
                  </Text>
                </View>
              )}
              {view === "operation" && context && (
                <Operation role={context.role} onNavigate={setView} />
              )}
              {context &&
                (view === "alerts" ||
                  (context.role === "SCHOOL" &&
                    schoolAlertsContext === context.id)) && (
                  <View
                    style={view !== "alerts" ? { display: "none" } : undefined}
                  >
                    <Alerts
                      key={
                        context.role === "SCHOOL"
                          ? context.id
                          : context.id + alertId + alertVisit
                      }
                      context={context}
                      client={api}
                      initialId={alertId}
                      active={view === "alerts"}
                      onSelect={
                        context.role === "SCHOOL" ? setAlertId : undefined
                      }
                      onOpenTarget={openSchoolTarget}
                    />
                  </View>
                )}
              {view === "planning" && context && (
                <Planning key={context.id} context={context} client={api} />
              )}
              {view === "notifications" && context && (
                <Notifications
                  key={context.id + notificationId + notificationVisit}
                  context={context}
                  client={api}
                  initialId={notificationId}
                  onOpenAlert={(id) => {
                    saveSchoolReturn();
                    setAlertId(id);
                    setAlertVisit((v) => v + 1);
                    setView("alerts");
                  }}
                />
              )}
              {view === "trips" && context && (
                <Trips key={context.id} context={context} client={api} />
              )}
              {view === "history" && context && (
                <History
                  key={
                    context.id +
                    (journeyTarget?.passengerId ||
                      journeyTarget?.studentId ||
                      "")
                  }
                  client={api}
                  onNavigate={setView}
                  initialTarget={
                    journeyTarget?.view === "history"
                      ? journeyTarget
                      : undefined
                  }
                  role={context.role}
                />
              )}
              {view === "registry" && context && (
                <Registry
                  key={context.id}
                  context={context}
                  client={api}
                  onContextsChanged={() => refresh(session!)}
                />
              )}
              {view === "home" && context?.role !== "SCHOOL" && (
                <>
                  {context?.role === "GUARDIAN" && (
                    <Notifications
                      key={context.id}
                      context={context}
                      client={api}
                      home
                    />
                  )}
                  <View style={s.hero}>
                    <Text style={s.heroTitle}>
                      {context?.role === "DRIVER"
                        ? "Seu espaço de motorista."
                        : context?.role === "GUARDIAN"
                          ? "Seu espaço de responsável."
                          : "Seu espaço da escola."}
                    </Text>
                    <Text style={s.heroText}>
                      {context?.organization_name ||
                        "Aguarde um convite verificado para acessar uma organização."}
                    </Text>
                    <Text style={s.heroText}>
                      Sua identidade acompanha cada ação.
                    </Text>
                  </View>
                  <View style={s.card}>
                    <Text style={s.cardTitle}>Um passo de cada vez.</Text>
                    <Text style={s.description}>
                      Alunos e vínculos já estão disponíveis na aba{" "}
                      {context?.role === "GUARDIAN" ? "Filhos" : "Cadastros"}. A
                      rotina semanal e as confirmações por data estão em
                      Planejamento. Prepare viagens e registre confirmações
                      individuais de embarque e recebimento na aba Viagens.{" "}
                      Confira histórico, correções e orientações na aba
                      Preparação.
                    </Text>
                    <Text style={s.badge}>
                      10 / 10 · Teste local, uso real não liberado
                    </Text>
                  </View>
                </>
              )}
              {view === "contexts" && (
                <>
                  {me.contexts.map((c) => (
                    <Pressable
                      accessibilityRole="button"
                      key={c.id}
                      style={[s.card, context?.id === c.id && s.selectedCard]}
                      disabled={busy}
                      onPress={() => switchContext(c)}
                    >
                      <Text style={s.cardTitle}>{c.organization_name}</Text>
                      <Text style={s.note}>
                        {labels[c.role]}
                        {c.coordinator ? " · Coordenação" : ""}
                      </Text>
                      <Text style={s.badge}>
                        {context?.id === c.id
                          ? "Contexto atual"
                          : "Selecionar contexto →"}
                      </Text>
                    </Pressable>
                  ))}
                  {!me.contexts.length && (
                    <Text style={s.description}>
                      Nenhum vínculo ativo. Solicite um convite autorizado.
                    </Text>
                  )}
                </>
              )}
              {view === "profile" && (
                <View style={s.card}>
                  <Text style={s.label}>Seu nome</Text>
                  <TextInput
                    accessibilityLabel="Seu nome"
                    style={s.input}
                    value={name}
                    onChangeText={setName}
                  />
                  <Text style={s.note}>{me.user.email}</Text>
                  <Action
                    title="Salvar alterações"
                    busy={busy}
                    onPress={() =>
                      run(async () => {
                        await api("auth/profile", { name }, session, "PATCH");
                        await refresh(session!);
                        setNotice("Perfil atualizado.");
                      })
                    }
                  />
                </View>
              )}
              <Link
                title="Sair da conta"
                onPress={() => {
                  void run(async () => {
                    await api("auth/logout", {});
                    await SecureStore.deleteItemAsync(storeKey);
                    setSession(null);
                    setMe(null);
                    setContext(null);
                    setFlow("login");
                    setView("home");
                  });
                }}
              />
            </>
          )}
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
          <Text style={s.footer}>Caminho · Mais cuidado em cada trajeto.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Action({
  title,
  busy,
  onPress,
}: {
  title: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[s.button, busy && { opacity: 0.5 }]}
      disabled={busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={s.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}
function Link({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={{ paddingVertical: 10 }}
      onPress={onPress}
    >
      <Text style={s.link}>{title}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f8f4", justifyContent: "center" },
  container: { padding: 26, paddingTop: 45, flexGrow: 1 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 43,
  },
  brandIcon: {
    backgroundColor: "#23705b",
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    color: "#213b35",
    letterSpacing: -1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#7c9372",
    marginBottom: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: "600",
    letterSpacing: -1,
    lineHeight: 43,
    color: "#213b35",
    marginBottom: 17,
  },
  description: {
    fontSize: 14,
    color: "#86927e",
    lineHeight: 24,
    marginBottom: 24,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#213b35", marginBottom: 9 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce3d7",
    borderRadius: 8,
    height: 49,
    paddingHorizontal: 14,
    color: "#213b35",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#23705b",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 7,
    marginBottom: 10,
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  link: { fontSize: 12, color: "#23705b", fontWeight: "600" },
  flowButtons: { marginBottom: 20 },
  card: {
    padding: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e8dc",
    borderRadius: 12,
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 17,
    color: "#213b35",
    fontWeight: "600",
    marginBottom: 10,
  },
  note: { fontSize: 12, lineHeight: 22, color: "#8d9983" },
  demoRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  chip: {
    backgroundColor: "#eef3e7",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
  },
  error: {
    backgroundColor: "#fff0ed",
    padding: 15,
    color: "#9b3b2b",
    fontSize: 12,
    lineHeight: 21,
    borderRadius: 8,
    marginTop: 15,
  },
  success: {
    backgroundColor: "#e6f2e4",
    padding: 15,
    color: "#276147",
    fontSize: 12,
    lineHeight: 21,
    borderRadius: 8,
    marginTop: 15,
  },
  hero: {
    backgroundColor: "#174e40",
    padding: 25,
    borderRadius: 13,
    marginBottom: 22,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 32,
    marginBottom: 17,
  },
  heroText: { color: "#c2d2ba", lineHeight: 23, fontSize: 13, marginBottom: 8 },
  badge: { fontSize: 10, color: "#7f9868", marginTop: 12 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 30 },
  tab: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 6 },
  tabSelected: { backgroundColor: "#e7efdf" },
  selectedCard: { borderColor: "#6c9564", borderWidth: 2 },
  footer: {
    fontSize: 10,
    color: "#a0aa93",
    textAlign: "center",
    marginTop: 30,
    marginBottom: 10,
  },
});
