import { useEffect, useRef, useState } from "react";
import type { HistoryDetail, HistoryOptions, HistoryPage } from "./history";
import type { JourneyTarget } from "./navigation";
export type HistoryClient = <T>(path: string, body?: unknown) => Promise<T>;
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|fetch failed|networkerror/i.test(
    message,
  )
    ? "Sem comunicação com o servidor. Não foi possível verificar o recebimento. Atualize o histórico antes de repetir."
    : message;
}
export function useHistory(
  client: HistoryClient,
  uuid: () => string,
  initialTarget?: JourneyTarget,
) {
  const api = useRef(client);
  api.current = client;
  const [options, setOptions] = useState<HistoryOptions | null>(null),
    [list, setList] = useState<HistoryPage>({
      items: [],
      hasMore: false,
      nextOffset: 0,
    }),
    [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [student, setStudent] = useState(""),
    [trip, setTrip] = useState(""),
    [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const active = useRef(true),
    sequence = useRef(0),
    keys = useRef(new Map<string, string>());
  useEffect(() => {
    active.current = true;
    api
      .current<HistoryOptions>("history/options")
      .then((o) => {
        if (!active.current) return;
        setOptions(o);
        setTo(initialTarget?.date || o.today);
        const start = new Date(o.today + "T12:00:00Z");
        start.setUTCDate(start.getUTCDate() - 7);
        setFrom(initialTarget?.date || start.toISOString().slice(0, 10));
        setStudent(initialTarget?.studentId || "");
        setTrip(initialTarget?.tripId || "");
      })
      .catch((e) => {
        if (active.current) {
          setError(failure(e));
          setLoading(false);
        }
      });
    return () => {
      active.current = false;
      sequence.current++;
    };
  }, []);
  async function search(page = 0, tripId = trip) {
    if (!from || !to) return;
    const serial = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        from,
        to,
        offset: String(page),
        ...(student ? { studentId: student } : {}),
        ...(tripId ? { tripId } : {}),
      });
      const result = await api.current<HistoryPage>("history?" + q);
      if (active.current && serial === sequence.current) {
        setList(result);
        setOffset(page);
        setDetail(null);
      }
    } catch (e) {
      if (active.current && serial === sequence.current) setError(failure(e));
    } finally {
      if (active.current && serial === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (from && to && options) {
      if (initialTarget?.passengerId) void open(initialTarget.passengerId);
      else void search();
    }
  }, [options]);
  async function open(id: string) {
    const serial = ++sequence.current;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const value = await api.current<HistoryDetail>("history/" + id);
      if (active.current && serial === sequence.current) setDetail(value);
    } catch (e) {
      if (active.current && serial === sequence.current) setError(failure(e));
    } finally {
      if (active.current && serial === sequence.current) setLoading(false);
    }
  }
  async function submit(
    path: string,
    body: Record<string, unknown>,
    message: string,
    withId = false,
  ) {
    if (busy || !detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    const key = path + JSON.stringify(body);
    let id = keys.current.get(key);
    if (!id) {
      id = uuid();
      keys.current.set(key, id);
    }
    try {
      await api.current(path, { ...body, ...(withId ? { id } : {}) });
      if (!active.current) return;
      const fresh = await api.current<HistoryDetail>(
        "history/" + detail.passenger.id,
      );
      if (active.current) {
        setDetail(fresh);
        setNotice(message);
      }
    } catch (e) {
      if (active.current) setError(failure(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return {
    options,
    list,
    detail,
    from,
    to,
    student,
    trip,
    offset,
    busy,
    error,
    notice,
    loading,
    setFrom,
    setTo,
    setStudent,
    setTrip,
    search,
    open,
    submit,
    back: () => {
      setDetail(null);
      setNotice("");
      void search(offset);
    },
  };
}
