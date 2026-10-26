const { spawnSync } = require("node:child_process");
if (!process.env.QA_DATABASE_URL) {
  console.error(
    "Informe QA_DATABASE_URL de uma base local de teste. O teste cria e remove somente seu schema qa_part10_* e prefixo Redis próprio.",
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      "--v8-pool-size=1",
      "--wasm-num-compilation-tasks=1",
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "test/integration.test.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CAMINHO_INTEGRATION: "postgres",
        NODE_ENV: "test",
        EXPO_PUSH_ENABLED: "false",
      },
    },
  );
  process.exitCode = result.status ?? 1;
}
