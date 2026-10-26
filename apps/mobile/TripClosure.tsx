import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Trip, TripCloseInput, tripLabels } from "../shared/trips";

export default function TripClosure({
  trip,
  busy,
  onClose,
}: {
  trip: Trip;
  busy: boolean;
  onClose: (body: TripCloseInput) => Promise<void>;
}) {
  const [walked, setWalked] = useState(false),
    [seats, setSeats] = useState(false),
    [hiding, setHiding] = useState(false);
  const [empty, setEmpty] = useState<boolean | null>(null),
    [note, setNote] = useState(""),
    [key, setKey] = useState("");
  useEffect(() => {
    setWalked(false);
    setSeats(false);
    setHiding(false);
    setEmpty(null);
    setNote("");
    setKey(randomUUID());
  }, [trip.id, trip.version]);
  if (["PLANNED", "CANCELLED"].includes(trip.status)) return null;
  const c = trip.closure;
  const time = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: trip.timezone,
    }).format(new Date(value));
  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <Pressable
      key={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled: busy }}
      disabled={busy}
      onPress={() => set(!value)}
      style={s.check}
    >
      <Text style={s.text}>
        {value ? "☑" : "☐"} {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>CONFERÊNCIA FINAL</Text>
      <Text style={s.title}>Uma última checagem, criança por criança.</Text>
      <Text style={s.text}>
        {c.delivered} com embarque e entrega validados · {c.notTransported} não
        transportadas · {c.exceptional} contabilizadas excepcionalmente ·{" "}
        {c.pending.length} com pendências neste contexto.
      </Text>
      {trip.status === "COMPLETED" ? (
        <Text style={s.success}>
          Viagem concluída{" "}
          {c.exceptional > 0 ? "com contabilização excepcional " : ""}em{" "}
          {time(trip.completed_at!)}. Contabilização e conferência final
          registradas.
        </Text>
      ) : (
        <>
          {trip.status === "ROUTE_ENDED_OPEN" && (
            <Text style={s.warning}>
              O trajeto terminou em {time(trip.route_ended_at!)} com ocorrência
              aberta. Alertas e confirmações continuam ativos. Motorista e
              veículo permanecem reservados até a conclusão.
            </Text>
          )}
          {trip.status === "COMPLETED_REVIEW" && (
            <Text style={s.warning}>
              Conclusão sob revisão por correção ou relato de risco. O
              encerramento anterior permanece preservado. Após o tratamento,
              faça nova conferência para concluir. A revisão histórica não
              reserva novamente os recursos de viagens atuais.
            </Text>
          )}
          {c.pending.map((p) => (
            <View style={s.pending} key={p.id}>
              <Text style={s.title}>{p.studentName}</Text>
              <Text style={s.text}>{p.reasons.join(" ")}</Text>
            </View>
          ))}
          {!c.pending.length && (
            <Text style={s.text}>
              As crianças visíveis neste contexto estão contabilizadas e sem
              ocorrência aberta.
            </Text>
          )}
          {c.canInspect ? (
            <>
              <Text style={s.text}>
                Faça a verificação física agora. “Van vazia” não substitui
                confirmações nem resolve ocorrências individuais.
              </Text>
              {check("Percorri todo o interior da van.", walked, setWalked)}
              {check(
                "Verifiquei todos os bancos e os espaços entre eles.",
                seats,
                setSeats,
              )}
              {check(
                "Verifiquei os locais onde uma criança poderia estar oculta.",
                hiding,
                setHiding,
              )}
              <Text style={s.title}>Resultado da inspeção</Text>
              {[
                [true, "Van vazia, sem criança a bordo"],
                [
                  false,
                  "Há criança a bordo ou a segurança não está assegurada",
                ],
              ].map(([value, label]) => (
                <Pressable
                  key={label as string}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: empty === value,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => setEmpty(value as boolean)}
                  style={[s.check, empty === value && s.selected]}
                >
                  <Text style={s.text}>{label as string}</Text>
                </Pressable>
              ))}
              <Text style={s.text}>
                Observação da conferência{" "}
                {empty === false
                  ? "(obrigatória, pelo menos 10 caracteres)"
                  : "(opcional)"}
              </Text>
              <TextInput
                accessibilityLabel="Observação da conferência"
                editable={!busy}
                multiline
                maxLength={1000}
                value={note}
                onChangeText={setNote}
                style={s.input}
                placeholder="Descreva o que foi verificado ou encontrado."
              />
              <Text style={s.text}>
                {c.ready && empty === true
                  ? "Com a conferência registrada, a viagem poderá ser concluída."
                  : "Pendências ou van sem segurança assegurada resultarão em trajeto encerrado com ocorrência aberta."}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={
                  busy ||
                  !key ||
                  !walked ||
                  !seats ||
                  !hiding ||
                  empty === null ||
                  (empty === false && note.trim().length < 10)
                }
                style={[
                  s.button,
                  (busy ||
                    !walked ||
                    !seats ||
                    !hiding ||
                    empty === null ||
                    (empty === false && note.trim().length < 10)) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={() => {
                  if (empty !== null)
                    void onClose({
                      id: key,
                      expectedVersion: trip.version,
                      walkedInterior: true,
                      checkedSeats: true,
                      checkedHidingPlaces: true,
                      vanEmpty: empty,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    });
                }}
              >
                <Text style={s.buttonText}>
                  {busy
                    ? "Registrando…"
                    : "Registrar conferência e encerrar trajeto"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={s.text}>
              A conferência é registrada pelo motorista designado. Totais e
              pendências respeitam seu contexto.
            </Text>
          )}
        </>
      )}
      {!!c.inspections.length && (
        <Text style={s.title}>Conferências registradas</Text>
      )}
      {c.inspections.map((i) => (
        <View key={i.id} style={s.pending}>
          <Text style={s.title}>{tripLabels[i.result]}</Text>
          <Text style={s.text}>
            {i.actor_name} · {time(i.inspected_at)}
            {"\n"}
            {i.van_empty
              ? "Van declarada vazia após inspeção física."
              : "Van com criança a bordo ou segurança não assegurada."}
            {i.note ? "\n" + i.note : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#f2f6f8",
    borderColor: "#dbe4e9",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  eyebrow: {
    color: "#23705b",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  title: { color: "#43566d", fontSize: 13, fontWeight: "600" },
  text: { color: "#526b83", fontSize: 11, lineHeight: 20 },
  check: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#d8e3ec",
    borderRadius: 9,
    backgroundColor: "white",
  },
  selected: { borderColor: "#23705b", backgroundColor: "#e6f2e4" },
  pending: {
    borderLeftWidth: 3,
    borderColor: "#c08843",
    paddingLeft: 12,
    gap: 5,
  },
  warning: {
    color: "#913c2e",
    backgroundColor: "#fff0eb",
    padding: 12,
    fontSize: 11,
    lineHeight: 20,
    borderRadius: 8,
  },
  success: {
    color: "#276147",
    backgroundColor: "#e6f2e4",
    padding: 12,
    fontSize: 11,
    lineHeight: 20,
    borderRadius: 8,
  },
  input: {
    minHeight: 85,
    padding: 12,
    backgroundColor: "white",
    borderColor: "#d8e3ec",
    borderWidth: 1,
    borderRadius: 9,
    color: "#43566d",
    fontSize: 12,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: "#43566d",
    borderRadius: 9,
    padding: 14,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 11, fontWeight: "600" },
});
