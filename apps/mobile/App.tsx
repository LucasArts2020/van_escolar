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
import DriverDay from "./DriverDay";
import { theme } from "./theme";
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
  const [notificationsContext, setNotificationsContext] = useState("");
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
    if (!context || !["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role))
      return;
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
    setView(
      target.view === "trips" && context?.role === "DRIVER"
        ? "home"
        : target.view,
    );
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
    setNotificationsContext("");
    schoolPosition.current = 0;
    scrollPosition.current = 0;
  }, [context?.id, session]);
  useEffect(() => {
    if (
      context &&
      ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
      view === "alerts"
    )
      setSchoolAlertsContext(context.id);
  }, [context?.id, view]);
  useEffect(() => {
    if (
      context &&
      ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
      view === "notifications"
    )
      setNotificationsContext(context.id);
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
          contentContainerStyle={[s.container, !!me && s.workspaceContainer]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[s.brandRow, !!me && s.workspaceBrand]}>
            <View style={s.brandIcon}>
              <Text style={{ color: "white", fontSize: 24 }}>↝</Text>
            </View>
            <Text style={s.brand}>
              caminho<Text style={{ color: theme.color.gold }}>.</Text>
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
              {context && (
                <View style={s.accountTools}>
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
              <View
                style={[
                  s.tabs,
                  !!context &&
                    ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
                    s.operationalTabs,
                ]}
              >
                {(context?.role === "DRIVER"
                  ? [
                      ["home", "Meu dia"],
                      ["registry", "Alunos e frota"],
                      ["more", "Mais"],
                    ]
                  : context?.role === "SCHOOL"
                    ? [
                        ["home", "Central"],
                        ["registry", "Alunos e transportes"],
                        ["more", "Mais"],
                      ]
                    : context?.role === "GUARDIAN"
                      ? [
                          ["home", "Meus filhos"],
                          ["planning", "Agenda"],
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
                            context?.role === "GUARDIAN"
                              ? "Filhos"
                              : "Cadastros",
                          ],
                          ["contexts", "Contextos"],
                          ["profile", "Meu perfil"],
                        ]
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: view === key }}
                    style={({ pressed }) => [
                      s.tab,
                      !!context &&
                        ["SCHOOL", "DRIVER", "GUARDIAN"].includes(
                          context.role,
                        ) &&
                        s.operationalTab,
                      view === key && s.tabSelected,
                      pressed && s.pressed,
                    ]}
                    onPress={() => {
                      setNotificationId("");
                      if (key === "alerts") {
                        setAlertId("");
                        setAlertVisit((v) => v + 1);
                      }
                      if (key === "notifications")
                        setNotificationVisit((v) => v + 1);
                      if (
                        context &&
                        ["SCHOOL", "DRIVER", "GUARDIAN"].includes(
                          context.role,
                        ) &&
                        key === "home"
                      )
                        returnToSchool();
                      else {
                        clearSchoolReturns();
                        setJourneyTarget(null);
                        setView(key);
                      }
                    }}
                  >
                    <Text
                      style={[
                        s.link,
                        s.tabText,
                        view === key && s.tabTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.eyebrow}>
                {context
                  ? labels[context.role].toUpperCase()
                  : "SEM VÍNCULO ATIVO"}
              </Text>
              <Text style={s.title}>
                {context?.role === "DRIVER" && view === "home"
                  ? "Meu dia."
                  : context?.role === "SCHOOL" && view === "home"
                    ? "Central da escola."
                    : view === "more"
                      ? "Mais."
                      : view === "operation"
                        ? "Regras e ajuda"
                        : view === "profile"
                          ? "Seu perfil."
                          : view === "notifications"
                            ? "Cada atualização, mais cuidado."
                            : view === "alerts"
                              ? "Alertas e ocorrências."
                              : view === "history"
                                ? "Histórico e correções."
                                : view === "trips"
                                  ? context?.role === "GUARDIAN"
                                    ? "Acompanhamento dos filhos"
                                    : "Viagens e passageiros"
                                  : view === "planning"
                                    ? context?.role === "GUARDIAN"
                                      ? "Agenda"
                                      : "Rotina e planejamento"
                                    : view === "registry"
                                      ? context?.role === "GUARDIAN"
                                        ? "Seus filhos."
                                        : "Cadastros e vínculos."
                                      : view === "contexts"
                                        ? "Seus contextos."
                                        : context?.role === "GUARDIAN"
                                          ? "Meus filhos"
                                          : `Olá, ${me.user.name.split(" ")[0]}.`}
              </Text>
              {context &&
                ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
                view !== "home" && (
                  <Link
                    title={
                      canGoBack
                        ? "← Voltar ao ponto anterior"
                        : context?.role === "DRIVER"
                          ? "← Voltar ao Meu dia"
                          : context?.role === "GUARDIAN"
                            ? "← Voltar aos meus filhos"
                            : "← Voltar à Central"
                    }
                    onPress={
                      canGoBack ? returnToPreviousSchoolPoint : returnToSchool
                    }
                  />
                )}
              {context?.role === "DRIVER" && (
                <View style={view !== "home" ? { display: "none" } : undefined}>
                  <DriverDay
                    key={context.id}
                    context={context}
                    client={api}
                    active={view === "home"}
                    onOpenTarget={openSchoolTarget}
                    target={
                      journeyTarget?.view === "trips"
                        ? journeyTarget
                        : undefined
                    }
                  />
                </View>
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
              {context &&
                ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
                view === "more" && (
                  <View style={s.card}>
                    {context.role === "GUARDIAN" && (
                      <>
                        <Link
                          title="Acompanhar meus filhos"
                          onPress={() => setView("trips")}
                        />
                        <Link
                          title="Dados dos filhos e vínculos"
                          onPress={() => setView("registry")}
                        />
                      </>
                    )}
                    <Link
                      title="Pendências e ocorrências · todas as datas"
                      onPress={() => {
                        setAlertId("");
                        setAlertVisit((v) => v + 1);
                        setView("alerts");
                      }}
                    />
                    {context.role === "DRIVER" && (
                      <Link
                        title="Planejamento e solicitações"
                        onPress={() => setView("planning")}
                      />
                    )}
                    <Link
                      title="Histórico das crianças"
                      onPress={() => {
                        setJourneyTarget(null);
                        setView("history");
                      }}
                    />
                    <Link
                      title="Regras e ajuda"
                      onPress={() => setView("operation")}
                    />
                    <Text style={s.note}>
                      Ambiente de teste · uso real não liberado.
                    </Text>
                  </View>
                )}
              {view === "operation" && context && (
                <Operation
                  role={context.role}
                  onNavigate={(next) =>
                    setView(
                      context?.role === "DRIVER" &&
                        ["trips", "overview"].includes(next)
                        ? "home"
                        : next,
                    )
                  }
                />
              )}
              {context &&
                (view === "alerts" ||
                  (["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
                    schoolAlertsContext === context.id)) && (
                  <View
                    style={view !== "alerts" ? { display: "none" } : undefined}
                  >
                    <Alerts
                      key={
                        ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role)
                          ? context.id
                          : context.id + alertId + alertVisit
                      }
                      context={context}
                      client={api}
                      initialId={alertId}
                      initialAwaiting={journeyTarget?.awaitingAcknowledgement}
                      active={view === "alerts"}
                      onSelect={
                        ["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role)
                          ? setAlertId
                          : undefined
                      }
                      onOpenTarget={openSchoolTarget}
                    />
                  </View>
                )}
              {view === "planning" && context && (
                <Planning key={context.id} context={context} client={api} />
              )}
              {context &&
                (view === "notifications" ||
                  (["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role) &&
                    notificationsContext === context.id)) && (
                  <View
                    style={
                      view !== "notifications" ? { display: "none" } : undefined
                    }
                  >
                    <Notifications
                      key={context.id + notificationId + notificationVisit}
                      active={view === "notifications"}
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
                  </View>
                )}
              {view === "trips" && context && context.role !== "DRIVER" && (
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
                  onNavigate={(next) =>
                    setView(
                      context?.role === "DRIVER" &&
                        ["trips", "overview"].includes(next)
                        ? "home"
                        : next,
                    )
                  }
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
              {view === "home" &&
                context?.role !== "SCHOOL" &&
                context?.role !== "DRIVER" && (
                  <>
                    {context?.role === "GUARDIAN" && (
                      <Notifications
                        key={context.id}
                        context={context}
                        client={api}
                        home
                        onOpenAcknowledgements={() =>
                          openSchoolTarget({
                            view: "alerts",
                            contextId: context.id,
                            date: "",
                            awaitingAcknowledgement: true,
                          })
                        }
                      />
                    )}
                    <View style={s.hero}>
                      <Text style={s.heroTitle}>
                        {context?.role === "GUARDIAN"
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
                      <Text style={s.cardTitle}>Organize os próximos dias</Text>
                      <Text style={s.description}>
                        Consulte a rotina e informe o uso do transporte na ida e
                        na volta.
                      </Text>
                      <Link
                        title="Abrir agenda"
                        onPress={() => setView("planning")}
                      />
                      <Text style={s.note}>
                        Histórico, dados dos filhos e orientações estão em Mais.
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
      style={({ pressed }) => [
        s.button,
        pressed && s.pressed,
        busy && { opacity: 0.65 },
      ]}
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
      style={({ pressed }) => [s.linkButton, pressed && s.pressed]}
      onPress={onPress}
    >
      <Text style={s.link}>{title}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.color.background,
    justifyContent: "center",
  },
  container: { padding: 24, paddingTop: 36, flexGrow: 1 },
  workspaceContainer: { paddingHorizontal: 16, paddingTop: 20 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 36,
  },
  workspaceBrand: { marginBottom: 18 },
  brandIcon: {
    backgroundColor: theme.color.primary,
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    color: theme.color.ink,
    letterSpacing: -1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: theme.color.muted,
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 38,
    color: theme.color.ink,
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 23,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.color.ink,
    marginBottom: 9,
  },
  input: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.control,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.color.ink,
    marginBottom: 20,
  },
  button: {
    backgroundColor: theme.color.primary,
    minHeight: 50,
    padding: 16,
    borderRadius: theme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
    marginBottom: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  link: {
    fontSize: 13,
    color: theme.color.primary,
    fontWeight: "600",
    lineHeight: 20,
  },
  linkButton: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 2,
    justifyContent: "center",
  },
  pressed: { opacity: 0.72 },
  flowButtons: { marginBottom: 20 },
  card: {
    padding: 20,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.card,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 25,
    color: theme.color.ink,
    fontWeight: "700",
    marginBottom: 10,
  },
  note: { fontSize: 13, lineHeight: 21, color: theme.color.muted },
  demoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  chip: {
    backgroundColor: theme.color.soft,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.control,
    justifyContent: "center",
  },
  error: {
    backgroundColor: theme.color.dangerSoft,
    padding: 16,
    color: theme.color.danger,
    fontSize: 13,
    lineHeight: 21,
    borderRadius: theme.radius.control,
    marginTop: 15,
  },
  success: {
    backgroundColor: theme.color.soft,
    padding: 16,
    color: theme.color.primary,
    fontSize: 13,
    lineHeight: 21,
    borderRadius: theme.radius.control,
    marginTop: 15,
  },
  hero: {
    backgroundColor: theme.color.primaryDark,
    padding: 24,
    borderRadius: theme.radius.card,
    marginBottom: 20,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    marginBottom: 16,
  },
  heroText: { color: "#d4e8df", lineHeight: 23, fontSize: 13, marginBottom: 8 },
  badge: {
    fontSize: 11,
    color: theme.color.primary,
    marginTop: 12,
    lineHeight: 17,
  },
  accountTools: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginBottom: 18,
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 24 },
  operationalTabs: {
    flexWrap: "nowrap",
    padding: 5,
    backgroundColor: theme.color.soft,
    borderRadius: 16,
  },
  operationalTab: { flex: 1, minWidth: 0 },
  tab: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: theme.radius.control,
    justifyContent: "center",
  },
  tabText: { textAlign: "center", fontSize: 12, lineHeight: 18 },
  tabSelected: { backgroundColor: theme.color.primary },
  tabTextSelected: { color: "#fff", fontWeight: "700" },
  selectedCard: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.soft,
  },
  footer: {
    fontSize: 11,
    color: theme.color.muted,
    textAlign: "center",
    marginTop: 28,
    marginBottom: 12,
    lineHeight: 17,
  },
});
