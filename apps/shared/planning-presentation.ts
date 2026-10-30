/** Presentation only: persisted use and routine snapshots are never rewritten here. */
export function planningPresentation(p: {
  status: string;
  routine_revision: number | null;
  current_routine_revision?: number | null;
}) {
  return {
    status:
      p.status === "NOT_EXPECTED" && !p.routine_revision
        ? "MISSING_CONFIGURATION"
        : p.status === "PENDING"
          ? "AWAITING_RESPONSE"
          : p.status,
    snapshotMissingRoutine: !p.routine_revision,
    currentMissingRoutine: !p.current_routine_revision,
  };
}
export function planningLabel(p: {
  status: string;
  routine_revision: number | null;
}) {
  const status = planningPresentation(p).status;
  return (
    (
      {
        CONFIRMED: "Uso confirmado",
        AWAITING_RESPONSE: "Aguardando resposta da família",
        NOT_USING: "Não utilizará",
        NOT_EXPECTED: "Sem uso previsto na rotina",
        MISSING_CONFIGURATION: "Previsão criada sem rotina definida",
      } as Record<string, string>
    )[status] || status
  );
}
