"use client";
import { useEffect, useState } from "react";
import {
  HistoryDetail,
  Correction,
  correctionLabels,
  historyEvents,
  historyTime,
  resolutionLabels,
} from "../../shared/history";
import { useHistory } from "../../shared/use-history";
import type { JourneyTarget } from "../../shared/navigation";
import { tripLabels, movementRoleLabels } from "../../shared/trips";
import { alertKinds, alertStatuses } from "../../shared/alerts";
import { History, RefreshCw, Settings2 } from "lucide-react";
export default function HistoryPanel({
  context,
  onNavigate,
  initialTarget,
  onOpenTarget,
}: {
  context: { id: string; role?: string };
  onNavigate: (view: string) => void;
  initialTarget?: JourneyTarget;
  onOpenTarget?: (target: JourneyTarget) => void;
}) {
  const h = useHistory(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      let response: Response;
      try {
        response = await fetch("/api/" + path, {
          method: body ? "POST" : "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Context-Id": context.id,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new Error(
          "Sem comunicação com o servidor. A ação não foi apresentada como recebida. Atualize o histórico antes de repetir.",
        );
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || "Não foi possível consultar ou registrar.",
        );
      return data;
    },
    () => crypto.randomUUID(),
    initialTarget,
  );
  const disabled = h.busy || h.loading;
  return (
    <div className="history-root">
      {h.error && (
        <p className="message error" role="alert">
          {h.error}
        </p>
      )}
      {h.notice && (
        <p className="message success" role="status">
          {h.notice}
        </p>
      )}
      {!initialTarget?.passengerId && (
        <section
          className="panel history-filters"
          aria-label="Filtros do histórico"
        >
          <label>
            De
            <input
              type="date"
              aria-label="Histórico de"
              value={h.from}
              onChange={(e) => h.setFrom(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              aria-label="Histórico até"
              value={h.to}
              onChange={(e) => h.setTo(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label>
            Criança
            <select
              aria-label="Criança no histórico"
              value={h.student}
              onChange={(e) => h.setStudent(e.target.value)}
              disabled={disabled}
            >
              <option value="">Todas as autorizadas</option>
              {h.options?.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.id.slice(-8)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={disabled || !h.from || !h.to}
            onClick={() => void h.search(0)}
          >
            <RefreshCw size={15} />
            Consultar histórico
          </button>
          {h.trip && (
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => {
                h.setTrip("");
                void h.search(0, "");
              }}
            >
              Remover filtro de viagem
            </button>
          )}
        </section>
      )}
      {h.loading && (
        <p role="status">Consultando registros recebidos pelo servidor…</p>
      )}
      {h.detail ? (
        <HistoryRecord
          key={h.detail.passenger.id}
          detail={h.detail}
          busy={disabled}
          onBack={h.back}
          submit={h.submit}
          onOpenAlert={
            onOpenTarget
              ? (id) =>
                  onOpenTarget({
                    view: "alerts",
                    contextId: context.id,
                    date: h.detail!.trip.service_date,
                    studentId: h.detail!.passenger.student_id,
                    tripId: h.detail!.trip.id,
                    passengerId: h.detail!.passenger.id,
                    alertId: id,
                  })
              : undefined
          }
          focusAlertId={initialTarget?.alertId}
          contextual={!!initialTarget?.passengerId}
        />
      ) : (
        <section className="panel" aria-label="Resultados do histórico">
          <div className="panel-heading">
            <div>
              <span className="eyebrow green">HISTÓRICO</span>
              <h2>Cada registro mantém sua autoria.</h2>
            </div>
            <History size={25} />
          </div>
          <p className="registry-note">
            Até 93 dias por consulta. Crianças e totais respeitam seu contexto
            atual, inclusive quando um vínculo é revogado.
          </p>
          {!h.loading && !h.list.items.length && (
            <p className="registry-note">
              Nenhuma participação autorizada neste intervalo.
            </p>
          )}
          <div className="history-list">
            {h.list.items.map((p) => (
              <article key={p.id}>
                <button
                  className="history-open"
                  disabled={disabled}
                  onClick={() => void h.open(p.id)}
                >
                  <strong>{p.student_name}</strong>
                  <span>
                    {p.service_date.split("-").reverse().join("/")} ·{" "}
                    {p.direction === "OUTBOUND" ? "Ida" : "Volta"} ·{" "}
                    {p.vehicle_name}
                  </span>
                  <small>
                    {p.school_name} · {tripLabels[p.status]}
                    {p.exceptional ? " · Contabilização excepcional" : ""}
                    {p.pending_corrections ? " · Correção pendente" : ""}
                  </small>
                </button>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => {
                    h.setTrip(p.trip_id);
                    void h.search(0, p.trip_id);
                  }}
                >
                  Filtrar esta viagem
                </button>
              </article>
            ))}
          </div>
          <div className="planning-actions">
            <button
              className="text-button"
              disabled={disabled || h.offset === 0}
              onClick={() => void h.search(Math.max(0, h.offset - 30))}
            >
              Anterior
            </button>
            <span>Página {Math.floor(h.offset / 30) + 1}</span>
            <button
              className="text-button"
              disabled={disabled || !h.list.hasMore}
              onClick={() => void h.search(h.list.nextOffset)}
            >
              Próxima
            </button>
          </div>
        </section>
      )}
      {h.options && context.role !== "SCHOOL" && (
        <details className="panel history-settings">
          <summary>
            <Settings2 size={17} />
            Operação, permissões e indisponibilidade
          </summary>
          <p>{h.options.exceptionalAuthority}</p>
          {h.options.operations.map((o) => (
            <article key={o.transport_id}>
              <strong>{o.name}</strong>
              <p>
                Fuso: {o.timezone} · limite:{" "}
                {o.cutoff_time?.slice(0, 5) || "Não configurado"}
              </p>
              <p>
                Alertas:{" "}
                {o.reminder_minutes === null
                  ? "Não configurados"
                  : `${o.reminder_minutes} / ${o.attention_minutes} / ${o.critical_minutes} minutos`}
              </p>
            </article>
          ))}
          {h.options.canConfigure && (
            <div className="planning-actions">
              <button
                className="text-button"
                onClick={() => onNavigate("planning")}
              >
                Configurar planejamento
              </button>
              <button
                className="text-button"
                onClick={() => onNavigate("alerts")}
              >
                Configurar alertas
              </button>
            </div>
          )}
          <h3>Sem internet ou servidor indisponível</h3>
          <p>{h.options.offlineProcedure}</p>
          <p>{h.options.retention}</p>
        </details>
      )}
    </div>
  );
}
type Submit = (
  path: string,
  body: Record<string, unknown>,
  message: string,
  withId?: boolean,
) => Promise<void>;
function HistoryRecord({
  detail: d,
  busy,
  onBack,
  submit,
  onOpenAlert,
  focusAlertId,
  contextual = false,
}: {
  detail: HistoryDetail;
  busy: boolean;
  onBack: () => void;
  submit: Submit;
  onOpenAlert?: (id: string) => void;
  focusAlertId?: string;
  contextual?: boolean;
}) {
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [account, setAccount] = useState("");
  useEffect(() => {
    setTarget("");
    setReason("");
    setAccount("");
  }, [d.trip.version]);
  const time = (at: string) => historyTime(at, d.trip.timezone);
  return (
    <section className="panel history-detail" aria-label="Detalhe do histórico">
      {!contextual && (
        <button className="text-button" onClick={onBack} disabled={busy}>
          ← Voltar ao histórico
        </button>
      )}
      <span className="eyebrow green">
        {d.trip.direction === "OUTBOUND" ? "IDA" : "VOLTA"} ·{" "}
        {d.trip.service_date.split("-").reverse().join("/")}
      </span>
      <h2>{d.passenger.student_name}</h2>
      <p className="registry-note">
        {d.trip.vehicle_name} · {d.trip.driver_name} ·{" "}
        {tripLabels[d.trip.status]}
      </p>
      {d.trip.status === "COMPLETED_REVIEW" && (
        <p className="message error">
          A conclusão está sob revisão. O encerramento anterior e sua
          conferência foram preservados. Resolver a divergência não conclui a
          viagem automaticamente.
        </p>
      )}
      {d.passenger.exceptionalResolution && (
        <p className="history-exception" role="status">
          Contabilizada excepcionalmente por{" "}
          {d.passenger.exceptionalResolution.actorName}. Esse registro é
          distinto da dupla confirmação normal.
        </p>
      )}
      <h3>Confirmações originais</h3>
      <div className="history-confirmations">
        {d.confirmations.map((c) => (
          <article key={c.id}>
            <strong>
              {c.kind === "BOARDING" ? "Embarque" : "Desembarque"} ·{" "}
              {movementRoleLabels[c.role]}
            </strong>
            <p>
              {c.actor_name} · {time(c.received_at)}
            </p>
            <small>Registro {c.id}</small>
            {d.corrections
              .filter((r) => r.confirmation_id === c.id)
              .map((r) => (
                <p className="history-state" key={r.id}>
                  {correctionLabels[r.status]}
                </p>
              ))}
            {c.canRequestCorrection && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setTarget(c.id)}
              >
                Solicitar correção deste registro
              </button>
            )}
          </article>
        ))}
      </div>
      {!d.confirmations.length && (
        <p className="registry-note">
          Nenhuma confirmação registrada. O sistema não presume embarque ou
          entrega.
        </p>
      )}
      {target && (
        <form
          className="history-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              `history/${d.passenger.id}/corrections`,
              {
                confirmationId: target,
                expectedVersion: d.trip.version,
                reason,
                account,
              },
              "Solicitação registrada. A confirmação original permanece preservada.",
              true,
            );
          }}
        >
          <h3>Solicitar correção da minha confirmação</h3>
          <p className="registry-note">
            Registro original: {target}. A solicitação abre uma divergência
            crítica; não altera a confirmação de outra pessoa.
          </p>
          <Note
            label="Motivo da correção"
            value={reason}
            set={setReason}
            disabled={busy}
          />
          <Note
            label="Relato corrigido dos fatos"
            value={account}
            set={setAccount}
            disabled={busy}
          />
          <button
            className="button"
            disabled={
              busy || reason.trim().length < 20 || account.trim().length < 20
            }
          >
            Enviar solicitação de correção
          </button>
        </form>
      )}
      <h3>Solicitações e decisões</h3>
      {!d.corrections.length && (
        <p className="registry-note">Nenhuma correção solicitada.</p>
      )}
      {d.corrections.map((c) => (
        <article className="history-correction" key={c.id}>
          <strong>{correctionLabels[c.status]}</strong>
          <p>
            {c.actor_name} · {time(c.created_at)}
          </p>
          <p>
            <b>Motivo:</b> {c.reason}
          </p>
          <p>
            <b>Relato:</b> {c.account}
          </p>
          <small>Confirmação original: {c.confirmation_id}</small>
          {c.decided_at && (
            <>
              <p>
                {c.decision_actor_name} · {time(c.decided_at)} ·{" "}
                {c.decision_reason}
              </p>
              <p>Contatos: {c.contacts}</p>
              <p>Verificação: {c.verification}</p>
            </>
          )}
          {d.canReview && c.status === "PENDING" && (
            <Decision
              key={c.id}
              detail={d}
              correction={c}
              busy={busy}
              submit={submit}
            />
          )}
        </article>
      ))}
      {d.canResolveException && (
        <Exceptional
          key={d.trip.version}
          detail={d}
          busy={busy}
          submit={submit}
        />
      )}
      {d.canReview && d.corrections.some((c) => c.status === "PENDING") && (
        <p className="registry-note">
          Decida as correções pendentes antes de registrar uma resolução
          excepcional.
        </p>
      )}
      {!!d.resolutions.length && (
        <>
          <h3>Contabilizações excepcionais</h3>
          {d.resolutions.map((r) => (
            <article className="history-exception" key={r.id}>
              <strong>
                {r.current
                  ? "Vigente"
                  : "Anterior — novos fatos exigiram revisão"}
              </strong>
              <p>
                {r.actor_name} · {time(r.created_at)} ·{" "}
                {r.outcome === "DELIVERED"
                  ? "Entrega verificada excepcionalmente"
                  : "Não transportada, verificada excepcionalmente"}
                {r.recipient_name ? " · " + r.recipient_name : ""}
              </p>
              <p>{r.reason}</p>
              <p>Contatos: {r.contacts}</p>
              <p>Verificação: {r.verification}</p>
            </article>
          ))}
        </>
      )}
      <h3>Ocorrências</h3>
      {d.alerts.map((a) => (
        <article
          className={
            "history-correction" +
            (a.id === focusAlertId ? " history-focused-occurrence" : "")
          }
          key={a.id}
        >
          <strong>
            {alertKinds[a.kind]} · {alertStatuses[a.status]}
          </strong>
          <p>
            {time(a.origin_at)}
            {a.resolution_kind
              ? " · " +
                (resolutionLabels[a.resolution_kind] || a.resolution_kind)
              : ""}
          </p>
          {a.resolution_note && <p>{a.resolution_note}</p>}
          {onOpenAlert && (
            <button className="text-button" onClick={() => onOpenAlert(a.id)}>
              Abrir atendimento desta ocorrência
            </button>
          )}
        </article>
      ))}
      <details className="history-timeline" open>
        <summary>Linha do tempo dos registros</summary>
        {historyEvents(d).map((e) => (
          <article key={e.id}>
            <time>{time(e.at)}</time>
            <strong>{e.title}</strong>
            <p>{e.body}</p>
          </article>
        ))}
      </details>
    </section>
  );
}
function Note({
  label,
  value,
  set,
  disabled,
}: {
  label: string;
  value: string;
  set: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <label>
      {label}
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={2000}
        disabled={disabled}
        minLength={20}
        required
        placeholder="Descreva em pelo menos 20 caracteres."
      />
    </label>
  );
}
function Decision({
  detail: d,
  correction: c,
  busy,
  submit,
}: {
  detail: HistoryDetail;
  correction: Correction;
  busy: boolean;
  submit: Submit;
}) {
  const [reason, setReason] = useState(""),
    [contacts, setContacts] = useState(""),
    [verification, setVerification] = useState("");
  const disabled =
    busy || [reason, contacts, verification].some((v) => v.trim().length < 20);
  return (
    <div className="history-form">
      <h4>Decisão da coordenação</h4>
      <Note
        label="Motivo da decisão"
        value={reason}
        set={setReason}
        disabled={busy}
      />
      <Note
        label="Contatos realizados para a decisão"
        value={contacts}
        set={setContacts}
        disabled={busy}
      />
      <Note
        label="Verificações realizadas para a decisão"
        value={verification}
        set={setVerification}
        disabled={busy}
      />
      <p className="registry-note">
        Aprovar acrescenta a retificação e mantém a divergência até a
        contabilização excepcional. Rejeitar mantém a confirmação original
        vigente.
      </p>
      <div className="planning-actions">
        {[
          ["APPROVED", "Aprovar correção"],
          ["REJECTED", "Rejeitar correção"],
        ].map(([decision, label]) => (
          <button
            key={decision}
            className="button"
            disabled={disabled}
            onClick={() =>
              void submit(
                `history/${d.passenger.id}/corrections/${c.id}/decision`,
                {
                  expectedVersion: c.version,
                  decision,
                  reason,
                  contacts,
                  verification,
                },
                "Decisão registrada com autoria e verificações.",
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
function Exceptional({
  detail: d,
  busy,
  submit,
}: {
  detail: HistoryDetail;
  busy: boolean;
  submit: Submit;
}) {
  const [reason, setReason] = useState(""),
    [contacts, setContacts] = useState(""),
    [verification, setVerification] = useState(""),
    [outcome, setOutcome] = useState("DELIVERED"),
    [recipient, setRecipient] = useState(""),
    [physical, setPhysical] = useState(false);
  return (
    <form
      className="history-form history-exception"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          `history/${d.passenger.id}/exceptional-resolution`,
          {
            expectedVersion: d.trip.version,
            reason,
            contacts,
            verification,
            outcome,
            physicalCheck: true,
            ...(outcome === "DELIVERED" ? { recipientId: recipient } : {}),
          },
          "Contabilização excepcional registrada. A viagem ainda exige conferência final do motorista.",
          true,
        );
      }}
    >
      <h3>Resolução excepcional pela coordenação</h3>
      <p>
        Este registro contabiliza a criança após verificação e preserva as
        confirmações ausentes ou corrigidas. Não equivale à dupla confirmação
        normal.
      </p>
      <label>
        Resultado da verificação
        <select
          aria-label="Resultado excepcional"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          disabled={busy}
        >
          <option value="DELIVERED">Entrega verificada excepcionalmente</option>
          <option value="NOT_TRANSPORTED">
            Não transportada — nenhuma confirmação vigente
          </option>
        </select>
      </label>
      {outcome === "DELIVERED" && (
        <label>
          Recebedor verificado
          <select
            aria-label="Recebedor verificado"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={busy}
          >
            <option value="">Selecione um vínculo ativo e autorizado</option>
            {d.recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {movementRoleLabels[r.role]}
              </option>
            ))}
          </select>
        </label>
      )}
      <Note
        label="Motivo da resolução excepcional"
        value={reason}
        set={setReason}
        disabled={busy}
      />
      <Note
        label="Contatos realizados na resolução"
        value={contacts}
        set={setContacts}
        disabled={busy}
      />
      <Note
        label="Verificação física e destinação da criança"
        value={verification}
        set={setVerification}
        disabled={busy}
      />
      <label className="history-check">
        <input
          type="checkbox"
          checked={physical}
          onChange={(e) => setPhysical(e.target.checked)}
          disabled={busy}
        />
        Registrei a verificação física e identifiquei a destinação segura da
        criança.
      </label>
      <button
        className="button"
        disabled={
          busy ||
          !physical ||
          [reason, contacts, verification].some((s) => s.trim().length < 20) ||
          (outcome === "DELIVERED" && !recipient)
        }
      >
        Registrar resolução excepcional
      </button>
    </form>
  );
}
