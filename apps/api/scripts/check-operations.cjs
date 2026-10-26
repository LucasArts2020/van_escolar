require("dotenv/config");
async function main() {
  const token = process.env.OPERATIONS_TOKEN;
  if (!token || token.length < 32)
    throw new Error(
      "Configure OPERATIONS_TOKEN com pelo menos 32 caracteres no backend e neste terminal. Não coloque a credencial no web/mobile.",
    );
  const base = new URL(
    process.env.OPERATIONS_API_URL || "http://127.0.0.1:3001",
  );
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new Error("Use HTTPS para monitoramento remoto.");
  const response = await fetch(new URL("/health/operations", base), {
    headers: { "X-Operations-Token": token },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Diagnóstico indisponível. HTTP " + response.status);
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  const t = result.notifications.totals;
  const attention =
    !result.notifications.pushEnabled ||
    !t ||
    t.send_failed > 0 ||
    t.receipt_unknown > 0 ||
    t.alerts_without_recipient > 0 ||
    t.overdue_alerts > 0 ||
    t.no_device > 0 ||
    result.processing.queue?.failed > 0;
  if (result.status !== "ok") process.exitCode = 1;
  else if (attention) process.exitCode = 2;
  console.log(
    "Uso real não liberado. Diagnóstico técnico não aprova decisões ou confirma entrega de uma criança.",
  );
}
main().catch(() => {
  console.error(
    "Não foi possível consultar o diagnóstico protegido. Confira API, HTTPS e OPERATIONS_TOKEN (mínimo 32 caracteres). Nenhuma credencial foi exibida.",
  );
  process.exitCode = 1;
});
