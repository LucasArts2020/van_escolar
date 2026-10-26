import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
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
type Context = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: "SCHOOL" | "DRIVER" | "GUARDIAN";
};
type Student = {
  id: string;
  name: string;
  birth_date: string | null;
  owner_organization_id: string;
  operational: boolean;
};
type Guardian = {
  id: string;
  email: string;
  name: string | null;
  status: string;
};
type Detail = Student & { canManageGuardians: boolean; guardians: Guardian[] };
type Link = {
  id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  status: string;
  incoming: boolean;
};
type Org = { id: string; name: string; kind: string };
type Vehicle = {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  active: boolean;
};
const status: Record<string, string> = {
  PENDING: "Aguardando aceite",
  ACTIVE: "Ativo",
  REFUSED: "Recusado",
  INACTIVE: "Inativo",
  INVITED: "Convite pendente",
  AWAITING_VERIFICATION: "Aguardando verificação",
};
export default function Registry({
  context,
  client,
  onContextsChanged,
}: {
  context: Context;
  client: Client;
  onContextsChanged: () => Promise<void>;
}) {
  const operator = context.role !== "GUARDIAN";
  const [tab, setTab] = useState("students"),
    [students, setStudents] = useState<Student[]>([]),
    [links, setLinks] = useState<Link[]>([]),
    [orgs, setOrgs] = useState<Org[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [drivers, setDrivers] = useState<
      { id: string; name: string; transport_name: string }[]
    >([]),
    [pending, setPending] = useState<
      { id: string; status: string; organization_name: string }[]
    >([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [name, setName] = useState(""),
    [birth, setBirth] = useState(""),
    [duplicateReason, setDuplicateReason] = useState(""),
    [selected, setSelected] = useState(""),
    [counterpart, setCounterpart] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [email, setEmail] = useState(""),
    [vehicleName, setVehicleName] = useState(""),
    [plate, setPlate] = useState(""),
    [capacity, setCapacity] = useState("15"),
    [driverEmail, setDriverEmail] = useState(""),
    [driverNote, setDriverNote] = useState(""),
    [orgName, setOrgName] = useState("");
  const api = <T,>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ) => client<T>("registry/" + path, body, undefined, method);
  async function load() {
    if (operator) {
      const [s, l, o, v, d] = await Promise.all([
        api<Student[]>("students"),
        api<Link[]>("links"),
        api<Org[]>("organizations"),
        api<Vehicle[]>("vehicles"),
        api<typeof drivers>("drivers"),
      ]);
      setStudents(s);
      setLinks(l);
      setOrgs(o);
      setVehicles(v);
      setDrivers(d);
    } else {
      const [s, p] = await Promise.all([
        api<Student[]>("students"),
        api<typeof pending>("guardian-status"),
      ]);
      setStudents(s);
      setPending(p);
    }
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
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
  async function refreshDetail(id = detail?.id) {
    if(!id)return;
    setDetail(null);
    setDetail(await api<Detail>("students/" + id));
  }
  function linkAction(l: Link, action: string) {
    void run(async () => {
      await api(
        "links/" + l.id,
        {
          action,
          ...(action === "ACCEPT" ? {} : { reason: notes[l.id] || "" }),
        },
        "PATCH",
      );
      await load();
      setNotice("Vínculo atualizado. Registros preservados.");
    });
  }
  const tabs = [
    ["students", operator ? "Alunos" : "Filhos"],
    ...(operator
      ? [
          ["links", "Vínculos"],
          ["vehicles", "Veículos"],
          ["drivers", "Motoristas"],
          ["organization", "Organização"],
        ]
      : []),
  ];
  if (loading)
    return <ActivityIndicator color="#23705b" style={{ marginVertical: 30 }} />;
  return (
    <View style={{ gap: 16 }}>
      <View style={s.tabs}>
        {tabs.map(([id, label]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            key={id}
            onPress={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
            style={[s.chip, tab === id && s.current]}
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
      {tab === "students" && (
        <>
          <View style={s.card}>
            <Text style={s.title}>
              {operator
                ? "Alunos deste contexto"
                : "Filhos com vínculo verificado"}
            </Text>
            {students.length ? (
              students.map((st) => (
                <Pressable
                  accessibilityRole="button"
                  style={s.listItem}
                  key={st.id}
                  disabled={busy}
                  onPress={() => run(() => refreshDetail(st.id))}
                >
                  <Text style={s.strong}>{st.name} →</Text>
                  <Text style={s.note}>
                    {operator
                      ? st.operational
                        ? "Associação operacional ativa"
                        : "Cadastro local · sem associação ativa"
                      : "Vínculo familiar verificado"}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={s.note}>
                {operator
                  ? "Nenhum aluno cadastrado."
                  : "Aceite o convite e aguarde a verificação do vínculo com a criança."}
              </Text>
            )}
            {!operator &&
              pending
                .filter((p) => p.status === "AWAITING_VERIFICATION")
                .map((p) => (
                  <Text key={p.id} style={s.pending}>
                    Vínculo aguardando verificação de {p.organization_name}.
                  </Text>
                ))}
          </View>
          {detail && (
            <View style={s.card}>
              <Text style={s.title}>{detail.name}</Text>
              <Text style={s.note}>
                {detail.birth_date
                  ? "Nascimento: " +
                    detail.birth_date.split("-").reverse().join("/")
                  : "Nascimento não informado"}{" "}
                · {detail.id.slice(-8)}
              </Text>
              {operator && (
                <>
                  <Text style={[s.strong, { marginTop: 18 }]}>
                    Responsáveis
                  </Text>
                  {detail.guardians.length ? (
                    detail.guardians.map((g) => (
                      <View key={g.id} style={s.listItem}>
                        <Text style={s.strong}>{g.name || g.email}</Text>
                        <Text style={s.note}>{status[g.status]}</Text>
                        {detail.canManageGuardians &&
                          g.status !== "INACTIVE" && (
                            <>
                              <Field
                                label="Verificação ou motivo"
                                value={notes[g.id] || ""}
                                onChangeText={(v) =>
                                  setNotes({ ...notes, [g.id]: v })
                                }
                              />
                              {g.status === "AWAITING_VERIFICATION" && (
                                <Action
                                  busy={busy}
                                  title="Verificar vínculo"
                                  onPress={() =>
                                    run(async () => {
                                      await api(
                                        "guardian-links/" + g.id,
                                        {
                                          action: "VERIFY",
                                          verificationNote: notes[g.id] || "",
                                        },
                                        "PATCH",
                                      );
                                      await refreshDetail();
                                      setNotice(
                                        "Vínculo verificado e acesso liberado.",
                                      );
                                    })
                                  }
                                />
                              )}
                              <Action
                                secondary
                                busy={busy}
                                title="Inativar vínculo"
                                onPress={() =>
                                  run(async () => {
                                    await api(
                                      "guardian-links/" + g.id,
                                      {
                                        action: "DEACTIVATE",
                                        verificationNote: notes[g.id] || "",
                                      },
                                      "PATCH",
                                    );
                                    await refreshDetail();
                                  })
                                }
                              />
                            </>
                          )}
                      </View>
                    ))
                  ) : (
                    <Text style={s.note}>
                      Nenhum responsável disponível neste contexto.
                    </Text>
                  )}
                  {detail.canManageGuardians && (
                    <>
                      <Field
                        label="E-mail do responsável"
                        value={email}
                        onChangeText={setEmail}
                        email
                      />
                      <Action
                        busy={busy}
                        title="Convidar responsável"
                        onPress={() =>
                          run(async () => {
                            await api(
                              "students/" + detail.id + "/guardian-invites",
                              { email },
                            );
                            setEmail("");
                            await refreshDetail();
                            setNotice(
                              "Convite criado. Consulte o link no terminal da API. Após o aceite, confira e verifique o vínculo.",
                            );
                          })
                        }
                      />
                    </>
                  )}
                </>
              )}
              <Action
                secondary
                busy={busy}
                title="Fechar detalhe"
                onPress={() => setDetail(null)}
              />
            </View>
          )}
          {operator && (
            <View style={s.card}>
              <Text style={s.title}>Cadastrar aluno</Text>
              <Field
                label="Nome completo"
                value={name}
                onChangeText={setName}
              />
              <Field
                label="Nascimento opcional (AAAA-MM-DD)"
                value={birth}
                onChangeText={setBirth}
              />
              <Field
                label="Justificativa se revisou possível duplicidade"
                value={duplicateReason}
                onChangeText={setDuplicateReason}
              />
              <Text style={s.note}>
                Nomes iguais precisam de revisão. Os cadastros nunca são unidos
                automaticamente.
              </Text>
              <Action
                busy={busy}
                title="Salvar aluno"
                onPress={() =>
                  run(async () => {
                    const r = await api<{ id: string }>("students", {
                      name,
                      ...(birth ? { birthDate: birth } : {}),
                      ...(duplicateReason
                        ? { duplicateReviewed: true, duplicateReason }
                        : {}),
                    });
                    setName("");
                    setBirth("");
                    setDuplicateReason("");
                    await load();
                    await refreshDetail(r.id);
                    setNotice(
                      "Aluno cadastrado. Solicite a associação na aba Vínculos.",
                    );
                  })
                }
              />
            </View>
          )}
        </>
      )}
      {tab === "links" && (
        <>
          <View style={s.card}>
            <Text style={s.title}>Solicitar associação</Text>
            <Text style={s.note}>
              Escolha um aluno do seu cadastro e a outra organização. O acesso
              operacional depende do aceite.
            </Text>
            <Text style={s.label}>Aluno</Text>
            {students
              .filter(
                (st) => st.owner_organization_id === context.organization_id,
              )
              .map((st) => (
                <Choice
                  key={st.id}
                  label={st.name + " · " + st.id.slice(-8)}
                  current={selected === st.id}
                  onPress={() => setSelected(st.id)}
                />
              ))}
            <Text style={s.label}>
              {context.role === "DRIVER"
                ? "Escola destinatária"
                : "Transporte destinatário"}
            </Text>
            {orgs
              .filter(
                (o) =>
                  o.kind ===
                  (context.role === "DRIVER" ? "SCHOOL" : "TRANSPORT"),
              )
              .map((o) => (
                <Choice
                  key={o.id}
                  label={o.name + " · " + o.id.slice(-8)}
                  current={counterpart === o.id}
                  onPress={() => setCounterpart(o.id)}
                />
              ))}
            <Action
              busy={busy}
              title="Solicitar vínculo"
              onPress={() =>
                run(async () => {
                  await api("links", {
                    studentId: selected,
                    counterpartId: counterpart,
                  });
                  await load();
                  setNotice(
                    "Solicitação criada. Aguarde o aceite da outra organização.",
                  );
                })
              }
            />
          </View>
          <View style={s.card}>
            <Text style={s.title}>Solicitações e vínculos</Text>
            {!links.length && (
              <Text style={s.note}>Nenhuma solicitação neste contexto.</Text>
            )}
            {links.map((l) => (
              <View key={l.id} style={s.listItem}>
                <Text style={s.badge}>{status[l.status]}</Text>
                <Text style={s.strong}>{l.student_name}</Text>
                <Text style={s.note}>
                  {l.school_name} ↔ {l.transport_name}
                </Text>
                <Text style={s.note}>
                  {l.incoming
                    ? "Solicitação recebida"
                    : "Iniciada por este contexto"}
                </Text>
                {l.status === "PENDING" && l.incoming && (
                  <Action
                    busy={busy}
                    title="Aceitar vínculo"
                    onPress={() => linkAction(l, "ACCEPT")}
                  />
                )}{" "}
                {["PENDING", "ACTIVE"].includes(l.status) && (
                  <>
                    <Field
                      label="Motivo para recusar ou inativar"
                      value={notes[l.id] || ""}
                      onChangeText={(v) => setNotes({ ...notes, [l.id]: v })}
                    />
                    {l.status === "PENDING" && l.incoming && (
                      <Action
                        secondary
                        busy={busy}
                        title="Recusar"
                        onPress={() => linkAction(l, "REFUSE")}
                      />
                    )}
                    <Action
                      secondary
                      busy={busy}
                      title={
                        l.status === "ACTIVE"
                          ? "Inativar vínculo"
                          : "Cancelar solicitação"
                      }
                      onPress={() => linkAction(l, "DEACTIVATE")}
                    />
                  </>
                )}
              </View>
            ))}
          </View>
        </>
      )}
      {tab === "vehicles" && (
        <>
          <View style={s.card}>
            <Text style={s.title}>Veículos</Text>
            {vehicles.length ? (
              vehicles.map((v) => (
                <View style={s.listItem} key={v.id}>
                  <Text style={s.strong}>
                    {v.name} · {v.plate}
                  </Text>
                  <Text style={s.note}>
                    {v.capacity} lugares · {v.active ? "Ativo" : "Inativo"}
                  </Text>
                  {context.role === "DRIVER" && (
                    <Action
                      secondary
                      busy={busy}
                      title={v.active ? "Inativar" : "Reativar"}
                      onPress={() =>
                        run(async () => {
                          await api(
                            "vehicles/" + v.id,
                            { active: !v.active },
                            "PATCH",
                          );
                          await load();
                        })
                      }
                    />
                  )}
                </View>
              ))
            ) : (
              <Text style={s.note}>
                Nenhum veículo disponível neste contexto.
              </Text>
            )}
          </View>
          {context.role === "DRIVER" && (
            <View style={s.card}>
              <Text style={s.title}>Cadastrar veículo</Text>
              <Field
                label="Nome do veículo"
                value={vehicleName}
                onChangeText={setVehicleName}
              />
              <Field label="Placa" value={plate} onChangeText={setPlate} />
              <Field
                label="Capacidade"
                value={capacity}
                onChangeText={setCapacity}
                numeric
              />
              <Action
                busy={busy}
                title="Salvar veículo"
                onPress={() =>
                  run(async () => {
                    await api("vehicles", {
                      name: vehicleName,
                      plate,
                      capacity: Number(capacity),
                    });
                    setVehicleName("");
                    setPlate("");
                    await load();
                    setNotice("Veículo cadastrado.");
                  })
                }
              />
            </View>
          )}
        </>
      )}
      {tab === "drivers" && (
        <>
          <View style={s.card}>
            <Text style={s.title}>Motoristas vinculados</Text>
            {drivers.length ? (
              drivers.map((d) => (
                <View style={s.listItem} key={d.id}>
                  <Text style={s.strong}>{d.name}</Text>
                  <Text style={s.note}>{d.transport_name}</Text>
                </View>
              ))
            ) : (
              <Text style={s.note}>
                Nenhum motorista disponível neste contexto.
              </Text>
            )}
          </View>
          {context.role === "DRIVER" && (
            <View style={s.card}>
              <Text style={s.title}>Convidar motorista</Text>
              <Field
                label="E-mail do motorista"
                value={driverEmail}
                onChangeText={setDriverEmail}
                email
              />
              <Field
                label="Como conferiu o vínculo profissional"
                value={driverNote}
                onChangeText={setDriverNote}
              />
              <Action
                busy={busy}
                title="Criar convite"
                onPress={() =>
                  run(async () => {
                    await api("driver-invites", {
                      email: driverEmail,
                      verificationNote: driverNote,
                    });
                    setDriverEmail("");
                    setDriverNote("");
                    setNotice(
                      "Convite criado. O link de teste está no terminal da API.",
                    );
                  })
                }
              />
            </View>
          )}
        </>
      )}
      {tab === "organization" && (
        <View style={s.card}>
          <Text style={s.title}>{context.organization_name}</Text>
          <Text style={s.note}>Organizações relacionadas às solicitações</Text>
          {Array.from(
            new Set(
              links.map((l) =>
                context.role === "DRIVER" ? l.school_name : l.transport_name,
              ),
            ),
          ).map((n) => (
            <Text style={s.strong} key={n}>
              {n}
            </Text>
          ))}
          <Field
            label="Nome de outra operação para cadastrar"
            value={orgName}
            onChangeText={setOrgName}
          />
          <Text style={s.note}>
            Um contexto independente será criado; nenhum aluno será transferido
            automaticamente.
          </Text>
          <Action
            busy={busy}
            title="Cadastrar novo contexto"
            onPress={() =>
              run(async () => {
                await api("organizations", { name: orgName });
                setOrgName("");
                await onContextsChanged();
                setNotice("Contexto criado. Selecione-o na aba Contextos.");
              })
            }
          />
        </View>
      )}
      <Action
        secondary
        busy={busy}
        title="Atualizar cadastros"
        onPress={() =>
          run(async () => {
            await load();
            if (detail) await refreshDetail();
          })
        }
      />
    </View>
  );
}
function Field({
  label,
  value,
  onChangeText,
  email,
  numeric,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  email?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ marginTop: 17 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={email ? "none" : "sentences"}
        keyboardType={
          email ? "email-address" : numeric ? "number-pad" : "default"
        }
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
        <ActivityIndicator color={secondary ? "#23705b" : "white"} />
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
function Choice({
  label,
  current,
  onPress,
}: {
  label: string;
  current: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: current }}
      onPress={onPress}
      style={[s.choice, current && s.current]}
    >
      <Text style={s.note}>
        {current ? "● " : "○ "}
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#f0f3e9",
    borderRadius: 6,
  },
  current: { backgroundColor: "#deecd4", borderColor: "#90ae7a" },
  link: { fontSize: 11, color: "#23705b", fontWeight: "600" },
  card: {
    padding: 21,
    borderWidth: 1,
    borderColor: "#e3e8dc",
    backgroundColor: "#fff",
    borderRadius: 11,
  },
  title: {
    fontSize: 19,
    fontWeight: "600",
    color: "#213b35",
    marginBottom: 13,
  },
  strong: { fontSize: 13, fontWeight: "600", color: "#213b35", lineHeight: 22 },
  note: { fontSize: 11, color: "#85947a", lineHeight: 21 },
  label: {
    fontSize: 11,
    color: "#516c43",
    fontWeight: "500",
    marginVertical: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: "#dce3d7",
    backgroundColor: "#fff",
    borderRadius: 7,
    padding: 12,
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
  listItem: { borderTopWidth: 1, borderColor: "#e7ebdf", paddingVertical: 17 },
  choice: {
    padding: 11,
    borderWidth: 1,
    borderColor: "#e4e9dc",
    borderRadius: 6,
    marginBottom: 7,
  },
  badge: { fontSize: 10, color: "#9b8246", marginBottom: 7 },
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
  pending: {
    backgroundColor: "#f6f0dc",
    color: "#9b8246",
    fontSize: 11,
    padding: 12,
    lineHeight: 21,
    marginTop: 14,
    borderRadius: 6,
  },
});
