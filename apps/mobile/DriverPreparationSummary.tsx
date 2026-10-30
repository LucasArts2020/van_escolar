import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  type DriverPreparation,
  preparationItemLabel,
} from "../shared/driver-day";
import { theme } from "./theme";
export default function DriverPreparationSummary({
  value,
  direction,
  onDirection,
  onPage,
}: {
  value?: DriverPreparation;
  direction: "OUTBOUND" | "RETURN";
  onDirection: (d: "OUTBOUND" | "RETURN") => void;
  onPage: (page: number) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const button = (label: string, onPress: () => void, selected = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.button, selected && s.selected]}
    >
      <Text style={s.note}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.card}>
      <Text style={s.title}>Seu próximo trajeto</Text>
      <Text style={s.note}>
        Escolha o trecho e confira o resumo.
      </Text>
      <View style={s.row}>
        {button("Ida", () => onDirection("OUTBOUND"), direction === "OUTBOUND")}
        {button("Volta", () => onDirection("RETURN"), direction === "RETURN")}
      </View>
      {value ? (
        <>
          <View style={s.row}>
            <Text style={s.note}>{value.going} vão</Text>
            <Text style={s.note}>{value.notGoing} não vão</Text>
            <Text style={s.note}>{value.pending} a conferir</Text>
          </View>
          {!!value.awaitingChanges && (
            <Text style={s.warning}>
              {value.awaitingChanges} solicitações em análise; situação vigente
              mantida.
            </Text>
          )}
          {button(showDetails ? "Recolher detalhes" : "Ver crianças e detalhes", () => setShowDetails(!showDetails))}
          {showDetails && <>
          {["GOING", "NOT_GOING", "PENDING"].map((bucket) => (
            <View key={bucket}>
              <Text style={s.label}>
                {bucket === "GOING"
                  ? "Quem vai"
                  : bucket === "NOT_GOING"
                    ? "Quem não vai"
                    : "Ainda não confirmado ou sem previsão"}
              </Text>
              {bucket === "PENDING" &&
                button(
                  showPending ? "Recolher pendentes" : "Ver pendentes",
                  () => setShowPending(!showPending),
                )}
              {(bucket !== "PENDING" || showPending) &&
                value.items
                  .filter((p) =>
                    bucket === "PENDING"
                      ? !["GOING", "NOT_GOING"].includes(p.bucket)
                      : p.bucket === bucket,
                  )
                  .map((p) => (
                    <View key={p.linkId} style={s.child}>
                      <Text style={s.label}>{p.studentName}</Text>
                      <Text style={s.note}>
                        {p.schoolName} · Identificação {p.studentId.slice(-8)}
                      </Text>
                      <Text style={s.note}>{preparationItemLabel(p)}</Text>
                      {p.requestId && (
                        <Text style={s.warning}>
                          Pedido em análise:{" "}
                          {p.requestedUsage ? "utilizará" : "não utilizará"}
                        </Text>
                      )}
                    </View>
                  ))}
            </View>
          ))}
          <Text style={s.note}>
            Exibindo {value.items.length} de {value.total} · página{" "}
            {value.page + 1}
          </Text>
          {value.page > 0 &&
            button("Página anterior do resumo", () => onPage(value.page - 1))}
          {value.hasMore &&
            button("Próxima página do resumo", () => onPage(value.page + 1))}
          </>}
        </>
      ) : (
        <Text style={s.note}>Carregando resumo…</Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 15,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  title: { fontSize: 19, fontWeight: "700", color: theme.color.ink },
  label: { fontSize: 14, fontWeight: "600", color: theme.color.ink },
  note: { fontSize: 13, lineHeight: 20, color: theme.color.muted },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  button: {
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 10,
  },
  selected: {
    backgroundColor: theme.color.soft,
    borderColor: theme.color.primary,
  },
  child: {
    paddingVertical: 12,
    gap: 5,
    borderBottomWidth: 1,
    borderColor: theme.color.line,
  },
  warning: { fontSize: 13, lineHeight: 20, color: theme.color.warning },
});
