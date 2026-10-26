"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BusFront,
  Check,
  GraduationCap,
  LoaderCircle,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
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
  owner_name?: string;
  operational: boolean;
};
type Guardian = {
  id: string;
  email: string;
  name: string | null;
  status: string;
};
type Detail = Student & { canManageGuardians: boolean; guardians: Guardian[] };
type Organization = { id: string; name: string; kind: string };
type Link = {
  id: string;
  student_id: string;
  student_name: string;
  school_name: string;
  transport_name: string;
  school_id: string;
  transport_id: string;
  status: string;
  incoming: boolean;
};
type Vehicle = {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  active: boolean;
  transport_name: string;
};
type Driver = { id: string; name: string; transport_name: string };
const statuses: Record<string, string> = {
  PENDING: "Aguardando aceite",
  ACTIVE: "Ativo",
  REFUSED: "Recusado",
  INACTIVE: "Inativo",
  INVITED: "Convite pendente",
  AWAITING_VERIFICATION: "Aguardando verificação",
};
export default function RegistryPanel({
  context,
  onContextsChanged,
}: {
  context: Context;
  onContextsChanged: () => Promise<void>;
}) {
  const operator = context.role !== "GUARDIAN";
  const [tab, setTab] = useState("students"),
    [students, setStudents] = useState<Student[]>([]),
    [links, setLinks] = useState<Link[]>([]),
    [orgs, setOrgs] = useState<Organization[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [drivers, setDrivers] = useState<Driver[]>([]);
  const [pending, setPending] = useState<
      { id: string; status: string; organization_name: string }[]
    >([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false),
    [studentName, setStudentName] = useState(""),
    [birthDate, setBirthDate] = useState(""),
    [duplicate, setDuplicate] = useState(false),
    [duplicateReason, setDuplicateReason] = useState("");
  const [linkStudent, setLinkStudent] = useState(""),
    [counterpart, setCounterpart] = useState(""),
    [reason, setReason] = useState<Record<string, string>>({}),
    [guardianEmail, setGuardianEmail] = useState("");
  const [vehicleName, setVehicleName] = useState(""),
    [plate, setPlate] = useState(""),
    [capacity, setCapacity] = useState("15"),
    [orgName, setOrgName] = useState(""),
    [rename, setRename] = useState(context.organization_name),
    [driverEmail, setDriverEmail] = useState(""),
    [driverNote, setDriverNote] = useState("");
  async function api<T>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ): Promise<T> {
    const res = await fetch("/api/registry/" + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Context-Id": context.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Não foi possível concluir.");
    return data;
  }
  async function load() {
    if (operator) {
      const [s, l, o, v, d] = await Promise.all([
        api<Student[]>("students"),
        api<Link[]>("links"),
        api<Organization[]>("organizations"),
        api<Vehicle[]>("vehicles"),
        api<Driver[]>("drivers"),
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
  async function refreshDetail(id = selected) {
    if (id) setDetail(await api<Detail>("students/" + id));
  }
  useEffect(() => {
    let alive = true;
    load()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setDetail(null);
    if (selected)
      api<Detail>("students/" + selected)
        .then((d) => {
          if (alive) setDetail(d);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [selected]);
  async function run(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    ["students", operator ? "Alunos" : "Meus filhos"],
    ...(operator
      ? [
          ["links", "Solicitações"],
          [
            "organizations",
            context.role === "SCHOOL"
              ? "Escolas e transportes"
              : "Transportes e escolas",
          ],
          ["vehicles", "Veículos"],
          ["drivers", "Motoristas"],
        ]
      : []),
  ];
  const owned = students.filter(
    (s) => s.owner_organization_id === context.organization_id,
  );
  function createStudent(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ id: string }>("students", {
        name: studentName,
        ...(birthDate ? { birthDate } : {}),
        ...(duplicate ? { duplicateReviewed: true, duplicateReason } : {}),
      });
      setCreating(false);
      setStudentName("");
      setBirthDate("");
      setDuplicate(false);
      setDuplicateReason("");
      await load();
      setSelected(r.id);
      setNotice(
        "Aluno cadastrado. Solicite o vínculo com a outra organização para habilitar a operação.",
      );
    });
  }
  function actLink(l: Link, action: string) {
    void run(async () => {
      await api(
        "links/" + l.id,
        {
          action,
          ...(action === "ACCEPT" ? {} : { reason: reason[l.id] || "" }),
        },
        "PATCH",
      );
      await load();
      if (selected) await refreshDetail();
      setNotice(
        action === "ACCEPT"
          ? "Vínculo aceito. O cadastro agora está disponível para as duas organizações."
          : "Vínculo atualizado. O histórico foi preservado.",
      );
    });
  }
  const related = Array.from(
    new Map(
      links.map((l) => [
        context.role === "SCHOOL" ? l.transport_id : l.school_id,
        {
          id: context.role === "SCHOOL" ? l.transport_id : l.school_id,
          name: context.role === "SCHOOL" ? l.transport_name : l.school_name,
        },
      ]),
    ).values(),
  );
  return (
    <div className="registry-root">
      <div className="registry-tabs" role="tablist" aria-label="Cadastros">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
          >
            {label}
            {id === "links" &&
              links.some((l) => l.status === "PENDING" && l.incoming) && (
                <span className="registry-dot" />
              )}
          </button>
        ))}
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <div className="panel loading-inline">
          <LoaderCircle className="spin" size={18} /> Carregando cadastros…
        </div>
      ) : (
        <>
          {tab === "students" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      {operator
                        ? "Alunos deste contexto"
                        : "Filhos com vínculo verificado"}{" "}
                      <span className="count">{students.length}</span>
                    </h3>
                    <p>
                      {operator
                        ? "Cadastros próprios e associações aceitas. Solicitações recebidas ficam na aba Solicitações."
                        : "Cada acesso depende da verificação individual do vínculo com a criança."}
                    </p>
                  </div>
                  {operator && (
                    <button
                      className="button"
                      onClick={() => setCreating(!creating)}
                    >
                      <Plus size={16} />
                      {creating ? "Fechar cadastro" : "Novo aluno"}
                    </button>
                  )}
                </div>
                {creating && (
                  <form className="registry-form" onSubmit={createStudent}>
                    <h3>Cadastrar aluno</h3>
                    <div className="registry-form-grid">
                      <label>
                        Nome completo
                        <input
                          autoFocus
                          required
                          minLength={2}
                          maxLength={120}
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                        />
                      </label>
                      <label>
                        Nascimento (opcional)
                        <input
                          type="date"
                          max={new Date().toISOString().slice(0, 10)}
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="registry-check">
                      <input
                        type="checkbox"
                        checked={duplicate}
                        onChange={(e) => setDuplicate(e.target.checked)}
                      />{" "}
                      Revisei um possível cadastro com o mesmo nome e preciso
                      criar outro separado
                    </label>
                    {duplicate && (
                      <label>
                        Justificativa da revisão
                        <textarea
                          required
                          minLength={10}
                          maxLength={1000}
                          value={duplicateReason}
                          onChange={(e) => setDuplicateReason(e.target.value)}
                        />
                      </label>
                    )}
                    <button className="button" disabled={busy}>
                      Salvar aluno <Check size={16} />
                    </button>
                  </form>
                )}
                {!students.length ? (
                  <div className="registry-empty">
                    <Users size={30} />
                    <h3>
                      {operator
                        ? "Vamos cadastrar o primeiro aluno."
                        : "Nenhum vínculo liberado por enquanto."}
                    </h3>
                    <p>
                      {operator
                        ? "Escola e transporte podem iniciar seus próprios cadastros."
                        : "Depois de aceitar o convite, aguarde a organização conferir seu vínculo com a criança."}
                    </p>
                  </div>
                ) : (
                  <div className="registry-students">
                    {students.map((s) => (
                      <button
                        className={
                          "registry-student " +
                          (selected === s.id ? "current" : "")
                        }
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                      >
                        <span className="avatar">{s.name[0]}</span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {context.role === "GUARDIAN"
                              ? "Vínculo familiar verificado"
                              : s.operational
                                ? "Associação operacional ativa"
                                : "Cadastro local · sem associação ativa"}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
                {!operator &&
                  pending
                    .filter((p) => p.status === "AWAITING_VERIFICATION")
                    .map((p) => (
                      <div key={p.id} className="registry-pending">
                        <ShieldCheck size={17} />
                        <p>
                          <strong>Vínculo em verificação</strong>
                          <br />
                          {p.organization_name} ainda precisa conferir e liberar
                          seu acesso.
                        </p>
                      </div>
                    ))}
              </section>
              {selected && (
                <section className="panel registry-detail">
                  {!detail ? (
                    <p className="muted">Carregando aluno…</p>
                  ) : (
                    <>
                      <div className="panel-heading">
                        <div>
                          <h3>{detail.name}</h3>
                          <p>
                            {detail.birth_date
                              ? "Nascimento: " +
                                detail.birth_date.split("-").reverse().join("/")
                              : "Data de nascimento não informada"}{" "}
                            · Registro {detail.id.slice(-8)}
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setSelected("")}
                        >
                          Fechar detalhe
                        </button>
                      </div>
                      {operator && (
                        <>
                          <h3>Responsáveis vinculados</h3>
                          {detail.guardians.length ? (
                            detail.guardians.map((g) => (
                              <div className="registry-guardian" key={g.id}>
                                <div>
                                  <strong>{g.name || g.email}</strong>
                                  <small>{g.name ? g.email : ""}</small>
                                  <span
                                    className={
                                      "registry-badge " + g.status.toLowerCase()
                                    }
                                  >
                                    {statuses[g.status]}
                                  </span>
                                </div>
                                {detail.canManageGuardians &&
                                  g.status !== "INACTIVE" && (
                                    <div>
                                      <label>
                                        Registro da verificação ou motivo
                                        <input
                                          aria-label={
                                            "Verificação de " + g.email
                                          }
                                          minLength={10}
                                          value={reason[g.id] || ""}
                                          onChange={(e) =>
                                            setReason({
                                              ...reason,
                                              [g.id]: e.target.value,
                                            })
                                          }
                                          placeholder="Descreva a conferência realizada"
                                        />
                                      </label>
                                      <div className="registry-inline-actions">
                                        {g.status ===
                                          "AWAITING_VERIFICATION" && (
                                          <button
                                            className="button"
                                            disabled={busy}
                                            onClick={() =>
                                              run(async () => {
                                                await api(
                                                  "guardian-links/" + g.id,
                                                  {
                                                    action: "VERIFY",
                                                    verificationNote:
                                                      reason[g.id] || "",
                                                  },
                                                  "PATCH",
                                                );
                                                await refreshDetail();
                                                setNotice(
                                                  "Vínculo verificado. O responsável já pode consultar esta criança.",
                                                );
                                              })
                                            }
                                          >
                                            Verificar vínculo
                                          </button>
                                        )}
                                        <button
                                          className="text-button"
                                          disabled={busy}
                                          onClick={() =>
                                            run(async () => {
                                              await api(
                                                "guardian-links/" + g.id,
                                                {
                                                  action: "DEACTIVATE",
                                                  verificationNote:
                                                    reason[g.id] || "",
                                                },
                                                "PATCH",
                                              );
                                              await refreshDetail();
                                              setNotice(
                                                "Vínculo inativado; registros preservados.",
                                              );
                                            })
                                          }
                                        >
                                          Inativar vínculo
                                        </button>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            ))
                          ) : (
                            <p className="registry-note">
                              Nenhum responsável com vínculo disponível neste
                              contexto.
                            </p>
                          )}
                          {detail.canManageGuardians && (
                            <form
                              className="registry-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void run(async () => {
                                  await api(
                                    "students/" +
                                      detail.id +
                                      "/guardian-invites",
                                    { email: guardianEmail },
                                  );
                                  setGuardianEmail("");
                                  await refreshDetail();
                                  setNotice(
                                    "Convite criado. O link de teste está no terminal da API. Após o aceite, confira o vínculo antes de verificar.",
                                  );
                                });
                              }}
                            >
                              <label>
                                E-mail do responsável
                                <input
                                  type="email"
                                  required
                                  value={guardianEmail}
                                  onChange={(e) =>
                                    setGuardianEmail(e.target.value)
                                  }
                                  placeholder="responsavel@exemplo.com.br"
                                />
                              </label>
                              <button className="button" disabled={busy}>
                                Convidar responsável
                              </button>
                              <p className="registry-note">
                                Aceitar o convite ainda exige a verificação do
                                vínculo por quem cadastrou a criança.
                              </p>
                            </form>
                          )}
                        </>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "links" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Solicitar associação</h3>
                    <p>
                      A outra organização precisa aceitar. O pedido pendente não
                      libera acesso ao cadastro completo.
                    </p>
                  </div>
                </div>
                {owned.length ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("links", {
                          studentId: linkStudent,
                          counterpartId: counterpart,
                        });
                        await load();
                        setNotice(
                          "Solicitação criada. Aguarde o aceite da outra organização.",
                        );
                      });
                    }}
                  >
                    <div className="registry-form-grid">
                      <label>
                        Aluno do seu cadastro
                        <select
                          required
                          value={linkStudent}
                          onChange={(e) => setLinkStudent(e.target.value)}
                        >
                          <option value="">Selecione o aluno</option>
                          {owned.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} · {s.id.slice(-8)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {context.role === "SCHOOL"
                          ? "Transporte destinatário"
                          : "Escola destinatária"}
                        <select
                          required
                          value={counterpart}
                          onChange={(e) => setCounterpart(e.target.value)}
                        >
                          <option value="">Selecione a organização</option>
                          {orgs
                            .filter(
                              (o) =>
                                o.kind ===
                                (context.role === "SCHOOL"
                                  ? "TRANSPORT"
                                  : "SCHOOL"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} · {o.id.slice(-8)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <button className="button" disabled={busy}>
                      Solicitar vínculo <ArrowRight size={16} />
                    </button>
                  </form>
                ) : (
                  <p className="registry-note">
                    Cadastre um aluno neste contexto para iniciar uma
                    solicitação. Pedidos recebidos aparecem abaixo.
                  </p>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Solicitações e vínculos</h3>
                    <p>
                      Ativos, pendentes, recusados e inativos permanecem
                      registrados.
                    </p>
                  </div>
                </div>
                {!links.length ? (
                  <p className="registry-note">
                    Nenhuma solicitação neste contexto.
                  </p>
                ) : (
                  links.map((l) => (
                    <article key={l.id} className="registry-link">
                      <div>
                        <span
                          className={"registry-badge " + l.status.toLowerCase()}
                        >
                          {statuses[l.status]}
                        </span>
                        <h3>{l.student_name}</h3>
                        <p>
                          {l.school_name} ↔ {l.transport_name}
                        </p>
                        <small>
                          {l.incoming
                            ? "Solicitação recebida"
                            : "Solicitação iniciada neste contexto"}
                        </small>
                      </div>
                      <div className="registry-link-actions">
                        {l.status === "PENDING" && l.incoming && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => actLink(l, "ACCEPT")}
                          >
                            Aceitar vínculo <Check size={16} />
                          </button>
                        )}
                        {["PENDING", "ACTIVE"].includes(l.status) && (
                          <>
                            <label>
                              Motivo para recusar ou inativar
                              <input
                                value={reason[l.id] || ""}
                                onChange={(e) =>
                                  setReason({
                                    ...reason,
                                    [l.id]: e.target.value,
                                  })
                                }
                                minLength={10}
                                placeholder="Descreva o motivo"
                              />
                            </label>
                            <div className="registry-inline-actions">
                              {l.status === "PENDING" && l.incoming && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => actLink(l, "REFUSE")}
                                >
                                  Recusar
                                </button>
                              )}
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => actLink(l, "DEACTIVATE")}
                              >
                                {l.status === "PENDING"
                                  ? "Cancelar solicitação"
                                  : "Inativar vínculo"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </section>
            </>
          )}
          {tab === "organizations" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      {context.role === "SCHOOL"
                        ? "Transportes relacionados"
                        : "Escolas relacionadas"}
                    </h3>
                    <p>
                      Relações derivadas das solicitações individuais de cada
                      aluno.
                    </p>
                  </div>
                  {context.role === "SCHOOL" ? (
                    <BusFront className="green-icon" />
                  ) : (
                    <GraduationCap className="green-icon" />
                  )}
                </div>
                {related.length ? (
                  related.map((o) => (
                    <div className="profile-context" key={o.id}>
                      <strong>{o.name}</strong>
                      <span>
                        {
                          links.filter(
                            (l) =>
                              (l.school_id === o.id ||
                                l.transport_id === o.id) &&
                              l.status === "ACTIVE",
                          ).length
                        }{" "}
                        vínculo(s) ativo(s) · código {o.id.slice(-8)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="registry-note">
                    As organizações aparecerão aqui quando houver uma
                    solicitação de vínculo.
                  </p>
                )}
              </section>
              <section className="panel">
                <h3>Cadastro da organização atual</h3>
                <form
                  className="registry-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api("organization", { name: rename }, "PATCH");
                      await onContextsChanged();
                      setNotice("Cadastro da organização atualizado.");
                    });
                  }}
                >
                  <label>
                    Nome da{" "}
                    {context.role === "SCHOOL"
                      ? "escola"
                      : "operação de transporte"}
                    <input
                      value={rename}
                      onChange={(e) => setRename(e.target.value)}
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Salvar organização
                  </button>
                </form>
                <details className="registry-more">
                  <summary>
                    Cadastrar outra{" "}
                    {context.role === "SCHOOL"
                      ? "escola"
                      : "operação de transporte"}
                  </summary>
                  <p>
                    Será criado um contexto independente para sua conta. Nenhum
                    aluno é transferido automaticamente.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("organizations", { name: orgName });
                        setOrgName("");
                        await load();
                        await onContextsChanged();
                        setNotice(
                          "Organização cadastrada. Escolha o novo contexto na Visão geral.",
                        );
                      });
                    }}
                  >
                    <label>
                      Nome da nova organização
                      <input
                        required
                        minLength={2}
                        maxLength={120}
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Criar novo contexto
                    </button>
                  </form>
                </details>
              </section>
            </>
          )}
          {tab === "vehicles" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      Veículos{" "}
                      {context.role === "DRIVER"
                        ? "do transporte"
                        : "dos transportes vinculados"}
                    </h3>
                    <p>Inativar preserva o cadastro e suas referências.</p>
                  </div>
                  <BusFront className="green-icon" />
                </div>
                {vehicles.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Veículo</th>
                          <th>Placa</th>
                          <th>Lugares</th>
                          <th>Situação</th>
                          {context.role === "DRIVER" && <th>Ação</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {vehicles.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <strong>{v.name}</strong>
                              <small className="registry-block">
                                {v.transport_name}
                              </small>
                            </td>
                            <td>{v.plate}</td>
                            <td>{v.capacity}</td>
                            <td>
                              <span
                                className={
                                  "registry-badge " +
                                  (v.active ? "active" : "inactive")
                                }
                              >
                                {v.active ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            {context.role === "DRIVER" && (
                              <td>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      await api(
                                        "vehicles/" + v.id,
                                        { active: !v.active },
                                        "PATCH",
                                      );
                                      await load();
                                    })
                                  }
                                >
                                  {v.active ? "Inativar" : "Reativar"}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="registry-note">
                    Nenhum veículo disponível neste contexto.
                  </p>
                )}
              </section>
              {context.role === "DRIVER" && (
                <section className="panel">
                  <h3>Cadastrar veículo</h3>
                  <form
                    className="registry-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("vehicles", {
                          name: vehicleName,
                          plate,
                          capacity: Number(capacity),
                        });
                        setVehicleName("");
                        setPlate("");
                        await load();
                        setNotice("Veículo cadastrado.");
                      });
                    }}
                  >
                    <div className="registry-form-grid">
                      <label>
                        Nome do veículo
                        <input
                          required
                          minLength={2}
                          value={vehicleName}
                          onChange={(e) => setVehicleName(e.target.value)}
                          placeholder="Van principal"
                        />
                      </label>
                      <label>
                        Placa
                        <input
                          required
                          value={plate}
                          onChange={(e) => setPlate(e.target.value)}
                          placeholder="ABC1D23"
                        />
                      </label>
                      <label>
                        Capacidade de passageiros
                        <input
                          type="number"
                          required
                          min={1}
                          max={60}
                          value={capacity}
                          onChange={(e) => setCapacity(e.target.value)}
                        />
                      </label>
                    </div>
                    <button className="button" disabled={busy}>
                      Salvar veículo
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
          {tab === "drivers" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      Motoristas{" "}
                      {context.role === "DRIVER"
                        ? "da operação"
                        : "dos transportes vinculados"}
                    </h3>
                    <p>
                      Contas individuais vinculadas à operação de transporte.
                    </p>
                  </div>
                  <UserRound className="green-icon" />
                </div>
                {drivers.length ? (
                  drivers.map((d) => (
                    <div className="profile-context" key={d.id}>
                      <strong>{d.name}</strong>
                      <span>{d.transport_name}</span>
                    </div>
                  ))
                ) : (
                  <p className="registry-note">
                    Nenhum motorista disponível neste contexto.
                  </p>
                )}
              </section>
              {context.role === "DRIVER" && (
                <section className="panel">
                  <h3>Convidar motorista</h3>
                  <form
                    className="registry-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("driver-invites", {
                          email: driverEmail,
                          verificationNote: driverNote,
                        });
                        setDriverEmail("");
                        setDriverNote("");
                        setNotice(
                          "Convite criado. O link de teste está no terminal da API.",
                        );
                      });
                    }}
                  >
                    <label>
                      E-mail do motorista
                      <input
                        type="email"
                        required
                        value={driverEmail}
                        onChange={(e) => setDriverEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Como o vínculo profissional foi conferido
                      <textarea
                        required
                        minLength={10}
                        maxLength={1000}
                        value={driverNote}
                        onChange={(e) => setDriverNote(e.target.value)}
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Criar convite de motorista
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
