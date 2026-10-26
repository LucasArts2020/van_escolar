import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export default function AgendaCalendar({
  value,
  today,
  onChange,
  onJump,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
  onJump: () => void;
}) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [month, setMonth] = useState(valid.slice(0, 7));
  useEffect(() => {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number(value.slice(5, 7)) >= 1 &&
      Number(value.slice(5, 7)) <= 12
    )
      setMonth(value.slice(0, 7));
  }, [value]);
  const [year, number] = month.split("-").map(Number),
    first = new Date(Date.UTC(year, number - 1, 1, 12)),
    offset = (first.getUTCDay() + 6) % 7,
    lastDay = new Date(Date.UTC(year, number, 0, 12)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + lastDay) / 7) * 7 },
    (_, index) => new Date(Date.UTC(year, number - 1, index - offset + 1, 12)),
  );
  function move(delta: number) {
    setMonth(
      iso(new Date(Date.UTC(year, number - 1 + delta, 1, 12))).slice(0, 7),
    );
  }
  return (
    <View style={s.calendar}>
      <View style={s.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escolher uma data"
          style={s.month}
          onPress={onJump}
        >
          <Text style={s.monthText}>
            ▦{" "}
            {first.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </Text>
        </Pressable>
        <View style={s.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange(today);
              setMonth(today.slice(0, 7));
            }}
            style={s.todayButton}
          >
            <Text style={s.todayText}>Hoje</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            style={s.arrow}
            onPress={() => move(-1)}
          >
            <Text style={s.arrowText}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            style={s.arrow}
            onPress={() => move(1)}
          >
            <Text style={s.arrowText}>›</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.weekdays}>
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
          <Text style={s.weekday} key={d}>
            {d}
          </Text>
        ))}
      </View>
      <View style={s.days}>
        {cells.map((d) => {
          const date = iso(d),
            selected = date === value,
            adjacent = date.slice(0, 7) !== month;
          return (
            <View key={date} style={s.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={d.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(date);
                  setMonth(date.slice(0, 7));
                }}
                style={[
                  s.day,
                  adjacent && s.adjacent,
                  date === today && s.today,
                  selected && s.selected,
                ]}
              >
                <Text
                  style={[
                    s.dayText,
                    adjacent && s.adjacentText,
                    selected && s.selectedText,
                  ]}
                >
                  {d.getUTCDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={s.caption}>
        <View style={s.captionLine} />
        <Text style={s.captionText}>
          Escolha um dia para ver o planejamento
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  calendar: {
    backgroundColor: "#fff",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "#e7ebef",
    padding: 17,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 25,
  },
  month: {
    backgroundColor: "#e7edf3",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexShrink: 1,
  },
  monthText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4f6275",
    textTransform: "capitalize",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 2 },
  todayButton: { paddingHorizontal: 7, paddingVertical: 10 },
  todayText: { fontSize: 10, color: "#758495" },
  arrow: {
    width: 25,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 24, color: "#64778b", lineHeight: 28 },
  weekdays: { flexDirection: "row", marginBottom: 11 },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    fontSize: 8,
    color: "#929eab",
    fontWeight: "600",
  },
  days: { flexDirection: "row", flexWrap: "wrap", rowGap: 9 },
  cell: { width: "14.2857%", alignItems: "center" },
  day: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e8eef4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayText: { fontSize: 11, color: "#62758a", fontWeight: "500" },
  selected: { backgroundColor: "#43566d", borderColor: "#43566d" },
  selectedText: { color: "#fff", fontWeight: "700" },
  today: { borderColor: "#8497aa" },
  adjacent: { backgroundColor: "transparent" },
  adjacentText: { color: "#c3ccd5" },
  caption: { alignItems: "center", marginTop: 19 },
  captionLine: {
    height: 3,
    width: 30,
    borderRadius: 2,
    backgroundColor: "#dce4ec",
    marginBottom: 12,
  },
  captionText: { fontSize: 9, color: "#a2adba" },
});
