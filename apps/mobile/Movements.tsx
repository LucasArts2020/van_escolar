import { Pressable, StyleSheet, Text, View } from "react-native";
import { PushClient } from "./push";
import AlertReport from "./AlertReport";
import { alertLevels, alertKinds } from "../shared/alerts";
import {
  MovementKind,
  Passenger,
  Trip,
  movementRoleLabels,
  passengerMovementLabels,
  movementStatus,
  movementAction,
} from "../shared/trips";
export default function Movements({
  trip,
  passenger: p,
  role,
  busy,
  onConfirm,
  hideConfirm = false,
  focusKind,
  client,
}: {
  trip: Trip;
  passenger: Passenger;
  role: string;
  busy: boolean;
  onConfirm: (kind: MovementKind) => void;
  hideConfirm?: boolean;
  focusKind?: MovementKind;
  client?: PushClient;
}) {
  const time = (value: string) =>
    new Date(value).toLocaleString("pt-BR", { timeZone: trip.timezone });
  const hasOpenOccurrence =
    p.issues.some((issue) => issue.status !== "RESOLVED") ||
    p.alerts?.some((alert) => alert.status !== "RESOLVED");
  const hasPendingCorrection = p.movements.some((movement) =>
    movement.confirmations.some(
      (record) => record.correctionStatus === "PENDING",
    ),
  );
  const underReview = p.deliveryUnderReview || hasPendingCorrection;
  return (
    <View style={s.root}>
      <Text style={s.status}>
        {p.movementState === "DELIVERED" && (underReview || hasOpenOccurrence)
          ? "Duas confirmações de entrega registradas"
          : passengerMovementLabels[p.movementState]}
        {p.movementState === "BOARDING_VALIDATED" &&
          underReview &&
          " · sob verificação"}
      </Text>
      {p.possiblyOnboard && (
        <Text style={s.possible}>Possivelmente a bordo</Text>
      )}
      {p.issues.map((issue) => (
        <View style={s.issue} key={issue.id}>
          <Text style={s.issueTitle}>
            Ocorrência de sequência incompleta ·{" "}
            {issue.status === "RESOLVED" ? "Resolvida" : "Aberta"}
          </Text>
          <Text style={s.note}>
            Desembarque registrado antes de um embarque validado. As etapas
            permanecem registradas para revisão.{"\n"}
            {time(issue.detectedAt)}
          </Text>
        </View>
      ))}
      {p.deliveryUnderReview && (
        <Text style={{ color: "#a25b4d", fontSize: 13, lineHeight: 21 }}>
          Recebimento sob verificação. Há ocorrência ou correção em aberto; as
          confirmações originais foram preservadas.
        </Text>
      )}
      {!p.deliveryUnderReview &&
        (hasOpenOccurrence || hasPendingCorrection) && (
          <Text style={s.reviewNote}>
            Há ocorrência ou correção em aberto. As confirmações registradas não
            encerram o atendimento automaticamente.
          </Text>
        )}
      {p.exceptionalResolution && (
        <Text style={s.note}>
          Contabilizada excepcionalmente por {p.exceptionalResolution.actorName}
          . Não equivale à dupla confirmação normal. Consulte o Histórico para
          motivo e verificações.
        </Text>
      )}
      {p.alerts?.map((a) => (
        <Text
          key={a.id}
          style={{ fontSize: 12, color: "#946b3c", lineHeight: 20 }}
        >
          {alertLevels[a.level]} · {alertKinds[a.kind]} · Consulte a aba
          Alertas.
        </Text>
      ))}
      {p.movements
        .filter((m) => !focusKind || m.kind === focusKind)
        .map((m) => {
          const correctionPending = m.confirmations.some(
            (record) => record.correctionStatus === "PENDING",
          );
          const movementUnderReview =
            correctionPending ||
            (m.kind === "ALIGHTING" && (underReview || hasOpenOccurrence));
          return (
            <View
              key={m.kind}
              style={[
                s.card,
                m.state === "INFORMED" && s.informed,
                m.state === "VALIDATED" && !movementUnderReview && s.validated,
                movementUnderReview && s.review,
              ]}
            >
              <Text style={s.meta}>
                {m.kind === "BOARDING" ? "EMBARQUE" : "DESEMBARQUE"} ·{" "}
                {m.location.toUpperCase()}
              </Text>
              <Text style={s.title}>
                {m.state === "VALIDATED" && movementUnderReview
                  ? `Duas confirmações de ${m.kind === "BOARDING" ? "embarque" : "desembarque"} registradas`
                  : movementStatus(m)}
              </Text>
              {movementUnderReview && (
                <Text style={s.reviewNote}>Sob verificação</Text>
              )}
              <Text style={s.note}>
                {p.student_name} ·{" "}
                {trip.service_date.split("-").reverse().join("/")} ·{" "}
                {trip.direction === "OUTBOUND" ? "Ida" : "Volta"}
              </Text>
              {["DRIVER", "COUNTERPART"].map((side) => {
                const record = m.confirmations.find((c) => c.side === side),
                  required = side === "DRIVER" ? "DRIVER" : m.counterpartRole;
                const invalidated = record?.correctionStatus === "APPROVED";
                const pending = record?.correctionStatus === "PENDING";
                return (
                  <View style={s.side} key={side}>
                    <Text
                      style={[
                        s.role,
                        invalidated && s.invalidated,
                        pending && s.reviewNote,
                        record && !invalidated && !pending && s.confirmed,
                      ]}
                    >
                      {invalidated ? "⊘" : pending ? "!" : record ? "✓" : "○"}{" "}
                      {movementRoleLabels[required]}
                    </Text>
                    {record ? (
                      <>
                        <Text style={s.name}>{record.actorName}</Text>
                        {(invalidated || pending) && (
                          <Text
                            style={[
                              s.note,
                              invalidated ? s.invalidated : s.reviewNote,
                            ]}
                          >
                            {invalidated
                              ? "Registro invalidado pela correção; original preservado"
                              : "Confirmação sob verificação; correção pendente"}
                          </Text>
                        )}
                        <Text style={s.note}>
                          {record.organizationName} · {time(record.receivedAt)}
                        </Text>
                      </>
                    ) : (
                      <Text style={s.note}>Falta confirmar</Text>
                    )}
                  </View>
                );
              })}
              {m.missingRoles.length > 0 && (
                <Text style={s.missing}>
                  Falta:{" "}
                  {m.missingRoles.map((r) => movementRoleLabels[r]).join(" e ")}
                </Text>
              )}
              {!hideConfirm && m.canConfirm ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${movementAction(role, m.kind)}: ${p.student_name}, ${trip.service_date}, ${trip.direction === "OUTBOUND" ? "ida" : "volta"}`}
                  disabled={busy}
                  onPress={() => onConfirm(m.kind)}
                  style={[s.action, busy && { opacity: 0.45 }]}
                >
                  <Text style={s.actionText}>
                    {movementAction(role, m.kind)}
                  </Text>
                </Pressable>
              ) : (
                m.state !== "VALIDATED" && (
                  <Text style={s.blocked}>{m.blockedReason}</Text>
                )
              )}
            </View>
          );
        })}
      {p.canReportRisk && client && (
        <AlertReport trip={trip} passenger={p} client={client} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 13, marginTop: 20 },
  status: { fontSize: 12, fontWeight: "600", color: "#526d86" },
  possible: {
    fontSize: 10,
    color: "#8c713b",
    padding: 8,
    backgroundColor: "#f5ecd4",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  card: {
    borderWidth: 1,
    borderColor: "#dce6ef",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "white",
  },
  informed: { borderColor: "#dacba6" },
  validated: { borderColor: "#c9dece", backgroundColor: "#f7fbf8" },
  review: { borderColor: "#dacba6", backgroundColor: "#fffbf2" },
  reviewNote: { color: "#946b3c", fontSize: 12, lineHeight: 20 },
  invalidated: { color: "#6c7280" },
  confirmed: { color: "#5f876a" },
  meta: { fontSize: 9, color: "#8496a7", letterSpacing: 0.6 },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#536f88",
    marginVertical: 8,
  },
  note: { fontSize: 10, lineHeight: 19, color: "#8598a9" },
  side: {
    borderTopWidth: 1,
    borderColor: "#edf1f5",
    paddingTop: 10,
    marginTop: 13,
  },
  role: { fontSize: 10, fontWeight: "600", color: "#718a9e", marginBottom: 4 },
  name: { fontSize: 11, fontWeight: "500", color: "#657c90" },
  missing: { fontSize: 10, color: "#a08754", marginTop: 14 },
  blocked: { fontSize: 10, lineHeight: 19, color: "#8c9baa", marginTop: 12 },
  action: {
    marginTop: 14,
    backgroundColor: "#43566d",
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "white",
    lineHeight: 19,
    textAlign: "center",
  },
  issue: {
    borderWidth: 1,
    borderColor: "#edddbd",
    backgroundColor: "#fff4e3",
    padding: 13,
    borderRadius: 10,
  },
  issueTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9a7841",
    lineHeight: 20,
  },
});
