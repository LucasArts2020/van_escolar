type PlanningOptions = {
  links: { id: string; today: string }[];
};

/** Keep this cache inside one mounted screen/context, never across sessions. */
export function createPlanningMaterializer() {
  const requests = new Map<string, Promise<void>>();
  return (
    date: string,
    options: PlanningOptions,
    post: (body: { date: string; linkId?: string }) => Promise<unknown>,
  ) => {
    const key = JSON.stringify([
      date,
      options.links.map((link) => [link.id, link.today]).sort(),
    ]);
    const current = requests.get(key);
    if (current) return current;
    let incomplete = false;
    const request = materializePlanning(date, options, async (body) => {
      const result = await post(body);
      if ((result as { skipped?: string[] } | undefined)?.skipped?.length)
        incomplete = true;
      return result;
    })
      .then(() => {
        // A missing transport policy may be configured while this screen stays open.
        if (incomplete) requests.delete(key);
      })
      .catch((error) => {
        requests.delete(key);
        throw error;
      });
    requests.set(key, request);
    return request;
  };
}

/** Materialize snapshots only within each transport's server-provided date window. */
export async function materializePlanning(
  date: string,
  options: PlanningOptions,
  post: (body: { date: string; linkId?: string }) => Promise<unknown>,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const eligible = options.links.filter((link) => {
    const until = new Date(link.today + "T12:00:00Z");
    until.setUTCDate(until.getUTCDate() + 30);
    return date >= link.today && date <= until.toISOString().slice(0, 10);
  });
  if (!eligible.length) return;
  // The normal case needs one request, regardless of the number of children.
  if (eligible.length === options.links.length) {
    await post({ date });
    return;
  }
  // Different transport timezones can place the selected day outside some windows.
  for (const link of eligible) await post({ date, linkId: link.id });
}
