import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ActorRequest, AuthGuard, ContextGuard, parse, uuid } from "./auth";
import { AlertsService } from "./alerts.service";
const version = z.number().int().min(1),
  note = z
    .string()
    .trim()
    .min(20, "Descreva o fato e as verificações com pelo menos 20 caracteres.")
    .max(2000);
@Controller("alerts")
@UseGuards(AuthGuard, ContextGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class AlertsController {
  constructor(@Inject(AlertsService) private alerts: AlertsService) {}
  @Get() list(@Req() req: ActorRequest, @Query("closed") closed?: string) {
    return this.alerts.list(req, closed === "true");
  }
  @Get("options") options(@Req() req: ActorRequest) {
    return this.alerts.options(req);
  }
  @Post("policy") policy(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          expectedRevision: z.number().int().min(0),
          reminderMinutes: z.number().int().min(1).max(1440),
          attentionMinutes: z.number().int().min(2).max(2880),
          criticalMinutes: z.number().int().min(3).max(4320),
        })
        .strict()
        .refine(
          (v) =>
            v.reminderMinutes < v.attentionMinutes &&
            v.attentionMinutes < v.criticalMinutes,
          "Use intervalos crescentes.",
        ),
      body,
    );
    return this.alerts.policy(req, input);
  }
  @Post("report") report(@Req() req: ActorRequest, @Body() body: unknown) {
    return this.alerts.report(
      req,
      parse(
        z
          .object({
            id: uuid,
            tripId: uuid,
            passengerId: uuid,
            movementKind: z.enum(["BOARDING", "ALIGHTING"]),
            kind: z.enum(["NOT_LOCATED", "RECEIPT_DISPUTED"]),
            note,
          })
          .strict(),
        body,
      ),
    );
  }
  @Get(":id") detail(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.alerts.detail(req, parse(uuid, id));
  }
  @Post(":id/actions") action(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.alerts.action(
      req,
      parse(uuid, id),
      parse(
        z
          .object({
            expectedVersion: version,
            type: z.enum(["ASSUMED", "CONTACT", "VERIFICATION", "RESOLVED"]),
            note,
          })
          .strict(),
        body,
      ),
    );
  }
}
