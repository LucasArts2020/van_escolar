import { useEffect, useRef, useState } from "react";
import GuardianDayCard from "./GuardianDayCard";
import { groupAgenda } from "../shared/day-choice";
import { planningLabel } from "../shared/planning-presentation";
import AgendaCalendar from "./AgendaCalendar";
import { createPlanningMaterializer } from "../shared/materialize-planning";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
type Client = <T>(
  path: string,
  body?: unknown,
  auth?: string | null,
  method?: string,
) => Promise<T>;
type Context = { id: string; role: "SCHOOL" | "DRIVER" | "GUARDIAN" };
type Link = {
  student_id: string;
  id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  today: string;
  tomorrow: string;
};
type Options = {
  defaultToday: string;
  policy: {
    cutoff_time: string;
    timezone: string;
    revision: number;
    demo: boolean;
  } | null;
  links: Link[];
};
type Day = { weekday: number; outbound: boolean; return: boolean };
type Routine = { revision: number; days: Day[] };
type Plan = {
  operating_link_id: string;
  student_id: string;
  id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  direction: string;
  status: string;
  scheduled: boolean;
  routine_revision: number | null;
  version: number;
  timezone: string;
  deadline_at: string;
  service_date: string;
  today: string;
  late: boolean;
  locked_at: string | null;
  request_id: string | null;
  requested_usage: boolean;
  request_reason: string;
  can_withdraw: boolean;
  last_change: { status: string; decisionNote: string | null } | null;
};
type Board = {
  plans: Plan[];
  counts: {
    scheduled: number;
    pending: number;
    confirmed: number;
    notUsing: number;
    missingConfiguration: number;
    awaitingChanges: number;
  };
};
const labels: Record<string, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Uso confirmado",
  NOT_USING: "Não utilizará",
  NOT_EXPECTED: "Sem previsão na rotina",
};
const decisions: Record<string, string> = {
  ACCEPTED: "Alteração aceita pelo transporte",
  REFUSED: "Alteração recusada pelo transporte",
  WITHDRAWN: "Pedido retirado pelo responsável",
};
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
function tomorrow(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export default function Planning({
  context,
  client,
}: {
  context: Context;
  client: Client;
}) {
  const materializePlanning = useRef(createPlanningMaterializer()).current;
  const guardian = context.role === "GUARDIAN",
    driver = context.role === "DRIVER";
  const [options, setOptions] = useState<Options | null>(null),
    [tab, setTab] = useState("daily"),
    [date, setDate] = useState(""),
    [linkId, setLinkId] = useState(""),
    [routine, setRoutine] = useState<Routine | null>(null),
    [board, setBoard] = useState<Board | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [cutoff, setCutoff] = useState("18:00"),
    [timezone, setTimezone] = useState("America/Sao_Paulo");
  const api = <T,>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ) => client<T>("planning/" + path, body, undefined, method);
  const [expanded, setExpanded] = useState<string | null>(null),
    [showTools, setShowTools] = useState(false),
    [showSummary, setShowSummary] = useState(false);
  async function loadOptions() {
    const data = await api<Options>("options");
    setOptions(data);
    setDate(
      (old) => old || data.links[0]?.tomorrow || tomorrow(data.defaultToday),
    );
    setLinkId((old) =>
      data.links.some((l) => l.id === old) ? old : data.links[0]?.id || "",
    );
    setCutoff(data.policy?.cutoff_time.slice(0, 5) || "18:00");
    setTimezone(data.policy?.timezone || "America/Sao_Paulo");
  }
  const dateRef = useRef(date);
  dateRef.current = date;
  async function loadBoard() {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (options && (guardian || driver))
        await materializePlanning(date, options, (body) =>
          api("generate", body),
        );
      const result = await api<Board>("day?date=" + date);
      if (dateRef.current === date) setBoard(result);
    } else throw new Error("Informe a data no formato AAAA-MM-DD.");
  }
  async function loadRoutine() {
    if (linkId) setRoutine(await api<Routine>("routines/" + linkId));
  }
  useEffect(() => {
    loadOptions()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let alive = true;
    setBoard(null);
    setExpanded(null);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && options)
      (async () => {
        if (guardian || driver)
          await materializePlanning(date, options, (body) =>
            api("generate", body),
          );
        if (!alive) return null;
        return api<Board>("day?date=" + date);
      })()
        .then((d) => {
          if (alive && d) setBoard(d);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [date, options]);
  useEffect(() => {
    let alive = true;
    setRoutine(null);
    if (linkId)
      api<Routine>("routines/" + linkId)
        .then((d) => {
          if (alive) setRoutine(d);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [linkId]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function respond(p: Plan, use: boolean) {
    void run(async () => {
      const r = await api<{
        awaitingAcceptance?: boolean;
        unchanged?: boolean;
      }>("plans/" + p.id + "/respond", {
        use,
        expectedVersion: p.version,
        ...(notes[p.id]?.trim() ? { reason: notes[p.id] } : {}),
      });
      await loadBoard();
      setNotice(
        r.awaitingAcceptance
          ? "Pedido aguardando aceite do transporte. A situação anterior foi mantida."
          : r.unchanged
            ? "Esta escolha já estava registrada."
            : "Escolha registrada somente para este trecho.",
      );
    });
  }
  function decide(p: Plan, action: string) {
    void run(async () => {
      await api(
        "changes/" + p.request_id,
        { action, ...(notes[p.id]?.trim() ? { note: notes[p.id] } : {}) },
        "PATCH",
      );
      await loadBoard();
      setNotice(
        action === "ACCEPT"
          ? "Alteração aceita e disponível aos envolvidos."
          : action === "REFUSE"
            ? "Pedido recusado. Situação anterior mantida."
            : "Pedido retirado. Situação anterior mantida.",
      );
    });
  }
  const tabs = [
    ["daily", "Por data"],
    ["weekly", "Rotina semanal"],
    ...(driver ? [["policy", "Limite"]] : []),
  ];
  const today =
    options?.links[0]?.today ||
    options?.defaultToday ||
    new Date().toISOString().slice(0, 10);
  const parsedDate = new Date((date || today) + "T12:00:00Z");
  const selectedDate = Number.isNaN(parsedDate.getTime())
    ? new Date(today + "T12:00:00Z")
    : parsedDate;
  if (loading)
    return <ActivityIndicator color="#23705b" style={{ margin: 25 }} />;
  return (
    <View style={{ gap: 17 }}>
      <View style={s.tabs}>
        {tabs.map(([id, label]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            key={id}
            onPress={() => setTab(id)}
            style={[s.tab, tab === id && s.selected]}
          >
            <Text style={s.link}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.success}>
          {notice}
        </Text>
      ) : null}
      {tab === "daily" && (
        <>
          <AgendaCalendar
            value={date}
            today={today}
            onChange={setDate}
            onJump={() => setShowTools(!showTools)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showTools }}
            style={s.agendaOptions}
            onPress={() => setShowTools(!showTools)}
          >
            <Text style={s.agendaMuted}>Opções do planejamento</Text>
            <Text style={s.agendaMuted}>{showTools ? "⌃" : "⌄"}</Text>
          </Pressable>
          {showTools && (
            <View style={s.card}>
              <Text style={s.title}>Planejamento diário</Text>
              <Text style={s.note}>
                Ida e volta são independentes. Sem resposta, o trecho previsto
                continua pendente.
              </Text>
              <Field
                label="Data do planejamento (AAAA-MM-DD)"
                value={date}
                onChangeText={setDate}
              />
              <Action
                secondary
                busy={busy}
                title="Atualizar situação"
                onPress={() =>
                  run(async () => {
                    await loadOptions();
                    await loadBoard();
                  })
                }
              />
            </View>
          )}
          <View style={s.agendaHeading}>
            <View>
              <Text style={s.agendaEyebrow}>
                {date === today
                  ? "HOJE"
                  : date === tomorrow(today)
                    ? "AMANHÃ"
                    : selectedDate
                        .toLocaleDateString("pt-BR", {
                          weekday: "long",
                          timeZone: "UTC",
                        })
                        .toUpperCase()}
              </Text>
              <View style={s.agendaDateRow}>
                <Text style={s.agendaDateNumber}>
                  {selectedDate.getUTCDate()}
                </Text>
                <View>
                  <Text style={s.agendaMonthName}>
                    {selectedDate.toLocaleDateString("pt-BR", {
                      month: "long",
                      timeZone: "UTC",
                    })}
                  </Text>
                  <Text style={s.agendaMuted}>
                    {board
                      ? `${board.plans.length} trechos · ${board.counts.pending} pendentes`
                      : "Carregando planejamento…"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={s.agendaHeadActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Atualizar situação"
                disabled={busy}
                onPress={() => run(loadBoard)}
                style={s.agendaRefresh}
              >
                <Text style={s.agendaRefreshText}>↻</Text>
              </Pressable>
            </View>
          </View>
          {board && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showSummary }}
                style={s.agendaSummary}
                onPress={() => setShowSummary(!showSummary)}
              >
                <Text style={s.agendaMuted}>
                  Resumo do dia {showSummary ? "⌃" : "⌄"}
                </Text>
              </Pressable>
              {showSummary && (
                <View style={s.counts}>
                  {[
                    [board.counts.scheduled, "Previstos"],
                    [board.counts.pending, "Pendentes"],
                    [board.counts.confirmed, "Confirmados"],
                    [board.counts.notUsing, "Não utilizará"],
                    [
                      board.counts.missingConfiguration,
                      "Previsão sem configuração",
                    ],
                    [board.counts.awaitingChanges, "Em análise"],
                  ].map(([n, label]) => (
                    <View style={s.count} key={label}>
                      <Text style={s.countNumber}>{n}</Text>
                      <Text style={s.note}>{label}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!board.plans.length && (
                <View style={s.card}>
                  <Text style={s.note}>
                    Nenhuma previsão registrada nesta data. Confira os vínculos
                    ativos e o limite configurado pelo transporte. Datas
                    permitidas são preparadas automaticamente; datas passadas
                    são somente para consulta.
                  </Text>
                </View>
              )}
              {guardian
                ? groupAgenda(board.plans).map((g) => (
                    <GuardianDayCard
                      key={context.id + g.key}
                      plans={g.plans}
                      submit={(body) => api("day/respond", body)}
                      refresh={loadBoard}
                      withdraw={(p) => decide(p as Plan, "WITHDRAW")}
                    />
                  ))
                : board.plans.map((p) => (
                    <View
                      key={p.id}
                      style={[
                        s.agendaEvent,
                        expanded === p.id && s.agendaEventExpanded,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: expanded === p.id }}
                        accessibilityLabel={`${p.direction === "OUTBOUND" ? "Ida" : "Volta"} de ${p.student_name}. ${p.request_id ? planningLabel(p) + " · Alteração aguardando aceite" : planningLabel(p)}`}
                        onPress={() =>
                          setExpanded(expanded === p.id ? null : p.id)
                        }
                        style={s.agendaEventRow}
                      >
                        <View style={s.agendaEventIcon}>
                          <Text style={s.agendaArrow}>
                            {p.direction === "OUTBOUND" ? "↑" : "↓"}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.agendaMeta}>
                            {p.direction === "OUTBOUND"
                              ? "IDA · CASA → ESCOLA"
                              : "VOLTA · ESCOLA → CASA"}
                          </Text>
                          <Text style={s.agendaEventTitle}>
                            {p.student_name}
                          </Text>
                          <Text style={s.agendaEventStatus}>
                            {p.request_id
                              ? planningLabel(p) +
                                " · Alteração aguardando aceite"
                              : planningLabel(p)}
                          </Text>
                        </View>
                        <View style={s.agendaEventOpen}>
                          <Text style={s.agendaOpenText}>
                            {expanded === p.id ? "⌄" : "↗"}
                          </Text>
                        </View>
                      </Pressable>
                      {expanded === p.id && (
                        <View style={s.agendaDetail}>
                          <Text style={s.direction}>
                            {p.direction === "OUTBOUND"
                              ? "IDA · CASA → ESCOLA"
                              : "VOLTA · ESCOLA → CASA"}
                          </Text>
                          <Text style={s.title}>{p.student_name}</Text>
                          <Text style={s.badge}>{planningLabel(p)}</Text>
                          <Text style={s.note}>
                            {p.school_name}
                            {"\n"}
                            {p.transport_name}
                            {"\n"}Cadastro {p.student_id.slice(-8)}
                          </Text>
                          <Text style={s.deadline}>
                            Limite:{" "}
                            {new Date(p.deadline_at).toLocaleString("pt-BR", {
                              timeZone: p.timezone,
                            })}
                            {"\n"}
                            {p.timezone.replaceAll("_", " ")}
                          </Text>
                          <Text style={s.note}>
                            {p.routine_revision === null
                              ? "Este planejamento foi criado sem rotina definida."
                              : p.scheduled
                                ? "Trecho previsto na rotina."
                                : "Sem previsão na rotina."}
                          </Text>
                          {p.request_id && (
                            <View style={s.request}>
                              <Text style={s.strong}>
                                Alteração aguardando aceite
                              </Text>
                              <Text style={s.note}>
                                Pedido:{" "}
                                {p.requested_usage
                                  ? "utilizará"
                                  : "não utilizará"}{" "}
                                este trecho.
                              </Text>
                              <Text style={s.note}>{p.request_reason}</Text>
                              <Text style={s.note}>
                                Situação vigente: {planningLabel(p)}
                              </Text>
                            </View>
                          )}
                          {!p.request_id &&
                            p.last_change &&
                            decisions[p.last_change.status] && (
                              <View style={s.history}>
                                <Text style={s.strong}>
                                  {decisions[p.last_change.status]}
                                </Text>
                                {p.last_change.decisionNote && (
                                  <Text style={s.note}>
                                    {p.last_change.decisionNote}
                                  </Text>
                                )}
                              </View>
                            )}
                          {p.locked_at ? (
                            <Text style={s.note}>
                              Planejamento bloqueado pela operação.
                            </Text>
                          ) : p.service_date < p.today ? (
                            <Text style={s.note}>
                              Data passada · somente consulta.
                            </Text>
                          ) : guardian ? (
                            p.request_id ? (
                              p.can_withdraw && (
                                <Action
                                  secondary
                                  busy={busy}
                                  title="Retirar pedido de alteração"
                                  onPress={() => decide(p, "WITHDRAW")}
                                />
                              )
                            ) : p.service_date > tomorrow(p.today) ? (
                              <Text style={s.note}>
                                Confirme no dia anterior a esta data.
                              </Text>
                            ) : (
                              <>
                                <Field
                                  label="Motivo (obrigatório após o limite)"
                                  value={notes[p.id] || ""}
                                  onChangeText={(v) =>
                                    setNotes({ ...notes, [p.id]: v })
                                  }
                                />
                                <Action
                                  busy={busy}
                                  title={
                                    p.late ? "Solicitar uso" : "Confirmar uso"
                                  }
                                  onPress={() => respond(p, true)}
                                />
                                <Action
                                  secondary
                                  busy={busy}
                                  title={
                                    p.late
                                      ? "Solicitar não uso"
                                      : "Não utilizará"
                                  }
                                  onPress={() => respond(p, false)}
                                />
                              </>
                            )
                          ) : driver && p.request_id ? (
                            <>
                              <Field
                                label="Registro da decisão (obrigatório para recusar)"
                                value={notes[p.id] || ""}
                                onChangeText={(v) =>
                                  setNotes({ ...notes, [p.id]: v })
                                }
                              />
                              <Action
                                busy={busy}
                                title="Aceitar alteração"
                                onPress={() => decide(p, "ACCEPT")}
                              />
                              <Action
                                secondary
                                busy={busy}
                                title="Recusar alteração"
                                onPress={() => decide(p, "REFUSE")}
                              />
                            </>
                          ) : null}
                        </View>
                      )}
                    </View>
                  ))}
            </>
          )}
          <Text style={s.note}>
            Estes estados de planejamento não comprovam embarque ou entrega da
            criança.
          </Text>
        </>
      )}
      {tab === "weekly" && (
        <View style={s.card}>
          <Text style={s.title}>Rotina semanal por filho</Text>
          <Text style={s.note}>Selecione o aluno e o vínculo operacional.</Text>
          {options?.links.map((l) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: linkId === l.id }}
              key={l.id}
              onPress={() => setLinkId(l.id)}
              style={[s.choice, linkId === l.id && s.selected]}
            >
              <Text style={s.strong}>
                {l.student_name} · {l.student_id.slice(-8)}
              </Text>
              <Text style={s.note}>
                {l.school_name} · {l.transport_name}
              </Text>
            </Pressable>
          ))}
          {routine && (
            <>
              {routine.days
                .slice()
                .sort((a, b) => a.weekday - b.weekday)
                .map((d) => (
                  <View style={s.dayRow} key={d.weekday}>
                    <Text style={s.strong}>{weekdays[d.weekday]}</Text>
                    <View style={s.switches}>
                      <View style={s.switchItem}>
                        <Text style={s.note}>Ida</Text>
                        <Switch
                          accessibilityLabel={`Ida ${weekdays[d.weekday]}`}
                          disabled={!guardian || busy}
                          value={d.outbound}
                          onValueChange={(v) =>
                            setRoutine({
                              ...routine,
                              days: routine.days.map((row) =>
                                row.weekday === d.weekday
                                  ? { ...row, outbound: v }
                                  : row,
                              ),
                            })
                          }
                          trackColor={{ true: "#9bbd87", false: "#e0e7d8" }}
                          thumbColor="#fff"
                        />
                      </View>
                      <View style={s.switchItem}>
                        <Text style={s.note}>Volta</Text>
                        <Switch
                          accessibilityLabel={`Volta ${weekdays[d.weekday]}`}
                          disabled={!guardian || busy}
                          value={d.return}
                          onValueChange={(v) =>
                            setRoutine({
                              ...routine,
                              days: routine.days.map((row) =>
                                row.weekday === d.weekday
                                  ? { ...row, return: v }
                                  : row,
                              ),
                            })
                          }
                          trackColor={{ true: "#9bbd87", false: "#e0e7d8" }}
                          thumbColor="#fff"
                        />
                      </View>
                    </View>
                  </View>
                ))}
              <Text style={s.note}>
                Previsões já geradas não mudam ao salvar a rotina. Altere uma
                data pelo planejamento diário.
              </Text>
              {guardian && (
                <Action
                  busy={busy}
                  title="Salvar rotina"
                  onPress={() =>
                    run(async () => {
                      await api(
                        "routines/" + linkId,
                        {
                          expectedRevision: routine.revision,
                          days: routine.days,
                        },
                        "PUT",
                      );
                      await loadRoutine();
                      setNotice(
                        "Rotina salva. Ida e volta continuam independentes.",
                      );
                    })
                  }
                />
              )}
              <Action
                secondary
                busy={busy}
                title="Recarregar rotina"
                onPress={() => run(loadRoutine)}
              />
            </>
          )}
          {!options?.links.length && (
            <Text style={s.note}>
              É necessário um vínculo operacional ativo e, para responsáveis,
              vínculo familiar verificado.
            </Text>
          )}
        </View>
      )}
      {tab === "policy" && driver && (
        <View style={s.card}>
          <Text style={s.title}>Limite de confirmação</Text>
          <Text style={s.note}>
            Configuração proposta para teste. O horário e a autoridade
            definitiva ainda dependem de validação operacional.
          </Text>
          {options?.policy?.demo && (
            <View style={s.request}>
              <Text style={s.strong}>Valor de demonstração</Text>
              <Text style={s.note}>
                18:00 no fuso de São Paulo é uma proposta, sem aprovação
                operacional implícita.
              </Text>
            </View>
          )}
          <Field
            label="Horário limite no dia anterior (HH:MM)"
            value={cutoff}
            onChangeText={setCutoff}
          />
          <Text style={s.label}>Fuso da operação</Text>
          {Array.from(
            new Set([
              "America/Sao_Paulo",
              "America/Manaus",
              "America/Rio_Branco",
              "America/Fortaleza",
              "America/Noronha",
              timezone,
            ]),
          ).map((tz) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: timezone === tz }}
              key={tz}
              onPress={() => setTimezone(tz)}
              style={[s.choice, timezone === tz && s.selected]}
            >
              <Text style={s.note}>{tz.replaceAll("_", " ")}</Text>
            </Pressable>
          ))}
          <Action
            busy={busy}
            title="Salvar limite"
            onPress={() =>
              run(async () => {
                await api(
                  "policy",
                  {
                    cutoffTime: cutoff,
                    timezone,
                    expectedRevision: options?.policy?.revision || 0,
                  },
                  "PUT",
                );
                await loadOptions();
                setNotice(
                  "Limite salvo para novas previsões. Prazos existentes preservados.",
                );
              })
            }
          />
        </View>
      )}
    </View>
  );
}
function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={{ marginTop: 17 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
      />
    </View>
  );
}
function Action({
  title,
  busy,
  onPress,
  secondary = false,
}: {
  title: string;
  busy: boolean;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      style={[s.action, secondary && s.secondary, busy && { opacity: 0.5 }]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? "#23705b" : "#fff"} />
      ) : (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: secondary ? "#23705b" : "white",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
const s = StyleSheet.create({
  agendaOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 13,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  agendaMuted: { fontSize: 10, color: "#8899aa", lineHeight: 17 },
  agendaHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  agendaEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: "#65798d",
    letterSpacing: 1,
  },
  agendaDateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  agendaDateNumber: { fontSize: 42, fontWeight: "600", color: "#43566d" },
  agendaMonthName: { fontSize: 12, fontWeight: "600", color: "#65798d" },
  agendaHeadActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  agendaRefresh: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eaf0f5",
    alignItems: "center",
    justifyContent: "center",
  },
  agendaRefreshText: { fontSize: 20, color: "#65798d" },
  agendaAdd: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#43566d",
    alignItems: "center",
    justifyContent: "center",
  },
  agendaAddText: { fontSize: 27, color: "white", lineHeight: 30 },
  agendaSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  agendaEvent: {
    backgroundColor: "#eaf0f5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e4ebf1",
    overflow: "hidden",
  },
  agendaEventExpanded: { backgroundColor: "#f6f8fb" },
  agendaEventRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    gap: 11,
  },
  agendaEventIcon: {
    width: 30,
    height: 36,
    backgroundColor: "#f7f9fc",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  agendaArrow: { fontSize: 20, color: "#8a9eb2" },
  agendaMeta: {
    fontSize: 8,
    color: "#8093a6",
    fontWeight: "600",
    letterSpacing: 1,
  },
  agendaEventTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#43566d",
    marginVertical: 3,
  },
  agendaEventStatus: { fontSize: 10, lineHeight: 17, color: "#7a8ea2" },
  agendaEventOpen: {
    width: 28,
    height: 28,
    backgroundColor: "#fff",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  agendaOpenText: { fontSize: 18, color: "#65798d" },
  agendaDetail: {
    borderTopWidth: 1,
    borderColor: "#e0e7ee",
    marginHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 20,
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: "#f0f3e9",
  },
  selected: { backgroundColor: "#deecd4", borderColor: "#90ae7a" },
  link: { fontSize: 11, color: "#23705b", fontWeight: "600" },
  card: {
    padding: 21,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e3e8dc",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 19,
    fontWeight: "600",
    color: "#213b35",
    marginBottom: 12,
  },
  note: { fontSize: 11, color: "#85947a", lineHeight: 21 },
  strong: { fontSize: 12, fontWeight: "600", color: "#486541", lineHeight: 21 },
  label: {
    fontSize: 11,
    color: "#516c43",
    fontWeight: "500",
    marginVertical: 9,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#dce3d7",
    borderRadius: 7,
    backgroundColor: "#fff",
    color: "#213b35",
  },
  action: {
    backgroundColor: "#23705b",
    borderRadius: 7,
    padding: 13,
    alignItems: "center",
    marginTop: 14,
  },
  secondary: { backgroundColor: "#edf3e6" },
  error: {
    backgroundColor: "#fff0ed",
    color: "#9b3b2b",
    padding: 13,
    lineHeight: 21,
    fontSize: 12,
    borderRadius: 7,
  },
  success: {
    backgroundColor: "#e6f2e4",
    color: "#276147",
    padding: 13,
    lineHeight: 21,
    fontSize: 12,
    borderRadius: 7,
  },
  direction: {
    fontSize: 9,
    color: "#7d976b",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 11,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#f3f0e2",
    color: "#9b8246",
    fontSize: 10,
    padding: 7,
    borderRadius: 5,
    marginBottom: 13,
  },
  deadline: {
    fontSize: 10,
    color: "#8e9d80",
    lineHeight: 20,
    borderTopWidth: 1,
    borderColor: "#e7ebdf",
    paddingTop: 13,
    marginTop: 13,
    marginBottom: 10,
  },
  request: {
    padding: 14,
    backgroundColor: "#f6f0dc",
    borderRadius: 7,
    marginTop: 14,
  },
  history: {
    padding: 14,
    backgroundColor: "#edf4e5",
    borderRadius: 7,
    marginTop: 14,
  },
  choice: {
    padding: 13,
    borderWidth: 1,
    borderColor: "#e4e9dc",
    borderRadius: 6,
    marginTop: 9,
  },
  dayRow: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "#e7ebdf",
    marginTop: 12,
  },
  switches: { flexDirection: "row", gap: 30, marginTop: 10 },
  switchItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  count: {
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#e3e8dc",
    minWidth: 95,
    flexGrow: 1,
  },
  countNumber: { fontSize: 24, color: "#213b35", fontWeight: "500" },
});
