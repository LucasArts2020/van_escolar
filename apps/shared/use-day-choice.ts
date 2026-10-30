import { useRef, useState } from "react";
import {
  dayChoices,
  initialDayChoice,
  suggestedUse,
  editableAgenda,
  type AgendaPlan,
} from "./day-choice";
export function useDayChoice(
  plans: AgendaPlan[],
  submit: (body: unknown) => Promise<{ awaitingAcceptance?: boolean }>,
  refresh: () => Promise<void>,
) {
  const [selection, setSelection] = useState(initialDayChoice(plans)),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const sending = useRef(false),
    uncertain = useRef(false);
  const chosen = dayChoices.find((c) => c.id === selection);
  const use = (p: AgendaPlan, c = chosen) =>
    p.direction === "OUTBOUND" ? !!c?.outbound : !!c?.returning;
  const disabledChoice = (c: (typeof dayChoices)[number]) =>
    (c.outbound && !plans.some((p) => p.direction === "OUTBOUND")) ||
    (c.returning && !plans.some((p) => p.direction === "RETURN")) ||
    plans.some((p) => !editableAgenda(p) && use(p, c) !== suggestedUse(p));
  const editable = plans.filter(editableAgenda);
  const changed = chosen
    ? editable.filter((p) => p.status !== (use(p) ? "CONFIRMED" : "NOT_USING"))
    : [];
  const late = changed.some((p) => p.late);
  const blocked = !editable.length
    ? plans.some((p) => p.locked_at)
      ? "Planejamento bloqueado pela operação."
      : plans.some((p) => p.request_id)
        ? "Há solicitação aguardando decisão do transporte."
        : plans[0].service_date < plans[0].today
          ? "Data passada: somente consulta."
          : "Confirme no dia anterior à viagem."
    : null;
  async function save() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (uncertain.current) {
        await refresh();
        uncertain.current = false;
        setNotice(
          "Situação consultada. Confira o registro antes de tentar novamente.",
        );
        return;
      }
      if (!chosen || disabledChoice(chosen) || blocked || !changed.length)
        return;
      const result = await submit({
        choices: editable.map((p) => ({
          id: p.id,
          use: use(p),
          expectedVersion: p.version,
        })),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      await refresh();
      setReason("");
      setNotice(
        result.awaitingAcceptance
          ? "Solicitação enviada. O uso vigente permanece até o aceite do transporte."
          : "Escolha de uso registrada para esta data.",
      );
    } catch (e) {
      setError((e as Error).message);
      uncertain.current = true;
      try {
        await refresh();
        uncertain.current = false;
      } catch {
        setError(
          "Não foi possível verificar o envio. Toque novamente para consultar antes de repetir.",
        );
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return {
    selection,
    setSelection,
    reason,
    setReason,
    busy,
    error,
    notice,
    late,
    blocked,
    disabledChoice,
    save,
    needsVerification: uncertain.current,
    canSave:
      uncertain.current ||
      (!!chosen &&
        !disabledChoice(chosen) &&
        !blocked &&
        changed.length > 0 &&
        (!late || reason.trim().length >= 10)),
    alreadyRecorded: !!chosen && !blocked && !changed.length,
  };
}
