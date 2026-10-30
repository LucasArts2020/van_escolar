import { useEffect, useRef, useState } from "react";
import type { DriverDay } from "./driver-day";
import type {
  MovementKind,
  MovementConfirmationResult,
  Trip,
  TripCloseInput,
} from "./trips";
import { mergeConfirmation } from "./driver-state";
import { confirmationSide } from "./movement-presentation";

export type DriverClient = <T>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
export type DriverRowState = {
  busy?: boolean;
  uncertain?: boolean;
  error?: string;
  notice?: string;
};
export function useDriverDay(client: DriverClient, active: boolean) {
  const api = useRef(client);
  api.current = client;
  const alive = useRef(true),
    dayRequest = useRef(0),
    tripRequest = useRef(0);
  const tripRef = useRef<Trip | null>(null),
    versions = useRef(new Map<string, number>()),
    sending = useRef(new Set<string>());
  const [day, setDay] = useState<DriverDay | null>(null),
    [date, setDate] = useState("");
  const [preparationDirection, setDirection] = useState<"OUTBOUND" | "RETURN">(
    "OUTBOUND",
  );
  const [pages, setPages] = useState({
    page: 0,
    openPage: 0,
    attentionPage: 0,
    preparationPage: 0,
  });
  const [selected, setSelected] = useState(""),
    [trip, setTrip] = useState<Trip | null>(null);
  const [rows, setRows] = useState<Record<string, DriverRowState>>({}),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [revoked, setRevoked] = useState(false);
  const revokedRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dateRef = useRef(date);
  dateRef.current = date;
  function install(value: Trip | null) {
    tripRef.current = value;
    setTrip(value);
  }
  function denied(e: unknown) {
    const status = (e as { status?: number }).status;
    return status === 401 || status === 403 || status === 404;
  }
  function clearAccess() {
    if (revokedRef.current) return;
    revokedRef.current = true;
    setDirection("OUTBOUND");
    setRevoked(true);
    dayRequest.current++;
    tripRequest.current++;
    dateRef.current = "";
    selectedRef.current = "";
    setDate("");
    setSelected("");
    setDay(null);
    install(null);
    setRows({});
    setPages({ page: 0, openPage: 0, attentionPage: 0, preparationPage: 0 });
    versions.current.clear();
    setLoading(false);
  }
  async function readTrip(id = selectedRef.current) {
    if (!id) return null;
    const request = ++tripRequest.current;
    try {
      const value = await api.current<Trip>(`trips/${id}`);
      if (
        !alive.current ||
        id !== selectedRef.current ||
        request !== tripRequest.current
      )
        return null;
      if (tripRef.current?.id === id && value.version < tripRef.current.version)
        return tripRef.current;
      for (const p of value.passengers)
        versions.current.set(p.id, value.version);
      install(value);
      return value;
    } catch (e) {
      if (
        alive.current &&
        id === selectedRef.current &&
        request === tripRequest.current &&
        denied(e)
      ) {
        setError((e as Error).message);
        clearAccess();
      }
      throw e;
    }
  }
  async function readDay() {
    const request = ++dayRequest.current,
      forDate = dateRef.current;
    const q = new URLSearchParams({
      preparationDirection,
      ...Object.fromEntries(
        Object.entries(pages).map(([k, v]) => [k, String(v)]),
      ),
      ...(forDate ? { date: forDate } : {}),
    });
    try {
      const value = await api.current<DriverDay>(`driver/day?${q}`);
      if (
        !alive.current ||
        request !== dayRequest.current ||
        dateRef.current !== forDate
      )
        return;
      revokedRef.current = false;
      setRevoked(false);
      setDay((old) => {
        const merge = (items: DriverDay["trips"]["items"]) =>
          items.map((card) => {
            const previous = [
              ...(old?.trips.items || []),
              ...(old?.openTrips.items || []),
            ].find((p) => p.id === card.id);
            return previous && previous.version > card.version
              ? previous
              : card;
          });
        return {
          ...value,
          trips: { ...value.trips, items: merge(value.trips.items) },
          openTrips: {
            ...value.openTrips,
            items: merge(value.openTrips.items),
          },
        };
      });
      if (!forDate) {
        dateRef.current = value.date;
        setDate(value.date);
      }
      setError("");
    } catch (e) {
      if (alive.current && request === dayRequest.current) {
        setError((e as Error).message);
        if (denied(e)) {
          clearAccess();
        }
      }
    } finally {
      if (alive.current && request === dayRequest.current) setLoading(false);
    }
  }
  async function refresh() {
    await Promise.all([
      readDay(),
      readTrip().catch((e) => {
        if (alive.current) setError(e.message);
      }),
    ]);
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      dayRequest.current++;
      tripRequest.current++;
    };
  }, []);
  useEffect(() => {
    if (!active || revoked) return;
    void refreshRef.current();
    const timer = setInterval(() => void refreshRef.current(), 15000);
    return () => clearInterval(timer);
  }, [active, date, pages, preparationDirection, revoked]);
  useEffect(() => {
    install(null);
    setRows({});
    versions.current.clear();
    tripRequest.current++;
    if (selected && active)
      void readTrip(selected).catch((e) => {
        if (alive.current) setError(e.message);
      });
  }, [selected]);
  function openTrip(id: string) {
    selectedRef.current = id;
    setSelected(id);
    setError("");
  }
  function changeDate(value: string) {
    dateRef.current = value;
    dayRequest.current++;
    tripRequest.current++;
    setDate(value);
    setPages({ page: 0, openPage: 0, attentionPage: 0, preparationPage: 0 });
    setDay(null);
    setLoading(true);
    openTrip("");
    install(null);
  }
  function updateRow(id: string, value: DriverRowState) {
    if (alive.current) setRows((old) => ({ ...old, [id]: value }));
  }
  async function verify(passengerId: string, kind: MovementKind) {
    const id = selectedRef.current;
    updateRow(passengerId, { busy: true, uncertain: true });
    try {
      const value = await readTrip(id);
      if (selectedRef.current !== id) return;
      if (!value) {
        updateRow(passengerId, {
          uncertain: true,
          error:
            "A consulta foi atualizada em paralelo. Verifique o estado antes de tentar novamente.",
        });
        return;
      }
      const m = value.passengers
        .find((p) => p.id === passengerId)
        ?.movements.find((m) => m.kind === kind);
      updateRow(
        passengerId,
        confirmationSide(m, "DRIVER")
          ? { notice: "Registro confirmado no servidor." }
          : {
              error:
                "Estado consultado. A confirmação não consta; você pode tentar novamente.",
            },
      );
    } catch (e) {
      if (selectedRef.current === id)
        updateRow(passengerId, {
          uncertain: true,
          error:
            "Não foi possível consultar. Verifique a conexão antes de tentar novamente.",
        });
    }
  }
  async function confirm(passengerId: string, kind: MovementKind) {
    const value = tripRef.current,
      key = `${selectedRef.current}:${passengerId}`;
    if (!value || sending.current.has(key) || busy) return;
    if (rows[passengerId]?.uncertain) return verify(passengerId, kind);
    const movement = value.passengers
      .find((p) => p.id === passengerId)
      ?.movements.find((m) => m.kind === kind);
    if (!movement?.canConfirm) return;
    sending.current.add(key);
    updateRow(passengerId, { busy: true });
    try {
      const response = await api.current<MovementConfirmationResult>(
        `trips/${value.id}/passengers/${passengerId}/movements/${kind}/confirm`,
        {},
      );
      if (
        !alive.current ||
        selectedRef.current !== value.id ||
        !tripRef.current
      )
        return;
      install(mergeConfirmation(tripRef.current, response, versions.current));
      setDay((old) =>
        old
          ? {
              ...old,
              trips: {
                ...old.trips,
                items: old.trips.items.map((c) =>
                  c.id === value.id && c.version <= response.tripVersion
                    ? {
                        ...c,
                        version: response.tripVersion,
                        status: response.tripSummary.status,
                        total: response.tripSummary.counts.total,
                        review: response.tripSummary.counts.review,
                      }
                    : c,
                ),
              },
            }
          : old,
      );
      updateRow(passengerId, {
        notice: response.unchanged
          ? "Este lado já estava confirmado."
          : "Sua confirmação foi registrada.",
      });
    } catch (e) {
      if (alive.current && selectedRef.current === value.id)
        await verify(passengerId, kind);
    } finally {
      sending.current.delete(key);
    }
  }
  async function start() {
    const t = tripRef.current;
    if (!t || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.current(`trips/${t.id}/start`, { expectedVersion: t.version });
      await refresh();
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        await readTrip().catch(() => {});
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function close(body: TripCloseInput) {
    const id = selectedRef.current;
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.current(`trips/${id}/close`, body);
      await refresh();
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        await readTrip().catch(() => {});
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return {
    preparationDirection,
    changePreparationDirection: (value: "OUTBOUND" | "RETURN") => {
      dayRequest.current++;
      setDay(null);
      setLoading(true);
      setDirection(value);
      setPages((p) => ({ ...p, preparationPage: 0 }));
    },
    revoked,
    day,
    date,
    changeDate,
    selected,
    openTrip,
    trip,
    rows,
    error,
    busy,
    loading,
    confirm,
    verify,
    refresh,
    readTrip,
    start,
    close,
    pages,
    setPages,
  };
}
