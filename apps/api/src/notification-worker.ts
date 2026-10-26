import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { Database } from "./db";
import { ExpoPush, PushFailure } from "./expo-push";
import { currentNotification } from "./notification-events";
import { AlertsService } from "./alerts.service";

@Injectable()
export class NotificationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  queue?: Queue;
  worker?: Worker;
  timer?: ReturnType<typeof setInterval>;
  busy = false;
  closing = false;
  running?: Promise<void>;
  lastError = 0;
  lastFailureAt: string | null = null;
  lastSuccessAt: string | null = null;
  failureActive = false;
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ExpoPush) private push: ExpoPush,
    @Optional() @Inject(AlertsService) private alerts?: AlertsService,
  ) {}
  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.NOTIFICATIONS_WORKER === "false"
    )
      return;
    const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
    const connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      connectTimeout: 3000,
    };
    const prefix = process.env.NOTIFICATIONS_QUEUE_PREFIX || "caminho";
    this.queue = new Queue("notifications", {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix,
    });
    this.worker = new Worker(
      "notifications",
      async (job) => {
        if (job.name === "alert-recheck")
          await this.alerts?.evaluate(job.data.caseId);
        else await this.process(job.data.deliveryId, job.name === "receipt");
      },
      {
        connection: { ...connection, maxRetriesPerRequest: null },
        prefix,
        concurrency: 2,
      },
    );
    this.queue.on("error", (e) => this.report(e));
    this.worker.on("error", (e) => this.report(e));
    this.worker.on("failed", (_job, e) => this.report(e));
    this.timer = setInterval(() => void this.tick(), 3000);
    this.timer.unref();
    void this.tick();
  }
  report(error: Error) {
    this.lastFailureAt = new Date().toISOString();
    this.failureActive = true;
    if (Date.now() - this.lastError > 60000) {
      this.lastError = Date.now();
      console.error(
        "Notificações: tentativa adiada ou processamento indisponível; registros preservados no PostgreSQL:",
        error.message,
      );
    }
  }
  async dispatch() {
    // Materialização idempotente por notificação/dispositivo, inclusive após reinício do processo.
    return this.db.transaction(async (db) => {
      const rows = (
        await db.query(
          "SELECT id FROM notifications WHERE dispatched_at IS NULL ORDER BY created_at,CASE WHEN purpose='ACTION' THEN 0 ELSE 1 END,id LIMIT 50 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const { id } of rows) {
        const n = await currentNotification(db, id);
        let note = "NO_DEVICE";
        if (
          !n?.authorized ||
          !n.deliverable ||
          (n.purpose === "ACTION" && !n.pending)
        )
          note = "SUPPRESSED";
        else if (!this.push.enabled()) note = "DISABLED";
        else {
          const devices = (
            await db.query(
              `SELECT d.* FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash
            AND s.user_id=d.user_id AND s.expires_at>now() WHERE d.user_id=$1 AND d.active AND d.registered_at<=$2`,
              [n.user_id, n.created_at],
            )
          ).rows;
          let created = 0;
          for (const device of devices) {
            const inserted = await db.query(
              `INSERT INTO notification_deliveries(id,notification_id,device_id,device_registered_at,event_id)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id,device_id) DO NOTHING RETURNING id`,
              [randomUUID(), id, device.id, device.registered_at, n.event_id],
            );
            created += inserted.rows.length;
          }
          note = created
            ? "QUEUED"
            : devices.length
              ? "OTHER_CONTEXT"
              : "NO_DEVICE";
        }
        await db.query(
          "UPDATE notifications SET dispatched_at=now(),push_note=$2 WHERE id=$1",
          [id, note],
        );
      }
      return rows.length;
    });
  }
  tick(): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.alerts?.sweep();
      await this.dispatch();
      if (!this.queue) return;
      for (const a of (await this.alerts?.scheduled()) || []) {
        if (this.closing) break;
        const jobId = a.id + "-alert-" + (a.level + 1);
        if (!(await this.queue.getJob(jobId)))
          await this.queue.add(
            "alert-recheck",
            { caseId: a.id },
            {
              jobId,
              delay: Math.max(
                0,
                new Date(a.next_due_at).getTime() - Date.now(),
              ),
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: 1000,
              removeOnFail: 1000,
            },
          );
      }
      const due = (
        await this.db.pool.query(`SELECT id,status FROM notification_deliveries
        WHERE status IN ('QUEUED','RETRY','ACCEPTED') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 100`)
      ).rows;
      for (const d of due) {
        if (this.closing) break;
        const receipt = d.status === "ACCEPTED",
          jobId = d.id + (receipt ? "-receipt" : "-send");
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state !== "completed" && state !== "failed") continue;
          await existing.remove();
        }
        await this.queue.add(
          receipt ? "receipt" : "send",
          { deliveryId: d.id },
          {
            jobId,
            attempts: receipt ? 4 : 3,
            backoff: { type: "exponential", delay: receipt ? 900000 : 5000 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        );
      }
      this.lastSuccessAt = new Date().toISOString();
      this.failureActive = false;
    } catch (e) {
      this.report(e as Error);
    } finally {
      this.busy = false;
    }
  }
  async process(id: string, receipt = false) {
    // O lock impede dois workers de enviar a mesma entrega simultaneamente.
    // O provedor externo não oferece exatamente-uma-vez: perda da resposta ainda pode exigir reenvio.
    const retry = await this.db.transaction(async (db) => {
      const d = (
        await db.query(
          "SELECT * FROM notification_deliveries WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !d ||
        (receipt
          ? d.status !== "ACCEPTED"
          : !["QUEUED", "RETRY"].includes(d.status))
      )
        return false;
      if (new Date(d.next_attempt_at).getTime() > Date.now()) return true;
      const n = await currentNotification(db, d.notification_id);
      const device = (
        await db.query(
          `SELECT d.* FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash
        AND s.user_id=d.user_id AND s.expires_at>now() WHERE d.id=$1`,
          [d.device_id],
        )
      ).rows[0];
      if (
        !n?.authorized ||
        (!receipt && !n.deliverable) ||
        !device?.active ||
        device.user_id !== n.user_id ||
        new Date(device.registered_at).getTime() !==
          new Date(d.device_registered_at).getTime() ||
        (!receipt && n.purpose === "ACTION" && !n.pending) ||
        !this.push.enabled()
      ) {
        await db.query(
          "UPDATE notification_deliveries SET status='SUPPRESSED',finished_at=now(),error_code='NO_LONGER_ELIGIBLE' WHERE id=$1",
          [id],
        );
        return false;
      }
      const attempt = (receipt ? d.receipt_attempts : d.attempts) + 1,
        max = receipt ? 4 : 3,
        phase = receipt ? "RECEIPT" : "SEND";
      if (attempt > max) {
        await db.query(
          "UPDATE notification_deliveries SET status=$2,finished_at=now(),error_code='ATTEMPTS_EXHAUSTED' WHERE id=$1",
          [id, receipt ? "RECEIPT_UNKNOWN" : "FAILED"],
        );
        return false;
      }
      let status: string,
        code: string | null = null,
        ticket = d.ticket_id,
        shouldRetry = false;
      try {
        if (receipt) {
          const result = await this.push.receipt(ticket);
          if (!result) throw new PushFailure("RECEIPT_NOT_AVAILABLE");
          status = "PROVIDER_ACCEPTED";
        } else {
          ticket = await this.push.send(device.token, n.id, n.membership_id);
          status = "ACCEPTED";
        }
      } catch (error) {
        const e =
          error instanceof PushFailure
            ? error
            : new PushFailure("UNEXPECTED_TRANSPORT_ERROR");
        code = e.code.slice(0, 100);
        shouldRetry = e.retryable && attempt < max;
        status = shouldRetry
          ? receipt
            ? "ACCEPTED"
            : "RETRY"
          : receipt && e.retryable
            ? "RECEIPT_UNKNOWN"
            : "FAILED";
        if (code === "DeviceNotRegistered")
          await db.query("UPDATE push_devices SET active=false WHERE id=$1", [
            device.id,
          ]);
      }
      const delay = receipt
        ? 900000 * Math.pow(2, attempt - 1)
        : 5000 * Math.pow(2, attempt - 1);
      const next = new Date(
        Date.now() + (status === "ACCEPTED" && !receipt ? 900000 : delay),
      );
      await db.query(
        `UPDATE notification_deliveries SET status=$2,error_code=$3,ticket_id=$4,
        attempts=attempts+$5,receipt_attempts=receipt_attempts+$6,next_attempt_at=$7,
        accepted_at=CASE WHEN $8 THEN now() ELSE accepted_at END,
        finished_at=CASE WHEN $9 THEN now() ELSE finished_at END WHERE id=$1`,
        [
          id,
          status,
          code,
          ticket,
          receipt ? 0 : 1,
          receipt ? 1 : 0,
          next,
          !receipt && status === "ACCEPTED",
          ["FAILED", "PROVIDER_ACCEPTED", "RECEIPT_UNKNOWN"].includes(status),
        ],
      );
      await db.query(
        `INSERT INTO notification_attempts(id,delivery_id,phase,attempt,status,error_code)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          id,
          phase,
          attempt,
          code ? (shouldRetry ? "WAITING" : "FAILED") : status,
          code,
        ],
      );
      return shouldRetry;
    });
    if (retry) throw new Error("Tentativa adiada; estado durável preservado.");
  }
  async onModuleDestroy() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.worker?.close();
    await this.queue?.close();
  }
}
