import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";
import {
  dayChoices,
  agendaChangeLabels,
  type AgendaPlan,
} from "../shared/day-choice";
import { useDayChoice } from "../shared/use-day-choice";
import { planningLabel } from "../shared/planning-presentation";
import { theme } from "./theme";
export default function GuardianDayCard({
  plans,
  submit,
  refresh,
  withdraw,
}: {
  plans: AgendaPlan[];
  submit: (body: unknown) => Promise<{ awaitingAcceptance?: boolean }>;
  refresh: () => Promise<void>;
  withdraw: (p: AgendaPlan) => void;
}) {
  const state = useDayChoice(plans, submit, refresh),
    p = plans[0];
  const [details, setDetails] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.title}>{p.student_name}</Text>
      <Text style={s.note}>
        {p.school_name} · {p.transport_name}
      </Text>
      <Text style={s.note}>Identificação {p.student_id.slice(-8)}</Text>
      {plans.map((plan) => (
        <View key={plan.id}>
          <Text style={s.note}>
            {plan.direction === "OUTBOUND" ? "Ida" : "Volta"}:{" "}
            {planningLabel(plan)}
          </Text>
          {plan.request_id && (
            <Text style={s.warning}>
              Pedido em análise:{" "}
              {plan.requested_usage ? "utilizará" : "não utilizará"}
            </Text>
          )}
        </View>
      ))}
      <Text style={s.label}>Como utilizará nesta data?</Text>
      <View style={s.options}>
        {dayChoices.map((c) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected: state.selection === c.id,
              disabled: state.busy || state.disabledChoice(c),
            }}
            key={c.id}
            disabled={state.busy || state.disabledChoice(c)}
            onPress={() => state.setSelection(c.id)}
            style={[s.option, state.selection === c.id && s.selected]}
          >
            <Text style={s.label}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.note}>
        A escolha só é registrada ao confirmar. Ida e volta continuam
        independentes.
      </Text>
      {state.late && (
        <>
          <Text style={s.label}>Motivo da alteração</Text>
          <TextInput
            accessibilityLabel="Motivo da alteração"
            style={s.input}
            multiline
            maxLength={1000}
            value={state.reason}
            editable={!state.busy}
            onChangeText={state.setReason}
            placeholder="Explique a necessidade (mínimo 10 caracteres)"
          />
        </>
      )}
      {!!state.blocked && <Text style={s.warning}>{state.blocked}</Text>}
      {!!state.error && (
        <Text accessibilityRole="alert" style={s.warning}>
          {state.error}
        </Text>
      )}
      {!!state.notice && (
        <Text accessibilityLiveRegion="polite" style={s.note}>
          {state.notice}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={state.busy || !state.canSave}
        accessibilityState={{ disabled: state.busy || !state.canSave }}
        onPress={() => void state.save()}
        style={[s.primary, (state.busy || !state.canSave) && s.disabled]}
      >
        <Text style={s.primaryText}>
          {state.busy
            ? "Salvando…"
            : state.needsVerification
              ? "Verificar envio"
              : state.alreadyRecorded
                ? "Escolha confirmada"
                : state.late
                  ? "Enviar solicitação ao transporte"
                  : state.selection === "none"
                    ? "Confirmar que não utilizará"
                    : "Confirmar uso do transporte"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: details }}
        style={s.option}
        onPress={() => setDetails(!details)}
      >
        <Text style={s.label}>
          Detalhes e solicitações por trecho {details ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {details &&
        plans.map((plan) => (
          <View key={plan.id}>
            <Text style={s.note}>
              {plan.direction === "OUTBOUND" ? "Ida" : "Volta"} ·{" "}
              {planningLabel(plan)}
            </Text>
            {plan.request_id && (
              <Text style={s.note}>{plan.request_reason}</Text>
            )}
            {plan.request_id && plan.can_withdraw && (
              <Pressable
                accessibilityRole="button"
                disabled={state.busy}
                style={s.option}
                onPress={() => withdraw(plan)}
              >
                <Text>
                  Retirar pedido de{" "}
                  {plan.direction === "OUTBOUND" ? "ida" : "volta"}
                </Text>
              </Pressable>
            )}
            {plan.last_change && (
              <Text style={s.note}>
                Última solicitação:{" "}
                {agendaChangeLabels[plan.last_change.status] ||
                  "Consulte o transporte"}{" "}
                {plan.last_change.decisionNote}
              </Text>
            )}
          </View>
        ))}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 18,
    gap: 13,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 18,
    backgroundColor: theme.color.surface,
  },
  title: { fontSize: 20, fontWeight: "700", color: theme.color.ink },
  note: { fontSize: 13, lineHeight: 20, color: theme.color.muted },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: theme.color.ink,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 48,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.color.line,
    justifyContent: "center",
  },
  selected: {
    backgroundColor: theme.color.soft,
    borderColor: theme.color.primary,
    borderWidth: 2,
  },
  primary: {
    minHeight: 52,
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },
  disabled: { backgroundColor: theme.color.muted },
  warning: { color: theme.color.warning, lineHeight: 20, fontSize: 13 },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
  },
});
