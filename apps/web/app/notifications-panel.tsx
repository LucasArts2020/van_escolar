"use client";
import { useEffect, useState } from "react";
import {
  Bell,
  ArrowLeft,
  ArrowUpRight,
  Check,
  RefreshCw,
  UserRound,
  Clock3,
} from "lucide-react";
import {
  ChildrenHome,
  Inbox,
  Journey,
  pushLabels,
  shortDate,
} from "../../shared/notifications";
import {
  MovementKind,
  passengerMovementLabels,
  movementRoleLabels,
} from "../../shared/trips";
import MovementsPanel from "./movements-panel";
import type { JourneyTarget } from "../../shared/navigation";
type Context = { id: string; role: "GUARDIAN" | "DRIVER" | "SCHOOL" };
export default function NotificationsPanel({
  context,
  home = false,
  initialId = "",
  onOpenTarget,
  onSelect,
  active = true,
}: {
  context: Context;
  home?: boolean;
  initialId?: string;
  onOpenTarget?: (target: JourneyTarget) => void;
  onSelect?: (id: string) => void;
  active?: boolean;
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
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Context-Id": context.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Não foi possível atualizar.");
    return data;
  }
  const path = selection
    ? "notifications/" +
      (selection.kind === "child" ? "children/" : "") +
      selection.id
    : "";
  useEffect(() => {
    setJourney(null);
  }, [context.id, path, home]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setError("");
    setLoaded(false);
    const load = async () => {
      try {
        const result = path
          ? await api<Journey>(path)
          : home
            ? await api<ChildrenHome>("notifications/home")
            : await api<Inbox>("notifications");
        if (!alive) return;
        if (path) setJourney(result as Journey);
        else if (home) setChildren(result as ChildrenHome);
        else setInbox(result as Inbox);
        setError("");
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setJourney(null);
          setChildren(null);
          setInbox(null);
        }
      } finally {
        if (alive) setLoaded(true);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [context.id, path, home, active]);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      if (path) setJourney(await api<Journey>(path));
      else if (home) setChildren(await api<ChildrenHome>("notifications/home"));
      else setInbox(await api<Inbox>("notifications"));
    } catch (e) {
      setError((e as Error).message);
      setJourney(null);
      setChildren(null);
      setInbox(null);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(kind: MovementKind) {
    if (!journey) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `trips/${journey.trip.id}/passengers/${journey.passenger.id}/movements/${kind}/confirm`,
        {},
      );
      setJourney(await api<Journey>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const time = (at: string, timezone?: string) =>
    new Date(at).toLocaleString("pt-BR", {
      timeZone: timezone || journey?.trip.timezone || "America/Sao_Paulo",
    });
  return (
    <section
      className="updates-panel"
      aria-label={home ? "Situação dos filhos" : "Central de notificações"}
    >
      <div className="updates-heading">
        <div>
          <span className="eyebrow">
            {home
              ? "SEUS FILHOS, EM CADA ETAPA"
              : "ATUALIZAÇÕES DO SEU CONTEXTO"}
          </span>
          <h2>
            {selection
              ? "Acompanhar criança"
              : home
                ? "Como está o caminho de hoje?"
                : "Central de notificações"}
          </h2>
          <p>
            {selection
              ? "Confira o registro original e a situação atual abaixo."
              : home
                ? "Acompanhe a última viagem e as confirmações de cada filho."
                : `${inbox?.unread || 0} não lidas · atualiza a cada 15 segundos`}
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void refresh()}
          aria-label="Atualizar notificações"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {selection && (
        <button className="text-button" onClick={() => setSelection(null)}>
          <ArrowLeft size={16} /> Voltar{" "}
          {home ? "aos filhos" : "às notificações"}
        </button>
      )}
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {!loaded && (
        <p className="muted" role="status">
          Carregando atualizações…
        </p>
      )}
      {!selection && home && children && (
        <div className="child-status-grid">
          {children.children.map((child) => (
            <article className="child-status-card" key={child.id}>
              <div className="child-title">
                <span>
                  <UserRound size={22} />
                </span>
                <h3>{child.name}</h3>
              </div>
              {child.current ? (
                <>
                  <span className="child-state">
                    {passengerMovementLabels[child.current.state]}
                  </span>
                  <p>
                    {shortDate(child.current.date)} ·{" "}
                    {child.current.direction === "OUTBOUND"
                      ? "Ida à escola"
                      : "Volta para casa"}
                  </p>
                  {child.current.possiblyOnboard && (
                    <p className="pending-label">Possivelmente a bordo</p>
                  )}
                  {child.current.deliveryUnderReview && (
                    <p className="pending-label">
                      Recebimento sob verificação · relato de risco aberto
                    </p>
                  )}
                  {child.current.openIssues > 0 && (
                    <p className="pending-label">
                      {child.current.openIssues} ocorrência(s) aberta(s)
                    </p>
                  )}
                  {child.current.movements
                    .filter((m) => m.state === "INFORMED")
                    .map((m) => (
                      <p className="small-note" key={m.kind}>
                        {m.kind === "BOARDING" ? "Embarque" : "Desembarque"}:
                        falta{" "}
                        {m.missingRoles
                          .map((r) => movementRoleLabels[r])
                          .join(" e ")
                          .toLowerCase()}
                        .
                      </p>
                    ))}
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setSelection({
                        kind: "child",
                        id: child.current!.passengerId,
                      })
                    }
                  >
                    Acompanhar viagem
                    <ArrowUpRight size={16} />
                  </button>
                </>
              ) : (
                <p className="muted">
                  Sem viagem registrada até hoje. Consulte o planejamento para
                  os próximos dias.
                </p>
              )}
            </article>
          ))}
          {!children.children.length && (
            <p className="updates-empty">
              Nenhum filho com vínculo operacional ativo neste contexto.
            </p>
          )}
        </div>
      )}
      {!selection && !home && inbox && (
        <div className="notification-list">
          {inbox.items.map((n) => (
            <button
              key={n.id}
              className={"notification-row " + (!n.readAt ? "unread" : "")}
              onClick={() => {
                setSelection({ kind: "notification", id: n.id });
                onSelect?.(n.id);
              }}
            >
              <span className="notification-icon">
                <Bell size={20} />
              </span>
              <span className="notification-copy">
                <strong>{n.title}</strong>
                <span>
                  {n.studentName} · {shortDate(n.target.date)} ·{" "}
                  {n.target.direction === "OUTBOUND" ? "Ida" : "Volta"}
                </span>
                <span>{n.body}</span>
                <small>
                  {n.pending
                    ? "Sua confirmação está pendente"
                    : n.purpose === "ACTION"
                      ? "Ação não está mais pendente"
                      : "Atualização de acompanhamento"}
                </small>
              </span>
              <span className="notification-meta">
                <time>{time(n.createdAt, n.timezone)}</time>
                <small>{n.readAt ? "Lida" : "Não lida"}</small>
                <ArrowUpRight size={17} />
              </span>
            </button>
          ))}
          {!inbox.items.length && (
            <div className="updates-empty">
              <Bell size={28} />
              <h3>Tudo acompanhado por aqui.</h3>
              <p>Novas confirmações e ocorrências aparecerão nesta central.</p>
            </div>
          )}
          {inbox.hasMore && (
            <p className="small-note">
              Exibindo as 50 atualizações mais recentes. O histórico da criança
              está na linha do tempo.
            </p>
          )}
        </div>
      )}
      {journey && (
        <div className="journey-detail">
          {journey.notification && (
            <article className="notification-original">
              <span className="eyebrow">REGISTRO DA ATUALIZAÇÃO</span>
              <h3>{journey.notification.title}</h3>
              {journey.notification.target.alertId && (
                <a
                  className="alert-button"
                  href={`?alert=${journey.notification.target.alertId}&context=${context.id}`}
                  onClick={
                    onOpenTarget
                      ? (event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          onOpenTarget({
                            view: "alerts",
                            contextId: context.id,
                            date: journey.trip.service_date,
                            studentId: journey.passenger.student_id,
                            passengerId: journey.passenger.id,
                            tripId: journey.trip.id,
                            alertId:
                              journey.notification!.target.alertId || undefined,
                          });
                        }
                      : undefined
                  }
                >
                  Abrir ocorrência e acompanhamento
                </a>
              )}
              <p>{journey.notification.body}</p>
              <p className="small-note">
                {time(journey.notification.createdAt)} ·{" "}
                {journey.notification.pending
                  ? "Sua confirmação está pendente agora."
                  : "Nenhuma confirmação sua é cobrada por esta mensagem agora."}
              </p>
              {!journey.notification.readAt ? (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(
                        `notifications/${journey.notification!.id}/read`,
                        {},
                      );
                      setJourney(await api<Journey>(path));
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Check size={16} />
                  Marcar como lida
                </button>
              ) : (
                <span className="read-label">
                  <Check size={15} />
                  Lida em {time(journey.notification.readAt)}
                </span>
              )}
              <small>
                Ler esta mensagem não confirma movimentação nem resolve
                ocorrência.
              </small>
            </article>
          )}
          <div className="journey-title">
            <div>
              <span className="eyebrow">SITUAÇÃO ATUAL</span>
              <h3>{journey.passenger.student_name}</h3>
              <p>
                {shortDate(journey.trip.service_date)} ·{" "}
                {journey.trip.direction === "OUTBOUND"
                  ? "Ida à escola"
                  : "Volta para casa"}{" "}
                · {journey.passenger.school_name}
              </p>
            </div>
          </div>
          <MovementsPanel
            contextId={context.id}
            trip={journey.trip}
            passenger={journey.passenger}
            role={context.role}
            busy={busy}
            onConfirm={(kind) => void confirm(kind)}
            focusKind={journey.notification?.target.kind}
          />
          {onOpenTarget && (
            <button
              className="text-button"
              onClick={() =>
                onOpenTarget({
                  view: "history",
                  contextId: context.id,
                  date: journey.trip.service_date,
                  studentId: journey.passenger.student_id,
                  passengerId: journey.passenger.id,
                  tripId: journey.trip.id,
                })
              }
            >
              Histórico e correções desta criança
            </button>
          )}
          <section className="journey-timeline">
            <h3>
              <Clock3 size={18} />
              Linha do tempo desta criança
            </h3>
            <p className="small-note">
              Horários recebidos pelo servidor no fuso {journey.trip.timezone}.
            </p>
            <ol>
              {journey.timeline.map((item) => (
                <li key={item.id}>
                  <time>{time(item.at)}</time>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </li>
              ))}
            </ol>
            {!journey.timeline.length && (
              <p className="muted">
                Aguardando o primeiro registro de movimentação.
              </p>
            )}
          </section>
          {journey.notification && (
            <details className="notification-delivery">
              <summary>Envio ao celular e tentativas</summary>
              <p>
                {pushLabels[journey.notification.pushNote] ||
                  journey.notification.pushNote}
              </p>
              {journey.notification.deliveries.map((d) => (
                <p key={d.id}>
                  {pushLabels[d.status] || d.status} · {d.attempts} tentativa(s)
                  de envio · {d.receipt_attempts} consulta(s) de recibo{" "}
                  {d.error_code ? `· ${d.error_code}` : ""}
                </p>
              ))}
              {journey.attempts?.map((a, i) => (
                <p className="small-note" key={i}>
                  {time(a.created_at)} ·{" "}
                  {a.phase === "SEND" ? "Envio" : "Recibo"} {a.attempt} ·{" "}
                  {a.error_code || pushLabels[a.status] || a.status}
                </p>
              ))}
              <p className="small-note">
                Aceitação pelo provedor não comprova exibição ou leitura no
                aparelho. O estado da movimentação é independente do envio.
              </p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
