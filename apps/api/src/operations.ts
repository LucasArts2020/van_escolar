import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { Database } from "./db";
import { NotificationWorker } from "./notification-worker";
import { ExpoPush } from "./expo-push";

@Injectable()
export class OperationsGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const expected = process.env.OPERATIONS_TOKEN || "";
    const supplied = ctx.switchToHttp().getRequest().headers[
      "x-operations-token"
    ];
    if (expected.length < 32)
      throw new ServiceUnavailableException(
        "Monitoramento protegido não configurado.",
      );
    const hash = (s: string) => createHash("sha256").update(s).digest();
    if (
      typeof supplied !== "string" ||
      supplied.length > 512 ||
      !timingSafeEqual(hash(supplied), hash(expected))
    )
      throw new UnauthorizedException("Credencial de manutenção inválida.");
    return true;
  }
}

@Injectable()
export class OperationsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(NotificationWorker) private worker: NotificationWorker,
    @Inject(ExpoPush) private push: ExpoPush,
  ) {}
  async snapshot() {
    const worker = this.worker;
    let database = false;
    let totals: Record<string, number | string | null> | null = null;
    try {
      totals = (
        await this.db.pool.query(`SELECT
        (SELECT count(*)::int FROM notifications WHERE dispatched_at IS NULL) AS outbox_pending,
        (SELECT min(created_at) FROM notifications WHERE dispatched_at IS NULL) AS oldest_outbox_at,
        (SELECT count(*)::int FROM notification_deliveries WHERE status IN ('QUEUED','RETRY')) AS send_pending,
        (SELECT count(*)::int FROM notification_deliveries WHERE status='FAILED') AS send_failed,
        (SELECT count(*)::int FROM notification_deliveries WHERE status='RECEIPT_UNKNOWN') AS receipt_unknown,
        (SELECT count(*)::int FROM notifications WHERE push_note='DISABLED') AS push_disabled,
        (SELECT count(*)::int FROM notifications WHERE push_note='NO_DEVICE') AS no_device,
        (SELECT count(*)::int FROM alert_cases WHERE status<>'RESOLVED' AND routing_status IN ('NO_CRITICAL_RECIPIENT','UNDEFINED_BOARDING')) AS alerts_without_recipient,
        (SELECT count(*)::int FROM alert_cases WHERE status<>'RESOLVED' AND next_due_at < now()-interval '1 minute') AS overdue_alerts`)
      ).rows[0];
      database = true;
    } catch {
      /* Não retorna erros SQL, credenciais ou dados individuais. */
    }
    let queue: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      paused: boolean;
    } | null = null;
    if (worker.queue && !worker.closing) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        queue = await Promise.race([
          (async () => {
            const [counts, paused] = await Promise.all([
              worker.queue!.getJobCounts(
                "waiting",
                "active",
                "delayed",
                "failed",
              ),
              worker.queue!.isPaused(),
            ]);
            return {
              waiting: counts.waiting,
              active: counts.active,
              delayed: counts.delayed,
              failed: counts.failed,
              paused,
            };
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), 2500);
          }),
        ]);
      } catch {
        /* Falha do Redis fica explícita, sem detalhes de conexão. */
      } finally {
        clearTimeout(timer);
      }
    }
    const fresh =
      !!worker.lastSuccessAt &&
      Date.now() - Date.parse(worker.lastSuccessAt) < 30000;
    const healthy =
      database &&
      !!queue &&
      !queue.paused &&
      fresh &&
      !worker.failureActive &&
      !worker.closing &&
      !!worker.worker?.isRunning();
    return {
      status: healthy ? "ok" : "degraded",
      scope:
        "Esta instância da API/worker e seu namespace de fila. Totais do banco são agregados da instalação.",
      stage: 10,
      checkedAt: new Date().toISOString(),
      database: database ? "ok" : "unavailable",
      processing: {
        status: healthy ? "ok" : "unavailable",
        lastSuccessAt: worker.lastSuccessAt,
        lastFailureAt: worker.lastFailureAt,
        failureActive: worker.failureActive,
        queue,
      },
      notifications: {
        pushEnabled: this.push.enabled(),
        totals,
        meaning:
          "Aceite do provedor não comprova leitura, recebimento presencial ou resolução. Contagens de falha incluem histórico; jobs falhos são os retidos na fila.",
      },
      release: {
        status: "NOT_RELEASED",
        reason:
          "Teste local. Exige decisões operacionais aprovadas, canais e aparelhos reais verificados, treinamento e restauração de backup testada.",
      },
    };
  }
}

@Controller("health/operations")
@UseGuards(OperationsGuard)
export class OperationsController {
  constructor(
    @Inject(OperationsService) private operations: OperationsService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async status() {
    return this.operations.snapshot();
  }
  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready() {
    const result = await this.operations.snapshot();
    if (result.status !== "ok")
      throw new ServiceUnavailableException({ status: "degraded", stage: 10 });
    return { status: "ok", stage: 10, release: "NOT_RELEASED" };
  }
}
