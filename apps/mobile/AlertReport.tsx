import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { PushClient } from "./push";
import { Passenger, Trip } from "../shared/trips";
export default function AlertReport({
  client,
  trip,
  passenger,
}: {
  client: PushClient;
  trip: Trip;
  passenger: Passenger;
}) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("NOT_LOCATED"),
    [movement, setMovement] = useState("ALIGHTING"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState("");
  const choose = (label: string, fn: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={fn}
      style={s.button}
      disabled={busy}
    >
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.root}>
      {choose(
        open
          ? "Fechar relato de risco"
          : "Relatar criança não localizada ou recebimento contestado",
        () => setOpen((v) => !v),
      )}
      {open && (
        <>
          <Text style={s.note}>
            O relato abre ocorrência crítica imediatamente. Informe somente um
            fato observado. Os registros anteriores são preservados.
          </Text>
          {choose(
            kind === "NOT_LOCATED"
              ? "✓ Criança não localizada"
              : "Criança não localizada",
            () => {
              setKind("NOT_LOCATED");
              setId("");
            },
          )}
          {choose(
            kind === "RECEIPT_DISPUTED"
              ? "✓ Recebimento contestado"
              : "Recebimento contestado",
            () => {
              setKind("RECEIPT_DISPUTED");
              setId("");
            },
          )}
          <View style={s.row}>
            {choose(movement === "BOARDING" ? "✓ Embarque" : "Embarque", () => {
              setMovement("BOARDING");
              setId("");
            })}
            {choose(
              movement === "ALIGHTING" ? "✓ Desembarque" : "Desembarque",
              () => {
                setMovement("ALIGHTING");
                setId("");
              },
            )}
          </View>
          <TextInput
            accessibilityLabel="Descreva o fato e as verificações"
            editable={!busy}
            style={s.input}
            multiline
            value={note}
            maxLength={2000}
            onChangeText={(v) => {
              setNote(v);
              setId("");
            }}
            placeholder="Descreva o fato e as verificações (mínimo 20 caracteres)"
          />
          {error !== "" && <Text style={s.error}>{error}</Text>}
          {notice !== "" && <Text style={s.note}>{notice}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={busy || note.trim().length < 20}
            style={[s.button, note.trim().length < 20 && { opacity: 0.5 }]}
            onPress={async () => {
              setBusy(true);
              setError("");
              const requestId = id || Crypto.randomUUID();
              setId(requestId);
              try {
                await client("alerts/report", {
                  id: requestId,
                  tripId: trip.id,
                  passengerId: passenger.id,
                  movementKind: movement,
                  kind,
                  note,
                });
                setNotice(
                  "Ocorrência crítica registrada. Consulte a aba Alertas.",
                );
                setId("");
                setNote("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={s.link}>
              Registrar relato crítico de {passenger.student_name}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: {
    gap: 12,
    marginTop: 18,
    padding: 16,
    backgroundColor: "#f8f2ee",
    borderRadius: 16,
  },
  button: { backgroundColor: "#f1e5dc", padding: 13, borderRadius: 10 },
  link: { fontSize: 12, color: "#8c6251", fontWeight: "600" },
  note: { fontSize: 12, color: "#8d776b", lineHeight: 21 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  input: {
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 13,
    padding: 13,
    borderWidth: 1,
    borderColor: "#e1cec0",
    borderRadius: 11,
    backgroundColor: "#fffaf7",
  },
  error: { fontSize: 12, color: "#a34f47", lineHeight: 21 },
});
