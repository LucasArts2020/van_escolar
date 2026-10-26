"use client";
import { useState } from "react";
import { Passenger, Trip } from "../../shared/trips";
export default function AlertReport({
  trip,
  passenger,
  contextId,
}: {
  trip: Trip;
  passenger: Passenger;
  contextId: string;
}) {
  const [kind, setKind] = useState("NOT_LOCATED"),
    [movement, setMovement] = useState("ALIGHTING"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState("");
  return (
    <details className="alert-risk-report">
      <summary>
        Relatar criança não localizada ou recebimento contestado
      </summary>
      <p>
        O relato abre uma ocorrência crítica imediatamente e preserva os
        registros anteriores. Informe somente um fato observado.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const requestId = id || crypto.randomUUID();
          setId(requestId);
          try {
            const r = await fetch("/api/alerts/report", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "X-Context-Id": contextId,
              },
              body: JSON.stringify({
                id: requestId,
                tripId: trip.id,
                passengerId: passenger.id,
                movementKind: movement,
                kind,
                note,
              }),
            });
            const data = await r.json();
            if (!r.ok)
              throw new Error(data.message || "Não foi possível registrar.");
            setNotice(
              "Ocorrência crítica registrada. Consulte a central de Alertas e ocorrências.",
            );
            setId("");
            setNote("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Relato
          <select
            aria-label="Relato"
            disabled={busy}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setId("");
            }}
          >
            <option value="NOT_LOCATED">Criança não localizada</option>
            <option value="RECEIPT_DISPUTED">Recebimento contestado</option>
          </select>
        </label>
        <label>
          Movimentação
          <select
            aria-label="Movimentação"
            disabled={busy}
            value={movement}
            onChange={(e) => {
              setMovement(e.target.value);
              setId("");
            }}
          >
            <option value="BOARDING">Embarque</option>
            <option value="ALIGHTING">Desembarque</option>
          </select>
        </label>
        <label>
          Descreva o fato e as verificações
          <textarea
            disabled={busy}
            minLength={20}
            maxLength={2000}
            required
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setId("");
            }}
            rows={4}
          />
        </label>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="message success" role="status">
            {notice}
          </p>
        )}
        <button className="alert-button" disabled={busy}>
          Registrar relato crítico de {passenger.student_name}
        </button>
      </form>
    </details>
  );
}
