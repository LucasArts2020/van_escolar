import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { config } from "./config";
@Injectable()
export class Database implements OnApplicationShutdown {
  pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  constructor() {
    this.pool.on("error", (error) =>
      console.error(
        "Conexão ociosa do PostgreSQL interrompida:",
        error.message,
      ),
    );
  }
  async transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
export async function audit(
  db: Pick<PoolClient, "query">,
  actor: string,
  action: string,
  target: string,
  membership?: { id?: string; organization_id: string },
  details = {},
) {
  await db.query(
    "INSERT INTO audit_events(id,actor_id,membership_id,organization_id,action,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      actor,
      membership?.id || null,
      membership?.organization_id || null,
      action,
      target,
      JSON.stringify(details),
    ],
  );
}
