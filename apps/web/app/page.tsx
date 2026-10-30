"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { JourneyTarget } from "../../shared/navigation";
import RegistryPanel from "./registry-panel";
import PlanningPanel from "./planning-panel";
import TripsPanel from "./trips-panel";
import HistoryPanel from "./history-panel";
import OperationPanel from "./operation-panel";
import SchoolCentral from "./school-central";
import DriverDay from "./driver-day";
import NotificationsPanel from "./notifications-panel";
import AlertsPanel from "./alerts-panel";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BusFront,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Mail,
  MoreHorizontal,
  Route,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
type Context = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: "SCHOOL" | "DRIVER" | "GUARDIAN";
  coordinator: boolean;
  manage_team: boolean;
};
type Me = {
  user: { id: string; name: string; email: string };
  contexts: Context[];
};
type Member = {
  id: string;
  name: string;
  email: string;
  coordinator: boolean;
  manage_team: boolean;
  active: boolean;
};
type Audit = {
  id: string;
  actor_name: string;
  action: string;
  created_at: string;
};
const labels = {
  SCHOOL: "Escola",
  DRIVER: "Motorista",
  GUARDIAN: "Responsável",
};
const demos = ["escola", "operacao", "motorista", "responsavel", "outraescola"];
const actions: Record<string, string> = {
  ALERT_POLICY_UPDATED: "Intervalos de alerta atualizados",
  ALERT_ASSUMED: "Acompanhamento de ocorrência assumido",
  ALERT_CONTACT: "Contato registrado na ocorrência",
  ALERT_VERIFICATION: "Verificação física registrada na ocorrência",
  ALERT_RESOLVED: "Atendimento de ocorrência encerrado",
  ALERT_REPORTED: "Relato de risco registrado",
  NOTIFICATION_READ: "Notificação marcada como lida",
  PLANNING_POLICY_UPDATED: "Limite de planejamento atualizado",
  WEEKLY_ROUTINE_UPDATED: "Rotina semanal atualizada",
  DAILY_PLAN_GENERATED: "Previsão diária gerada",
  DAILY_PLAN_RESPONDED: "Uso diário informado",
  PLANNING_CHANGE_REQUESTED: "Alteração tardia solicitada",
  PLANNING_CHANGE_ACCEPTED: "Alteração tardia aceita",
  PLANNING_CHANGE_REFUSED: "Alteração tardia recusada",
  PLANNING_CHANGE_WITHDRAWN: "Pedido de alteração retirado",
  DEMO_ACCOUNT_CREATED: "Conta de demonstração criada",
  DEMO_CONTEXT_CREATED: "Contexto de demonstração criado",
  TEAM_INVITE_CREATED: "Convite para equipe criado",
  INVITE_ACCEPTED: "Convite aceito",
  TEAM_PERMISSIONS_UPDATED: "Permissões atualizadas",
  STUDENT_CREATED: "Aluno cadastrado",
  OPERATING_LINK_REQUESTED: "Associação solicitada",
  OPERATING_LINK_ACTIVE: "Associação aceita",
  OPERATING_LINK_REFUSED: "Associação recusada",
  OPERATING_LINK_INACTIVE: "Associação inativada",
  GUARDIAN_INVITED: "Responsável convidado",
  GUARDIAN_VERIFIED: "Vínculo familiar verificado",
  GUARDIAN_DEACTIVATED: "Vínculo familiar inativado",
  GUARDIAN_INVITE_ACCEPTED: "Convite de responsável aceito",
  DRIVER_INVITED: "Motorista convidado",
  DRIVER_INVITE_ACCEPTED: "Convite de motorista aceito",
  VEHICLE_CREATED: "Veículo cadastrado",
  VEHICLE_STATUS_UPDATED: "Situação do veículo alterada",
  ORGANIZATION_CREATED: "Organização cadastrada",
  ORGANIZATION_UPDATED: "Organização atualizada",
};
async function request<T>(
  path: string,
  options: RequestInit = {},
  context?: string,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    ...options,
    ...(path === "auth/me" && !options.signal
      ? { signal: AbortSignal.timeout(12000) }
      : {}),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(context ? { "X-Context-Id": context } : {}),
      ...options.headers,
    },
  });
  const data = await res
    .json()
    .catch(() => ({ message: "Não foi possível conectar ao servidor." }));
  if (!res.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "Não foi possível concluir.",
    );
  return data;
}
function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "light" : ""}`}>
      <span className="brand-mark">
        <Route size={24} />
      </span>
      <span>
        caminho<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`button ${props.className || ""}`}>
      {children}
    </button>
  );
}
export default function Home() {
  const [me, setMe] = useState<Me | null>(null),
    [context, setContext] = useState<Context | null>(null),
    [boot, setBoot] = useState(true);
  const [view, setView] = useState("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [notificationId, setNotificationId] = useState("");
  const [alertId, setAlertId] = useState(""),
    [alertVisit, setAlertVisit] = useState(0);
  const [notificationVisit, setNotificationVisit] = useState(0);
  const [journeyTarget, setJourneyTarget] = useState<JourneyTarget>();
  const [historyVisit, setHistoryVisit] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [visitedSchoolViews, setVisitedSchoolViews] = useState<{
    contextId: string;
    alerts: boolean;
    notifications: boolean;
  }>({ contextId: "", alerts: false, notifications: false });
  const returns = useRef<
    Array<{
      view: string;
      target?: JourneyTarget;
      alertId: string;
      notificationId: string;
      scroll: number;
      focus: HTMLElement | null;
    }>
  >([]);
  const restorePoint = useRef<{
    scroll: number;
    focus: HTMLElement | null;
  } | null>(null);
  const detailBack = useRef<HTMLButtonElement>(null);
  const [flow, setFlow] = useState("login"),
    [token, setToken] = useState(""),
    [loginEmail, setLoginEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [team, setTeam] = useState<Member[]>([]),
    [history, setHistory] = useState<Audit[]>([]),
    [inviteEmail, setInviteEmail] = useState(""),
    [modal, setModal] = useState(false),
    [loading, setLoading] = useState(false);
  async function loadMe() {
    const data = await request<Me>("auth/me");
    const params = new URLSearchParams(window.location.search);
    const targetContext =
      params.has("notification") || params.has("alert")
        ? params.get("context")
        : null;
    setMe(data);
    setName(data.user.name);
    setContext(
      (old) =>
        data.contexts.find((c) => c.id === targetContext) ||
        data.contexts.find((c) => c.id === old?.id) ||
        data.contexts[0] ||
        null,
    );
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("flow");
    if (f === "invite" || f === "reset") {
      setFlow(f);
      setToken(params.get("token") || "");
      window.history.replaceState({}, "", window.location.pathname);
    }
    loadMe()
      .catch((failure) => {
        if (
          failure instanceof Error &&
          (failure.name === "TimeoutError" ||
            failure.name === "AbortError" ||
            failure instanceof TypeError)
        )
          setError(
            "Não foi possível verificar sua sessão. Confira a conexão e tente entrar novamente.",
          );
      })
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    returns.current = [];
    setJourneyTarget(undefined);
    setCanGoBack(false);
    setAlertId("");
    setNotificationId("");
    setModal(false);
    setView(
      context?.role === "SCHOOL"
        ? "school-central"
        : context?.role === "DRIVER"
          ? "driver-day"
          : "overview",
    );
  }, [context?.id]);
  useEffect(() => {
    if (!context || !["SCHOOL", "DRIVER", "GUARDIAN"].includes(context.role))
      return;
    if (view !== "alerts" && view !== "notifications") return;
    setVisitedSchoolViews((previous) => ({
      contextId: context.id,
      alerts:
        view === "alerts" ||
        (previous.contextId === context.id && previous.alerts),
      notifications:
        view === "notifications" ||
        (previous.contextId === context.id && previous.notifications),
    }));
  }, [view, context?.id]);
  useEffect(() => {
    const point = restorePoint.current;
    restorePoint.current = null;
    const frame = requestAnimationFrame(() => {
      if (point) {
        window.scrollTo({ top: point.scroll, behavior: "instant" });
        if (point.focus?.isConnected)
          point.focus.focus({ preventScroll: true });
      } else if (canGoBack) detailBack.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, journeyTarget, canGoBack]);
  function openTarget(target: JourneyTarget) {
    if (!context || target.contextId !== context.id) return;
    returns.current.push({
      view,
      target: journeyTarget,
      alertId,
      notificationId,
      scroll: window.scrollY,
      focus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    });
    setCanGoBack(true);
    setJourneyTarget(target);
    if (target.view === "history") setHistoryVisit((v) => v + 1);
    if (target.view === "alerts") {
      setAlertId(target.alertId || "");
      setAlertVisit((v) => v + 1);
    }
    setView(
      target.view === "trips" && context.role === "DRIVER"
        ? "driver-day"
        : target.view,
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function goBack() {
    const previous = returns.current.pop();
    if (!previous) return;
    restorePoint.current = { scroll: previous.scroll, focus: previous.focus };
    setJourneyTarget(previous.target);
    setAlertId(previous.alertId);
    setNotificationId(previous.notificationId);
    setCanGoBack(returns.current.length > 0);
    setView(previous.view);
  }
  function navigate(next: string) {
    if (
      context?.role === "SCHOOL" &&
      ["overview", "trips", "planning"].includes(next)
    )
      next = "school-central";
    if (context?.role === "DRIVER" && ["overview", "trips"].includes(next))
      next = "driver-day";
    returns.current = [];
    setCanGoBack(false);
    setJourneyTarget(undefined);
    setView(next);
    setNotificationId("");
    if (next === "alerts") {
      setAlertId("");
      setAlertVisit((v) => v + 1);
    }
    if (next === "notifications") setNotificationVisit((v) => v + 1);
    if (next === "history") setHistoryVisit((v) => v + 1);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    if (!me) return;
    const params = new URLSearchParams(window.location.search),
      id = params.get("notification") || params.get("alert"),
      ctx = params.get("context");
    if (!id) return;
    const allowed = me.contexts.find((c) => c.id === ctx);
    if (allowed && /^[0-9a-f-]{36}$/i.test(id)) {
      setContext(allowed);
      if (params.has("alert")) {
        setAlertId(id);
        setView("alerts");
      } else {
        setNotificationId(id);
        setView("notifications");
      }
    } else
      setError("A atualização não está disponível nos seus contextos atuais.");
    window.history.replaceState({}, "", window.location.pathname);
  }, [me]);
  async function loadTeam(ctx: Context) {
    const [members, events] = await Promise.all([
      request<Member[]>("workspace/team", {}, ctx.id),
      request<Audit[]>("workspace/audit", {}, ctx.id),
    ]);
    setTeam(members);
    setHistory(events);
  }
  useEffect(() => {
    setError("");
    setTeam([]);
    setHistory([]);
    if (!context) return;
    let alive = true;
    setLoading(true);
    request("workspace", {}, context.id)
      .then(async () => {
        if (context.manage_team) {
          const [members, events] = await Promise.all([
            request<Member[]>("workspace/team", {}, context.id),
            request<Audit[]>("workspace/audit", {}, context.id),
          ]);
          if (alive) {
            setTeam(members);
            setHistory(events);
          }
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
  }, [context?.id]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function authSubmit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (flow === "login") {
        await request("auth/login", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail, password }),
        });
        setPassword("");
        await loadMe();
      }
      if (flow === "recovery") {
        const r = await request<{ message: string }>("auth/recovery", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail }),
        });
        setNotice(
          r.message + " Em desenvolvimento, consulte o terminal da API.",
        );
      }
      if (flow === "reset" || flow === "invite") {
        const accepted = await request<{ awaitingVerification?: boolean }>(
          "auth/" + (flow === "reset" ? "reset" : "accept-invite"),
          {
            method: "POST",
            body: JSON.stringify({
              token,
              password,
              ...(flow === "invite" ? { name } : {}),
            }),
          },
        );
        setMe(null);
        setContext(null);
        setFlow("login");
        setPassword("");
        setToken("");
        setNotice(
          accepted.awaitingVerification
            ? "Convite aceito. Entre com sua conta e aguarde a organização verificar seu vínculo com a criança."
            : "Tudo certo. Entre com sua conta para continuar.",
        );
      }
    });
  }
  async function logout() {
    await run(async () => {
      await request("auth/logout", { method: "POST" });
      setMe(null);
      setContext(null);
      setTeam([]);
      setHistory([]);
      setFlow("login");
      setView("overview");
    });
  }
  async function updateMember(member: Member, change: Partial<Member>) {
    if (!context) return;
    await run(async () => {
      await request(
        "workspace/team/" + member.id,
        { method: "PATCH", body: JSON.stringify(change) },
        context.id,
      );
      await loadTeam(context);
      setNotice("Permissão atualizada e registrada no histórico.");
    });
  }
  if (boot)
    return (
      <main className="splash">
        <div className="startup-brand">
          <Brand />
          <LoaderCircle className="spin" aria-label="Carregando" />
        </div>
        <p role="status">Abrindo seu espaço…</p>
        <a className="startup-reload" href="/?reabrir=1">
          Demorando? Recarregar o sistema
        </a>
      </main>
    );
  // Links de convite/recuperação também podem ser usados com uma sessão aberta.
  if (!me || flow === "invite" || flow === "reset")
    return (
      <main className="auth-layout">
        <section className="auth-story">
          <Brand light />
          <div className="auth-copy">
            <div className="eyebrow">PRESENÇA EM CADA ETAPA</div>
            <h1>
              O cuidado começa
              <br />
              no caminho.
            </h1>
            <p>
              Escola, motorista e família.
              <br />
              Cada pessoa com seu acesso.
              <br />
              Todos conectados pelo cuidado.
            </p>
            <div className="route-art" aria-hidden="true">
              <span>
                <UserRound />
              </span>
              <i />
              <span>
                <BusFront />
              </span>
              <i />
              <span>
                <GraduationCap />
              </span>
            </div>
          </div>
          <div className="auth-foot">
            Transporte escolar, com responsabilidade compartilhada.
          </div>
        </section>
        <section className="auth-form-side">
          <div className="auth-form">
            <span className="pill">
              <span className="status-dot" /> ACESSO AO CAMINHO
            </span>
            <h2>
              {flow === "login"
                ? "Bom ter você por aqui."
                : flow === "recovery"
                  ? "Vamos recuperar seu acesso."
                  : flow === "invite"
                    ? "Você faz parte do caminho."
                    : "Uma nova senha."}
            </h2>
            <p className="muted">
              {flow === "login"
                ? "Entre para acessar seu espaço no Caminho."
                : flow === "invite"
                  ? "Complete seu cadastro. Se já tem uma conta, use a senha atual."
                  : "Siga as instruções para acessar sua conta."}
            </p>
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
            <form onSubmit={authSubmit}>
              {(flow === "login" || flow === "recovery") && (
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="voce@exemplo.com.br"
                  />
                </label>
              )}
              {flow === "invite" && (
                <label>
                  Seu nome
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como podemos chamar você?"
                  />
                </label>
              )}
              {flow !== "recovery" && (
                <label>
                  {flow === "reset" ? "Nova senha" : "Senha"}
                  <input
                    type="password"
                    autoComplete={
                      flow === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={flow === "login" ? 1 : 12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      flow === "login"
                        ? "Digite sua senha"
                        : "Pelo menos 12 caracteres"
                    }
                  />
                </label>
              )}
              {flow === "login" && (
                <button
                  className="text-button forgot"
                  type="button"
                  onClick={() => {
                    setFlow("recovery");
                    setError("");
                    setNotice("");
                  }}
                >
                  Esqueci minha senha
                </button>
              )}
              <Button disabled={busy} type="submit">
                {busy ? <LoaderCircle className="spin" size={18} /> : null}
                {flow === "login"
                  ? "Entrar na minha conta"
                  : flow === "recovery"
                    ? "Solicitar recuperação"
                    : "Concluir"}
                <ArrowRight size={18} />
              </Button>
            </form>
            {flow !== "login" && (
              <button
                className="text-button back"
                onClick={() => {
                  setFlow("login");
                  setError("");
                  setNotice("");
                }}
              >
                Voltar para entrar
              </button>
            )}
            {flow === "login" && (
              <div className="demo-box">
                <div>
                  <span className="demo-tag">AMBIENTE DE TESTE</span>
                  <p>Escolha uma conta para experimentar</p>
                </div>
                <div className="demo-options">
                  {demos.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setLoginEmail(d + "@demo.local");
                        setPassword("Caminho@2026!");
                      }}
                    >
                      {
                        (
                          {
                            escola: "Gestão da escola",
                            operacao: "Equipe",
                            motorista: "Motorista",
                            responsavel: "Responsável",
                            outraescola: "Outra escola",
                          } as Record<string, string>
                        )[d]
                      }
                    </button>
                  ))}
                </div>
                <small>Dados fictícios · senha: Caminho@2026!</small>
              </div>
            )}
            <div className="auth-security">
              <ShieldCheck size={16} /> Seu acesso é individual e protegido.
            </div>
          </div>
          <span className="copyright">© 2026 Caminho · Transporte escolar</span>
        </section>
      </main>
    );
  const manager = context?.role === "SCHOOL" && context.manage_team;
  const active = team.filter((m) => m.active);
  const firstName = me.user.name.split(" ")[0];
  const school = context?.role === "SCHOOL";
  const driver = context?.role === "DRIVER";
  const guardian = context?.role === "GUARDIAN";
  const simplified = school || driver || guardian;
  const operational = school || driver || guardian;
  const nav = driver
    ? [
        { id: "driver-day", label: "Meu dia", icon: BusFront },
        { id: "registry", label: "Alunos e frota", icon: Link2 },
        { id: "more", label: "Mais", icon: MoreHorizontal },
      ]
    : school
      ? [
          { id: "school-central", label: "Central", icon: GraduationCap },
          { id: "registry", label: "Alunos e transportes", icon: Link2 },
          { id: "more", label: "Mais", icon: MoreHorizontal },
        ]
      : guardian
        ? [
            { id: "overview", label: "Meus filhos", icon: UserRound },
            { id: "planning", label: "Agenda", icon: ClipboardList },
            { id: "more", label: "Mais", icon: MoreHorizontal },
          ]
        : [
            { id: "overview", label: "Visão geral", icon: LayoutDashboard },
            { id: "notifications", label: "Notificações", icon: Bell },
            { id: "alerts", label: "Alertas e ocorrências", icon: ShieldAlert },
            { id: "trips", label: "Viagens e passageiros", icon: BusFront },
            {
              id: "history",
              label: "Histórico e correções",
              icon: ClipboardList,
            },
            {
              id: "operation",
              label: "Preparação para operação",
              icon: ShieldCheck,
            },
            {
              id: "planning",
              label:
                context?.role === "GUARDIAN"
                  ? "Rotina e confirmações"
                  : "Planejamento diário",
              icon: ClipboardList,
            },
            {
              id: "registry",
              label:
                context?.role === "GUARDIAN"
                  ? "Meus filhos"
                  : "Cadastros e vínculos",
              icon: Link2,
            },
            { id: "profile", label: "Meu perfil", icon: UserRound },
            ...(manager
              ? [
                  { id: "team", label: "Equipe e permissões", icon: Users },
                  {
                    id: "audit",
                    label: "Registro de ações",
                    icon: ClipboardList,
                  },
                ]
              : []),
          ];
  const secondaryLabels: Record<string, string> = {
    notifications: "Notificações",
    alerts: "Pendências e ocorrências",
    history: "Histórico e correções",
    operation: "Regras e ajuda",
    profile: "Meu perfil",
    team: "Equipe e permissões",
    audit: "Auditoria administrativa",
  };
  const moreSelected =
    simplified &&
    !(
      guardian
        ? ["overview", "planning", "notifications"]
        : ["school-central", "driver-day", "registry", "notifications"]
    ).includes(view);
  return (
    <div className={"app-shell" + (simplified ? " school-shell" : "")}>
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">SEU ESPAÇO</div>
        <div className="org-card">
          <div className="org-icon">
            {context?.role === "SCHOOL" ? (
              <GraduationCap size={20} />
            ) : context?.role === "DRIVER" ? (
              <BusFront size={20} />
            ) : (
              <UserRound size={20} />
            )}
          </div>
          <div>
            <strong>{context?.organization_name || "Sem vínculo ativo"}</strong>
            <span>
              {context ? labels[context.role] : "Solicite um convite"}
            </span>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={
                view === n.id || (n.id === "more" && moreSelected)
                  ? "page"
                  : undefined
              }
              className={
                view === n.id || (n.id === "more" && moreSelected)
                  ? "selected"
                  : ""
              }
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} aria-hidden="true" />
              <span className="nav-label">{n.label}</span>
              {(view === n.id || (n.id === "more" && moreSelected)) && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="school-test-note">
            <span className="status-dot" /> Ambiente de teste
          </div>
          <button className="logout" disabled={busy} onClick={logout}>
            <LogOut size={18} /> Sair da conta
          </button>
          <div className="sidebar-user">
            <span className="avatar">{me.user.name.slice(0, 1)}</span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {context ? labels[context.role] : "Conta individual"}
              </small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Meu espaço <span>/</span>{" "}
            <strong>
              {nav.find((n) => n.id === view)?.label ||
                secondaryLabels[view] ||
                "Visão geral"}
            </strong>
          </div>
          <div className="topbar-right">
            {me.contexts.length > 0 && (
              <select
                className="header-context"
                aria-label="Contexto atual"
                value={context?.id || ""}
                onChange={(e) =>
                  setContext(
                    me.contexts.find((c) => c.id === e.target.value) || null,
                  )
                }
              >
                {me.contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.organization_name} · {labels[c.role]}
                  </option>
                ))}
              </select>
            )}
            <button
              className="topbar-bell"
              aria-label="Abrir notificações"
              onClick={() => navigate("notifications")}
            >
              <Bell size={18} />
            </button>
            <span className="environment">
              <span className="status-dot" /> Ambiente de teste
            </span>
            <button
              className="topbar-avatar profile-shortcut"
              aria-label="Abrir meu perfil"
              onClick={() => navigate("profile")}
            >
              {firstName[0]}
            </button>
            <button
              className="mobile-signout"
              aria-label="Sair da conta"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={
            "content" + (view === "school-central" ? " school-content" : "")
          }
        >
          <div className="page-heading">
            <div>
              <h1>
                {view === "driver-day"
                  ? "Meu dia"
                  : view === "school-central"
                    ? "Central da escola"
                    : view === "more"
                      ? "Mais opções"
                      : view === "operation"
                        ? "Regras e ajuda"
                        : view === "overview"
                          ? guardian
                            ? "Meus filhos"
                            : `Olá, ${firstName}.`
                          : view === "notifications"
                            ? "Notificações"
                            : view === "alerts"
                              ? "Pendências e ocorrências"
                              : view === "history"
                                ? "Histórico e correções"
                                : view === "trips"
                                  ? guardian
                                    ? "Acompanhamento dos filhos"
                                    : "Viagens e passageiros"
                                  : view === "planning"
                                    ? guardian
                                      ? "Agenda"
                                      : "Agenda e planejamento"
                                    : view === "registry"
                                      ? context?.role === "GUARDIAN"
                                        ? "Meus filhos"
                                        : context?.role === "DRIVER"
                                          ? "Alunos e frota"
                                          : "Alunos e transportes"
                                      : view === "team"
                                        ? "Equipe e permissões"
                                        : view === "profile"
                                          ? "Meu perfil"
                                          : "Auditoria administrativa"}
              </h1>
              <p>
                {view === "driver-day"
                  ? "Viagens, confirmações e pendências no mesmo lugar."
                  : view === "school-central"
                    ? "Planejamento, recebimentos e saídas no mesmo lugar."
                    : view === "more"
                      ? "Histórico, equipe e orientações para quando precisar."
                      : view === "operation"
                        ? "Orientações por perfil e decisões necessárias antes do uso real."
                        : view === "overview"
                          ? guardian
                            ? "Acompanhe seus filhos e consulte as confirmações do transporte."
                            : "Alunos, organizações e famílias conectados por vínculos verificados."
                          : view === "notifications"
                            ? "Acompanhe os registros e confira quem ainda precisa confirmar."
                            : view === "alerts"
                              ? "Gravidade, atendimento e confirmações acompanhados separadamente."
                              : view === "history"
                                ? "Consulte os fatos, solicite correções e acompanhe as decisões autorizadas."
                                : view === "trips"
                                  ? guardian
                                    ? "Acompanhe a ida, a volta e as confirmações dos seus filhos."
                                    : "Prepare as viagens e acompanhe os passageiros de cada trecho."
                                  : view === "planning"
                                    ? "Rotina, previsões e confirmações de uso por trecho, com prazos claros."
                                    : view === "registry"
                                      ? "Cada cadastro e associação respeita seu contexto de acesso."
                                      : view === "team"
                                        ? "Gerencie quem pode atuar pela escola e o que cada pessoa pode fazer."
                                        : view === "profile"
                                          ? "Mantenha sua identificação atualizada. Seu acesso é pessoal."
                                          : "Acompanhe as ações registradas no contexto desta escola."}
              </p>
            </div>
          </div>
          {guardian && !["overview", "planning", "more"].includes(view) && (
            <button
              className="text-button school-return"
              onClick={() => (canGoBack ? goBack() : navigate("overview"))}
            >
              {canGoBack
                ? "← Voltar ao ponto anterior"
                : "← Voltar aos meus filhos"}
            </button>
          )}
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
          {loading && (
            <div className="loading-inline">
              <LoaderCircle size={16} className="spin" /> Carregando seu
              contexto…
            </div>
          )}
          {operational &&
            !guardian &&
            view !== (driver ? "driver-day" : "school-central") && (
              <button
                ref={detailBack}
                className="text-button school-return"
                onClick={
                  canGoBack
                    ? goBack
                    : () =>
                        navigate(
                          view === "more" || view === "registry"
                            ? driver
                              ? "driver-day"
                              : "school-central"
                            : "more",
                        )
                }
              >
                ←{" "}
                {canGoBack
                  ? "Voltar ao ponto anterior"
                  : view === "more" || view === "registry"
                    ? driver
                      ? "Voltar ao Meu dia"
                      : "Voltar à Central"
                    : "Voltar a Mais"}
              </button>
            )}
          {context?.role === "DRIVER" && (
            <div hidden={view !== "driver-day"}>
              <DriverDay
                key={context.id}
                context={context}
                active={view === "driver-day"}
                target={
                  journeyTarget?.view === "trips" ? journeyTarget : undefined
                }
                onOpenTarget={openTarget}
              />
            </div>
          )}
          {context?.role === "SCHOOL" && (
            <div hidden={view !== "school-central"}>
              <SchoolCentral
                key={context.id}
                context={context}
                active={view === "school-central"}
                onNavigate={navigate}
                onOpenTarget={openTarget}
              />
            </div>
          )}
          {view === "more" && simplified && (
            <section className="school-more-grid" aria-label="Mais opções">
              {[
                ...(guardian
                  ? [
                      {
                        view: "trips",
                        label: "Acompanhar meus filhos",
                        description: "Viagens e confirmações dos seus filhos.",
                        icon: BusFront,
                      },
                      {
                        view: "registry",
                        label: "Dados dos filhos e vínculos",
                        description:
                          "Cadastros, escola e transporte autorizados.",
                        icon: UserRound,
                      },
                    ]
                  : []),
                ...(driver
                  ? [
                      {
                        view: "planning",
                        label: "Planejamento e solicitações",
                        description:
                          "Previsões de uso e alterações aguardando decisão.",
                        icon: ClipboardList,
                      },
                    ]
                  : []),
                {
                  view: "alerts",
                  label: "Pendências e ocorrências",
                  description:
                    "Acompanhe atendimentos, inclusive de outras datas.",
                  icon: ShieldAlert,
                },
                {
                  view: "history",
                  label: "Histórico da criança e correções",
                  description:
                    "Consulte autoria, registros e decisões autorizadas.",
                  icon: ClipboardList,
                },
                ...(manager
                  ? [
                      {
                        view: "team",
                        label: "Equipe e permissões",
                        description: "Convites e acessos da equipe escolar.",
                        icon: Users,
                      },
                      {
                        view: "audit",
                        label: "Auditoria administrativa",
                        description:
                          "Alterações de cadastros, vínculos e permissões.",
                        icon: ShieldCheck,
                      },
                    ]
                  : []),
                {
                  view: "operation",
                  label: "Regras e ajuda",
                  description:
                    "Orientações, permissões e atendimento sem comunicação.",
                  icon: CircleHelp,
                },
                {
                  view: "profile",
                  label: "Meu perfil",
                  description: "Sua identificação e vínculos autorizados.",
                  icon: UserRound,
                },
              ].map((item) => (
                <button
                  className="panel school-more-item"
                  key={item.view}
                  onClick={() => navigate(item.view)}
                >
                  <item.icon size={22} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </section>
          )}
          {view === "operation" && context && (
            <OperationPanel role={context.role} onNavigate={navigate} />
          )}
          {context &&
            (view === "alerts" ||
              (operational &&
                visitedSchoolViews.contextId === context.id &&
                visitedSchoolViews.alerts)) && (
              <div hidden={view !== "alerts"}>
                <AlertsPanel
                  key={context.id + (operational ? "" : alertId) + alertVisit}
                  context={context}
                  initialId={alertId}
                  initialAwaiting={journeyTarget?.awaitingAcknowledgement}
                  active={view === "alerts"}
                  onSelect={operational ? setAlertId : undefined}
                  onOpenTarget={operational ? openTarget : undefined}
                />
              </div>
            )}
          {view === "planning" && context && (
            <PlanningPanel key={context.id} context={context} />
          )}
          {context &&
            (view === "notifications" ||
              (operational &&
                visitedSchoolViews.contextId === context.id &&
                visitedSchoolViews.notifications)) && (
              <div hidden={view !== "notifications"}>
                <NotificationsPanel
                  key={
                    context.id +
                    (operational ? "" : notificationId) +
                    notificationVisit
                  }
                  context={context}
                  initialId={notificationId}
                  active={view === "notifications"}
                  onSelect={operational ? setNotificationId : undefined}
                  onOpenTarget={operational ? openTarget : undefined}
                />
              </div>
            )}
          {view === "trips" && context && !driver && (
            <TripsPanel key={context.id} context={context} />
          )}
          {view === "history" && context && (
            <HistoryPanel
              key={context.id + historyVisit}
              context={context}
              onNavigate={navigate}
              initialTarget={
                journeyTarget?.view === "history" ? journeyTarget : undefined
              }
              onOpenTarget={operational ? openTarget : undefined}
            />
          )}
          {view === "registry" && context && (
            <RegistryPanel
              key={context.id}
              context={context}
              onContextsChanged={loadMe}
            />
          )}
          {view === "overview" && (
            <>
              {context?.role === "GUARDIAN" && (
                <div className="guardian-updates">
                  <NotificationsPanel
                    key={context.id}
                    context={context}
                    home
                    onOpenTarget={openTarget}
                  />
                </div>
              )}
              <section
                className={
                  "welcome-card" +
                  (context?.role === "GUARDIAN"
                    ? " family-planning-callout"
                    : "")
                }
              >
                <div className="welcome-text">
                  <span className="pill white-pill">
                    <ShieldCheck size={14} /> ACESSO CONECTADO
                  </span>
                  <h2>
                    {context?.role === "GUARDIAN" ? (
                      "Organize os próximos dias"
                    ) : (
                      <>
                        Cada pessoa no seu lugar.
                        <br />O cuidado em todos eles.
                      </>
                    )}
                  </h2>
                  <p>
                    {context?.role === "GUARDIAN" ? (
                      "Consulte a rotina e informe o uso do transporte na ida e na volta."
                    ) : (
                      <>
                        Contas individuais, permissões claras e um registro
                        <br className="desktop-br" /> de quem faz parte da sua
                        operação.
                      </>
                    )}
                  </p>
                  <button
                    className="light-button"
                    onClick={() => setView("planning")}
                  >
                    {context?.role === "GUARDIAN"
                      ? "Abrir agenda"
                      : "Abrir planejamento"}
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="care-illustration" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="central-icon">
                    <BusFront size={48} strokeWidth={1.5} />
                  </div>
                  <span className="floating-icon float-school">
                    <GraduationCap size={27} />
                  </span>
                  <span className="floating-icon float-user">
                    <UserRound size={25} />
                  </span>
                  <span className="floating-icon float-check">
                    <Check size={22} />
                  </span>
                  <span className="art-label">
                    ESCOLA + TRANSPORTE + FAMÍLIA
                  </span>
                </div>
              </section>
              <details className="account-details">
                <summary>
                  <ShieldCheck size={19} aria-hidden="true" />
                  <span>
                    Conta e acesso<small>Perfil, vínculos e orientações</small>
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div className="stats-grid">
                  <Stat
                    icon={<UserRound />}
                    value={labels[context?.role || "GUARDIAN"]}
                    label="Seu perfil neste contexto"
                    detail={
                      context?.coordinator
                        ? "Com permissão de coordenação"
                        : "Identificação individual"
                    }
                  />
                  <Stat
                    icon={<Link2 />}
                    value={String(me.contexts.length).padStart(2, "0")}
                    label="Contextos autorizados"
                    detail="Acesso validado pelo servidor"
                  />
                  <Stat
                    icon={<Users />}
                    value={
                      manager
                        ? loading
                          ? "—"
                          : String(active.length).padStart(2, "0")
                        : "Individual"
                    }
                    label={manager ? "Pessoas na equipe" : "Sua conta"}
                    detail={
                      manager
                        ? "Membros com vínculo ativo"
                        : "Uma identidade por pessoa"
                    }
                  />
                </div>
                <div className="lower-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Seu contexto de acesso</h3>
                        <p>Você atua com as permissões deste vínculo.</p>
                      </div>
                      <ShieldCheck size={21} className="green-icon" />
                    </div>
                    <div className="context-summary">
                      <span className="context-icon">
                        <GraduationCap size={25} />
                      </span>
                      <div>
                        <strong>
                          {context?.organization_name ||
                            "Nenhum contexto autorizado"}
                        </strong>
                        <span>
                          {context
                            ? labels[context.role]
                            : "Aguarde um convite verificado"}
                        </span>
                      </div>
                      <span className="active-badge">
                        {context ? "Ativo" : "Pendente"}
                      </span>
                    </div>
                    <label className="context-select-label">
                      Contexto atual
                      <div className="select-wrap">
                        <select
                          aria-label="Contexto atual"
                          value={context?.id || ""}
                          onChange={(e) => {
                            setContext(
                              me.contexts.find(
                                (c) => c.id === e.target.value,
                              ) || null,
                            );
                            setView("overview");
                          }}
                        >
                          {me.contexts.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.organization_name} · {labels[c.role]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} />
                      </div>
                    </label>
                    <p className="small-note">
                      <ShieldCheck size={14} /> Cada contexto possui suas
                      próprias permissões.
                    </p>
                  </section>
                  {!guardian && (
                    <section className="panel next-panel">
                      <span className="tiny-pill">PRÓXIMOS PASSOS</span>
                      <h3>
                        Uma base para
                        <br />
                        seguir com cuidado.
                      </h3>
                      <p>
                        Prepare viagens, revise as previsões e registre a
                        destinação de cada criança. Acompanhe as confirmações, a
                        linha do tempo e as atualizações na central de
                        notificações. Alertas graduais e acompanhamento de
                        ocorrências já estão disponíveis. A conclusão da viagem
                        agora exige contabilização de cada criança e conferência
                        física da van. Histórico, correções e contabilização
                        excepcional já estão disponíveis.
                      </p>
                      <div className="next-step">
                        <span>10</span>
                        <div>
                          <strong>Integração e preparação para operação</strong>
                          <small>
                            Disponível para seu teste · uso real não liberado
                          </small>
                        </div>
                        <ArrowRight size={18} />
                      </div>
                    </section>
                  )}
                </div>
                <div className="privacy-note">
                  <ShieldCheck size={18} />
                  <p>
                    <strong>Acesso com responsabilidade.</strong> Cada pessoa
                    visualiza apenas os contextos em que possui um vínculo
                    ativo.
                  </p>
                </div>
              </details>
            </>
          )}
          {view === "profile" && (
            <section className="panel profile-panel">
              <div className="panel-heading">
                <div>
                  <h3>Informações pessoais</h3>
                  <p>Seu nome identifica as ações registradas no sistema.</p>
                </div>
                <UserRound className="green-icon" />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await request("auth/profile", {
                      method: "PATCH",
                      body: JSON.stringify({ name }),
                    });
                    await loadMe();
                    setNotice("Perfil atualizado.");
                  });
                }}
              >
                <label>
                  Nome completo
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  E-mail
                  <input value={me.user.email} readOnly />
                </label>
                <p className="small-note">
                  Para alterar o e-mail, será necessário um fluxo de verificação
                  futuro.
                </p>
                <Button disabled={busy} type="submit">
                  Salvar alterações
                  <Check size={17} />
                </Button>
              </form>
              <h3 className="contexts-title">Seus vínculos autorizados</h3>
              {me.contexts.map((c) => (
                <div className="profile-context" key={c.id}>
                  <strong>{c.organization_name}</strong>
                  <span>
                    {labels[c.role]}
                    {c.coordinator ? " · Coordenação" : ""}
                    {c.manage_team ? " · Gestão de equipe" : ""}
                  </span>
                </div>
              ))}
            </section>
          )}
          {view === "team" && manager && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    Equipe da escola{" "}
                    <span className="count">{active.length}</span>
                  </h3>
                  <p>
                    A coordenação é uma permissão adicional ao perfil da escola.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setModal(true);
                    setInviteEmail("");
                  }}
                >
                  <Mail size={17} /> Convidar pessoa
                </Button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Permissões</th>
                      <th>Vínculo</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="person-cell">
                            <span className="avatar">{m.name[0]}</span>
                            <div>
                              <strong>{m.name}</strong>
                              <small>{m.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="permission-tags">
                            <span>Operação</span>
                            {m.coordinator && (
                              <span className="coordination-tag">
                                Coordenação
                              </span>
                            )}
                            {m.manage_team && <span>Gestão de equipe</span>}
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              m.active ? "active-badge" : "inactive-badge"
                            }
                          >
                            {m.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td>
                          {m.email === me.user.email ? (
                            <small className="muted">Sua conta</small>
                          ) : (
                            <div className="member-actions">
                              <button
                                disabled={busy}
                                onClick={() =>
                                  updateMember(m, {
                                    coordinator: !m.coordinator,
                                  })
                                }
                              >
                                {m.coordinator
                                  ? "Remover coordenação"
                                  : "Permitir coordenação"}
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  updateMember(m, { active: !m.active })
                                }
                              >
                                {m.active ? "Inativar" : "Reativar"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small-note table-note">
                <ShieldCheck size={14} /> Alterações ficam registradas. Somente
                a gestão autorizada pode editar a equipe.
              </p>
            </section>
          )}
          {view === "audit" && manager && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Registro de ações da escola</h3>
                  <p>
                    Últimos 50 registros deste contexto, com autor e horário.
                  </p>
                </div>
                <ClipboardList className="green-icon" />
              </div>
              {history.length ? (
                history.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <span className="audit-dot" />
                    <div>
                      <strong>{actions[a.action] || a.action}</strong>
                      <span>{a.actor_name}</span>
                    </div>
                    <time>
                      {new Date(a.created_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </time>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Nenhuma ação registrada para esta escola.
                </p>
              )}
            </section>
          )}
          <footer className="content-footer">
            <span>
              caminho<span className="brand-dot">.</span>{" "}
              <small>Mais cuidado em cada trajeto.</small>
            </span>
            <span>
              <ShieldCheck size={14} /> Ambiente de teste
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            className="modal"
          >
            <button
              aria-label="Fechar convite"
              className="close-modal"
              onClick={() => setModal(false)}
            >
              <X size={22} />
            </button>
            <span className="modal-icon">
              <Mail size={26} />
            </span>
            <h2 id="invite-title">Mais uma pessoa no cuidado.</h2>
            <p>
              Convide um funcionário para a operação de{" "}
              {context?.organization_name}. A coordenação pode ser autorizada
              após o aceite.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await request(
                    "workspace/invites",
                    {
                      method: "POST",
                      body: JSON.stringify({ email: inviteEmail }),
                    },
                    context!.id,
                  );
                  await loadTeam(context!);
                  setModal(false);
                  setNotice(
                    "Convite criado. O link de teste está no terminal da API; nenhum e-mail real foi enviado.",
                  );
                });
              }}
            >
              <label>
                E-mail da pessoa
                <input
                  autoFocus
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="pessoa@escola.com.br"
                />
              </label>
              {error && (
                <div className="message error" role="alert">
                  {error}
                </div>
              )}
              <Button disabled={busy} type="submit">
                Criar convite
                <ArrowRight size={17} />
              </Button>
            </form>
            <small>
              O convite expira em 48 horas e libera apenas este contexto.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon,
  value,
  label,
  detail,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  detail: string;
}) {
  return (
    <section className="stat-card">
      <span className="stat-icon">{icon}</span>
      <strong>{value}</strong>
      <span className="stat-label">{label}</span>
      <small>{detail}</small>
    </section>
  );
}
