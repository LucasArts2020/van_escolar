import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "./db";
async function main() {
  const db = new Database();
  try {
    await db.pool.query(readFileSync(join(__dirname, "schema.sql"), "utf8"));
    console.log(
      "Estrutura das Partes 1 a 9 atualizada, preservando os dados existentes.",
    );
  } finally {
    await db.onApplicationShutdown();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
