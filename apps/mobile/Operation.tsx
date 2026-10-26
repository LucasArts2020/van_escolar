import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  contingencySteps,
  operationalDecisions,
  operationRelease,
  roleChecks,
} from "../shared/operation-guide";
export default function Operation({
  role,
  onNavigate,
}: {
  role: keyof typeof roleChecks;
  onNavigate: (view: string) => void;
}) {
  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.title}>{operationRelease.title}</Text>
        <Text style={s.status}>{operationRelease.status}</Text>
        <Text style={s.body}>{operationRelease.explanation}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.title}>Antes e durante a viagem</Text>
        {roleChecks[role].map((step, i) => (
          <Text key={step} style={s.body}>
            {i + 1}. {step}
          </Text>
        ))}
        <View style={s.actions}>
          {[
            ["planning", "Planejamento"],
            ["trips", "Viagens"],
            ["alerts", "Alertas"],
            ["history", "Histórico"],
          ].map(([view, label]) => (
            <Pressable
              key={view}
              accessibilityRole="button"
              onPress={() => onNavigate(view)}
              style={s.button}
            >
              <Text style={s.link}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.title}>Sem internet ou sem notificação</Text>
        {contingencySteps.map((step, i) => (
          <Text key={step} style={s.body}>
            {i + 1}. {step}
          </Text>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.title}>Decisões antes do uso real</Text>
        <Text style={s.body}>
          Propostas técnicas não representam aprovação operacional.
        </Text>
        {operationalDecisions.map((d) => (
          <View style={s.decision} key={d.id}>
            <Text style={s.state}>
              {d.id} · {d.state}
            </Text>
            <Text style={s.subtitle}>{d.title}</Text>
            <Text style={s.body}>{d.detail}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 16 },
  card: { backgroundColor: "#fffef9", borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 19, fontWeight: "700", color: "#293c33" },
  subtitle: { fontWeight: "600", color: "#293c33" },
  body: { color: "#59645c", fontSize: 14, lineHeight: 23 },
  status: {
    backgroundColor: "#fcf0d6",
    color: "#755522",
    padding: 12,
    borderRadius: 10,
    fontWeight: "600",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    borderWidth: 1,
    borderColor: "#dbe3d7",
    padding: 12,
    borderRadius: 12,
  },
  link: { color: "#386448", fontWeight: "600" },
  decision: {
    borderTopWidth: 1,
    borderColor: "#e2e6dc",
    paddingTop: 16,
    gap: 8,
  },
  state: { color: "#756344", fontSize: 12 },
});
