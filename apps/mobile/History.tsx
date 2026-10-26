import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { randomUUID } from "expo-crypto";
import { useHistory, HistoryClient } from "../shared/use-history";
import type { JourneyTarget } from "../shared/navigation";
import {
  Correction,
  HistoryDetail,
  correctionLabels,
  historyEvents,
  historyTime,
  resolutionLabels,
} from "../shared/history";
import { movementRoleLabels, tripLabels } from "../shared/trips";
import { alertKinds, alertStatuses } from "../shared/alerts";
type Submit = (
  path: string,
  body: Record<string, unknown>,
  message: string,
  withId?: boolean,
) => Promise<void>;
export default function History({
  client,
  onNavigate,
  initialTarget,
  role,
}: {
  client: HistoryClient;
  onNavigate: (view: string) => void;
  initialTarget?: JourneyTarget;
  role?: string;
}) {
  const h = useHistory(client, randomUUID, initialTarget),
    disabled = h.busy || h.loading;
  const [settings, setSettings] = useState(false),
    [children, setChildren] = useState(false);
  return (
    <View style={s.root}>
      {h.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {h.error}
        </Text>
      ) : null}
      {h.notice ? (
        <Text accessibilityLiveRegion="polite" style={s.success}>
          {h.notice}
        </Text>
      ) : null}
      {!h.detail && (
        <View style={s.card}>
          <Text style={s.title}>Histórico por criança, viagem e data</Text>
          <Text style={s.note}>
            Até 93 dias por consulta. Os registros respeitam seu contexto atual.
          </Text>
          <Field
            label="De (AAAA-MM-DD)"
            value={h.from}
            set={h.setFrom}
            disabled={disabled}
            short
          />
          <Field
            label="Até (AAAA-MM-DD)"
            value={h.to}
            set={h.setTo}
            disabled={disabled}
            short
          />
          <Action
            label={
              h.student
                ? h.options?.students.find((v) => v.id === h.student)?.name ||
                  "Escolher criança"
                : "Todas as crianças autorizadas"
            }
            onPress={() => setChildren(!children)}
            disabled={disabled}
            secondary
          />
          {children && (
            <View>
              <Action
                label="Todas as crianças autorizadas"
                onPress={() => {
                  h.setStudent("");
                  setChildren(false);
                }}
                disabled={disabled}
                secondary
              />
              {h.options?.students.map((v) => (
                <Action
                  key={v.id}
                  label={v.name + " · " + v.id.slice(-8)}
                  disabled={disabled}
                  secondary
                  onPress={() => {
                    h.setStudent(v.id);
                    setChildren(false);
                  }}
                />
              ))}
            </View>
          )}
          <Action
            label="Consultar histórico"
            disabled={disabled || !h.from || !h.to}
            onPress={() => void h.search(0)}
          />
          {h.trip && (
            <Action
              label="Remover filtro de viagem"
              disabled={disabled}
              secondary
              onPress={() => {
                h.setTrip("");
                void h.search(0, "");
              }}
            />
          )}
        </View>
      )}
      {h.loading && <ActivityIndicator color="#43566d" />}
      {h.detail ? (
        <Record
          key={h.detail.passenger.id}
          detail={h.detail}
          busy={disabled}
          submit={h.submit}
          back={h.back}
        />
      ) : (
        <View style={s.card}>
          {!h.loading && !h.list.items.length && (
            <Text style={s.note}>
              Nenhuma participação autorizada neste intervalo.
            </Text>
          )}
          {h.list.items.map((p) => (
            <View key={p.id} style={s.item}>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void h.open(p.id)}
              >
                <Text style={s.title}>{p.student_name}</Text>
                <Text style={s.note}>
                  {p.service_date.split("-").reverse().join("/")} ·{" "}
                  {p.direction === "OUTBOUND" ? "Ida" : "Volta"} ·{" "}
                  {p.vehicle_name}
                  {"\n"}
                  {p.school_name} · {tripLabels[p.status]}
                  {p.exceptional ? " · Contabilização excepcional" : ""}
                  {p.pending_corrections ? " · Correção pendente" : ""}
                </Text>
              </Pressable>
              <Action
                label="Filtrar esta viagem"
                secondary
                disabled={disabled}
                onPress={() => {
                  h.setTrip(p.trip_id);
                  void h.search(0, p.trip_id);
                }}
              />
            </View>
          ))}
          <Text style={s.note}>Página {Math.floor(h.offset / 30) + 1}</Text>
          <Action
            label="Anterior"
            disabled={disabled || h.offset === 0}
            secondary
            onPress={() => void h.search(Math.max(0, h.offset - 30))}
          />
          <Action
            label="Próxima"
            disabled={disabled || !h.list.hasMore}
            secondary
            onPress={() => void h.search(h.list.nextOffset)}
          />
        </View>
      )}
      {h.options && role !== "SCHOOL" && (
        <View style={s.card}>
          <Action
            label="Operação, permissões e indisponibilidade"
            secondary
            onPress={() => setSettings(!settings)}
            disabled={h.busy}
          />
          {settings && (
            <>
              <Text style={s.note}>{h.options.exceptionalAuthority}</Text>
              {h.options.operations.map((o) => (
                <View key={o.transport_id} style={s.item}>
                  <Text style={s.title}>{o.name}</Text>
                  <Text style={s.note}>
                    Fuso: {o.timezone} · limite:{" "}
                    {o.cutoff_time?.slice(0, 5) || "Não configurado"}
                    {"\n"}Alertas:{" "}
                    {o.reminder_minutes === null
                      ? "Não configurados"
                      : `${o.reminder_minutes} / ${o.attention_minutes} / ${o.critical_minutes} minutos`}
                  </Text>
                </View>
              ))}
              {h.options.canConfigure && (
                <>
                  <Action
                    label="Configurar planejamento"
                    secondary
                    onPress={() => onNavigate("planning")}
                    disabled={h.busy}
                  />
                  <Action
                    label="Configurar alertas"
                    secondary
                    onPress={() => onNavigate("alerts")}
                    disabled={h.busy}
                  />
                </>
              )}
              <Text style={s.title}>Sem internet ou servidor indisponível</Text>
              <Text style={s.note}>{h.options.offlineProcedure}</Text>
              <Text style={s.note}>{h.options.retention}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}
function Record({
  detail: d,
  busy,
  submit,
  back,
}: {
  detail: HistoryDetail;
  busy: boolean;
  submit: Submit;
  back: () => void;
}) {
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [account, setAccount] = useState(""),
    [timeline, setTimeline] = useState(false);
  useEffect(() => {
    setTarget("");
    setReason("");
    setAccount("");
  }, [d.trip.version]);
  const time = (at: string) => historyTime(at, d.trip.timezone);
  return (
    <View style={s.card}>
      <Action
        label="← Voltar ao histórico"
        disabled={busy}
        secondary
        onPress={back}
      />
      <Text style={s.title}>{d.passenger.student_name}</Text>
      <Text style={s.note}>
        {d.trip.service_date.split("-").reverse().join("/")} ·{" "}
        {d.trip.direction === "OUTBOUND" ? "Ida" : "Volta"}
        {"\n"}
        {d.trip.vehicle_name} · {d.trip.driver_name} ·{" "}
        {tripLabels[d.trip.status]}
      </Text>
      {d.trip.status === "COMPLETED_REVIEW" && (
        <Text style={s.error}>
          Conclusão sob revisão. O encerramento anterior permanece preservado.
          Resolver a divergência não conclui a viagem automaticamente.
        </Text>
      )}
      {d.passenger.exceptionalResolution && (
        <Text style={s.exception}>
          Contabilizada excepcionalmente por{" "}
          {d.passenger.exceptionalResolution.actorName}. Esse registro é
          distinto da dupla confirmação normal.
        </Text>
      )}
      <Text style={s.title}>Confirmações originais</Text>
      {!d.confirmations.length && (
        <Text style={s.note}>
          Nenhuma confirmação registrada. O sistema não presume embarque ou
          entrega.
        </Text>
      )}
      {d.confirmations.map((c) => (
        <View style={s.item} key={c.id}>
          <Text style={s.title}>
            {c.kind === "BOARDING" ? "Embarque" : "Desembarque"} ·{" "}
            {movementRoleLabels[c.role]}
          </Text>
          <Text style={s.note}>
            {c.actor_name} · {time(c.received_at)}
            {"\n"}Registro {c.id}
          </Text>
          {d.corrections
            .filter((r) => r.confirmation_id === c.id)
            .map((r) => (
              <Text style={s.note} key={r.id}>
                {correctionLabels[r.status]}
              </Text>
            ))}
          {c.canRequestCorrection && (
            <Action
              label="Solicitar correção deste registro"
              disabled={busy}
              secondary
              onPress={() => setTarget(c.id)}
            />
          )}
        </View>
      ))}
      {target && (
        <View style={s.form}>
          <Text style={s.title}>Solicitar correção da minha confirmação</Text>
          <Text style={s.note}>
            Registro {target}. A solicitação abre divergência crítica e preserva
            os autores originais.
          </Text>
          <Field
            label="Motivo da correção"
            value={reason}
            set={setReason}
            disabled={busy}
          />
          <Field
            label="Relato corrigido dos fatos"
            value={account}
            set={setAccount}
            disabled={busy}
          />
          <Action
            label="Enviar solicitação de correção"
            disabled={
              busy || [reason, account].some((v) => v.trim().length < 20)
            }
            onPress={() =>
              void submit(
                `history/${d.passenger.id}/corrections`,
                {
                  expectedVersion: d.trip.version,
                  confirmationId: target,
                  reason,
                  account,
                },
                "Solicitação registrada. A confirmação original permanece preservada.",
                true,
              )
            }
          />
        </View>
      )}
      <Text style={s.title}>Solicitações e decisões</Text>
      {!d.corrections.length && (
        <Text style={s.note}>Nenhuma correção solicitada.</Text>
      )}
      {d.corrections.map((c) => (
        <View key={c.id} style={s.item}>
          <Text style={s.title}>{correctionLabels[c.status]}</Text>
          <Text style={s.note}>
            {c.actor_name} · {time(c.created_at)}
            {"\n"}Motivo: {c.reason}
            {"\n"}Relato: {c.account}
            {"\n"}Confirmação original: {c.confirmation_id}
          </Text>
          {c.decided_at && (
            <Text style={s.note}>
              {c.decision_actor_name} · {time(c.decided_at)}
              {"\n"}
              {c.decision_reason}
              {"\n"}Contatos: {c.contacts}
              {"\n"}Verificação: {c.verification}
            </Text>
          )}
          {d.canReview && c.status === "PENDING" && (
            <Decision detail={d} correction={c} submit={submit} busy={busy} />
          )}
        </View>
      ))}
      {d.canReview && d.corrections.some((c) => c.status === "PENDING") && (
        <Text style={s.note}>
          Decida as solicitações pendentes antes de registrar resolução
          excepcional.
        </Text>
      )}
      {d.canResolveException && (
        <Exceptional
          key={d.trip.version}
          detail={d}
          busy={busy}
          submit={submit}
        />
      )}
      {!!d.resolutions.length && (
        <Text style={s.title}>Contabilizações excepcionais</Text>
      )}
      {d.resolutions.map((r) => (
        <View style={s.exception} key={r.id}>
          <Text style={s.title}>
            {r.current ? "Vigente" : "Anterior — novos fatos exigiram revisão"}
          </Text>
          <Text style={s.note}>
            {r.actor_name} · {time(r.created_at)}
            {"\n"}
            {r.outcome === "DELIVERED"
              ? "Entrega verificada excepcionalmente"
              : "Não transportada, verificada excepcionalmente"}
            {r.recipient_name ? " · " + r.recipient_name : ""}
            {"\n"}
            {r.reason}
            {"\n"}Contatos: {r.contacts}
            {"\n"}Verificação: {r.verification}
          </Text>
        </View>
      ))}
      <Text style={s.title}>Ocorrências</Text>
      {d.alerts.map((a) => (
        <View style={s.item} key={a.id}>
          <Text style={s.title}>
            {alertKinds[a.kind]} · {alertStatuses[a.status]}
          </Text>
          <Text style={s.note}>
            {time(a.origin_at)}
            {a.resolution_kind
              ? " · " +
                (resolutionLabels[a.resolution_kind] || a.resolution_kind)
              : ""}
            {a.resolution_note ? "\n" + a.resolution_note : ""}
          </Text>
        </View>
      ))}
      <Action
        label="Linha do tempo dos registros"
        secondary
        disabled={busy}
        onPress={() => setTimeline(!timeline)}
      />
      {timeline &&
        historyEvents(d).map((e) => (
          <View key={e.id} style={s.item}>
            <Text style={s.note}>{time(e.at)}</Text>
            <Text style={s.title}>{e.title}</Text>
            <Text style={s.note}>{e.body}</Text>
          </View>
        ))}
    </View>
  );
}
function Decision({
  detail: d,
  correction: c,
  submit,
  busy,
}: {
  detail: HistoryDetail;
  correction: Correction;
  submit: Submit;
  busy: boolean;
}) {
  const [reason, setReason] = useState(""),
    [contacts, setContacts] = useState(""),
    [verification, setVerification] = useState("");
  return (
    <View style={s.form}>
      <Text style={s.title}>Decisão da coordenação</Text>
      <Field
        label="Motivo da decisão"
        value={reason}
        set={setReason}
        disabled={busy}
      />
      <Field
        label="Contatos realizados para a decisão"
        value={contacts}
        set={setContacts}
        disabled={busy}
      />
      <Field
        label="Verificações realizadas para a decisão"
        value={verification}
        set={setVerification}
        disabled={busy}
      />
      <Text style={s.note}>
        Aprovar mantém a divergência até a contabilização excepcional. Rejeitar
        mantém vigente a confirmação original.
      </Text>
      {[
        ["APPROVED", "Aprovar correção"],
        ["REJECTED", "Rejeitar correção"],
      ].map(([decision, label]) => (
        <Action
          key={decision}
          label={label}
          disabled={
            busy ||
            [reason, contacts, verification].some((v) => v.trim().length < 20)
          }
          onPress={() =>
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
        />
      ))}
    </View>
  );
}
function Exceptional({
  detail: d,
  submit,
  busy,
}: {
  detail: HistoryDetail;
  submit: Submit;
  busy: boolean;
}) {
  const [reason, setReason] = useState(""),
    [contacts, setContacts] = useState(""),
    [verification, setVerification] = useState(""),
    [outcome, setOutcome] = useState("DELIVERED"),
    [recipient, setRecipient] = useState(""),
    [physical, setPhysical] = useState(false);
  return (
    <View style={[s.form, s.exception]}>
      <Text style={s.title}>Resolução excepcional pela coordenação</Text>
      <Text style={s.note}>
        Contabiliza a criança após verificação. Não cria confirmações nem
        equivale à dupla confirmação normal.
      </Text>
      {[
        ["DELIVERED", "Entrega verificada excepcionalmente"],
        ["NOT_TRANSPORTED", "Não transportada — nenhuma confirmação vigente"],
      ].map(([key, label]) => (
        <Action
          key={key}
          label={(outcome === key ? "● " : "○ ") + label}
          disabled={busy}
          secondary
          onPress={() => setOutcome(key)}
        />
      ))}
      {outcome === "DELIVERED" && (
        <>
          <Text style={s.title}>Recebedor verificado</Text>
          {d.recipients.map((r) => (
            <Action
              key={r.id}
              label={
                (recipient === r.id ? "● " : "○ ") +
                r.name +
                " · " +
                movementRoleLabels[r.role]
              }
              disabled={busy}
              secondary
              onPress={() => setRecipient(r.id)}
            />
          ))}
        </>
      )}
      <Field
        label="Motivo da resolução excepcional"
        value={reason}
        set={setReason}
        disabled={busy}
      />
      <Field
        label="Contatos realizados na resolução"
        value={contacts}
        set={setContacts}
        disabled={busy}
      />
      <Field
        label="Verificação física e destinação da criança"
        value={verification}
        set={setVerification}
        disabled={busy}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: physical, disabled: busy }}
        disabled={busy}
        onPress={() => setPhysical(!physical)}
      >
        <Text style={s.note}>
          {physical ? "☑" : "☐"} Registrei a verificação física e identifiquei a
          destinação segura da criança.
        </Text>
      </Pressable>
      <Action
        label="Registrar resolução excepcional"
        disabled={
          busy ||
          !physical ||
          [reason, contacts, verification].some((v) => v.trim().length < 20) ||
          (outcome === "DELIVERED" && !recipient)
        }
        onPress={() =>
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
          )
        }
      />
    </View>
  );
}
function Field({
  label,
  value,
  set,
  disabled,
  short = false,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  disabled: boolean;
  short?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.note}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={set}
        editable={!disabled}
        multiline={!short}
        maxLength={short ? 10 : 2000}
        autoCapitalize="sentences"
        style={[s.input, !short && { minHeight: 85, textAlignVertical: "top" }]}
        placeholder={
          short ? "AAAA-MM-DD" : "Descreva em pelo menos 20 caracteres."
        }
      />
    </View>
  );
}
function Action({
  label,
  onPress,
  disabled,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={[
        s.action,
        secondary && { backgroundColor: "#eaf0f5" },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.actionText, secondary && { color: "#43566d" }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { gap: 18 },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#dce5ee",
  },
  title: { color: "#43566d", fontSize: 14, fontWeight: "600", lineHeight: 22 },
  note: { color: "#62768a", fontSize: 11, lineHeight: 20 },
  item: {
    paddingVertical: 13,
    borderTopWidth: 1,
    borderColor: "#dce5ee",
    gap: 8,
  },
  form: { backgroundColor: "#f2f6f9", borderRadius: 12, padding: 14, gap: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#dce5ee",
    borderRadius: 9,
    padding: 12,
    fontSize: 12,
    color: "#43566d",
    backgroundColor: "white",
  },
  action: {
    padding: 13,
    borderRadius: 9,
    alignItems: "center",
    backgroundColor: "#43566d",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "white",
    lineHeight: 19,
  },
  error: {
    backgroundColor: "#fff0ed",
    color: "#983c2c",
    padding: 14,
    fontSize: 12,
    lineHeight: 21,
    borderRadius: 9,
  },
  success: {
    backgroundColor: "#e6f2e4",
    color: "#276147",
    padding: 14,
    fontSize: 12,
    lineHeight: 21,
    borderRadius: 9,
  },
  exception: {
    backgroundColor: "#fff7e9",
    borderColor: "#e2cfab",
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
    gap: 9,
  },
});
