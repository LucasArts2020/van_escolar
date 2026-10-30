export type AgendaPlan = {
  id: string;
  operating_link_id: string;
  student_name: string;
  student_id: string;
  school_name: string;
  transport_name: string;
  direction: string;
  service_date: string;
  status: string;
  scheduled: boolean;
  routine_revision: number | null;
  today: string;
  late: boolean;
  locked_at: string | null;
  version: number;
  request_id: string | null;
  requested_usage: boolean;
  request_reason: string;
  can_withdraw: boolean;
  last_change?: { status: string; decisionNote: string | null } | null;
};
export const dayChoices = [
  { id: "both", label: "Ida e volta", outbound: true, returning: true },
  { id: "outbound", label: "Só ida", outbound: true, returning: false },
  { id: "return", label: "Só volta", outbound: false, returning: true },
  { id: "none", label: "Não utilizará", outbound: false, returning: false },
] as const;
export function groupAgenda(plans: AgendaPlan[]) {
  const groups = new Map<string, AgendaPlan[]>();
  for (const p of plans) {
    const key = p.operating_link_id + "|" + p.service_date;
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  return [...groups.entries()].map(([key, plans]) => ({ key, plans }));
}
export const suggestedUse = (p: AgendaPlan) =>
  p.status === "CONFIRMED" ||
  (!["NOT_USING", "NOT_EXPECTED"].includes(p.status) && p.scheduled);
export function initialDayChoice(plans: AgendaPlan[]) {
  if (
    !plans.some((p) => suggestedUse(p)) &&
    !plans.every((p) => p.status === "NOT_USING")
  )
    return "";
  return (
    dayChoices.find((c) =>
      plans.every(
        (p) =>
          (p.direction === "OUTBOUND" ? c.outbound : c.returning) ===
          suggestedUse(p),
      ),
    )?.id || ""
  );
}
export function editableAgenda(p: AgendaPlan) {
  const tomorrow = new Date(p.today + "T12:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return (
    !p.locked_at &&
    !p.request_id &&
    p.service_date >= p.today &&
    p.service_date <= tomorrow.toISOString().slice(0, 10)
  );
}

export const agendaChangeLabels: Record<string, string> = {
  ACCEPTED: "Aceita pelo transporte",
  REFUSED: "Recusada pelo transporte",
  WITHDRAWN: "Retirada pelo responsável",
};
