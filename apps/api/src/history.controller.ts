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
import { z } from "zod";
import { ActorRequest, AuthGuard, ContextGuard, parse, uuid } from "./auth";
import { HistoryService } from "./history.service";
const text = z
  .string()
  .trim()
  .min(20, "Descreva os fatos em pelo menos 20 caracteres.")
  .max(2000);
const expectedVersion = z.number().int().min(1);
@Controller("history")
@UseGuards(AuthGuard, ContextGuard)
export class HistoryController {
  constructor(@Inject(HistoryService) private service: HistoryService) {}
  @Get("options") options(@Req() req: ActorRequest) {
    return this.service.options(req);
  }
  @Get() list(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.service.list(
      req,
      parse(
        z
          .object({
            from: z.iso.date(),
            to: z.iso.date(),
            studentId: uuid.optional(),
            tripId: uuid.optional(),
            offset: z.coerce.number().int().min(0).max(100000).default(0),
          })
          .strict(),
        query,
      ),
    );
  }
  @Get(":id") detail(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.service.detail(req, parse(uuid, id));
  }
  @Post(":id/corrections") correction(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.requestCorrection(
      req,
      parse(uuid, id),
      parse(
        z
          .object({
            id: uuid,
            confirmationId: uuid,
            reason: text,
            account: text,
            expectedVersion,
          })
          .strict(),
        body,
      ),
    );
  }
  @Post(":id/corrections/:correctionId/decision") decision(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Param("correctionId") correctionId: string,
    @Body() body: unknown,
  ) {
    return this.service.decide(
      req,
      parse(uuid, id),
      parse(uuid, correctionId),
      parse(
        z
          .object({
            expectedVersion,
            decision: z.enum(["APPROVED", "REJECTED"]),
            reason: text,
            contacts: text,
            verification: text,
          })
          .strict(),
        body,
      ),
    );
  }
  @Post(":id/exceptional-resolution") exceptional(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.exceptional(
      req,
      parse(uuid, id),
      parse(
        z
          .object({
            id: uuid,
            expectedVersion,
            reason: text,
            contacts: text,
            verification: text,
            physicalCheck: z.literal(true),
            outcome: z.enum(["DELIVERED", "NOT_TRANSPORTED"]),
            recipientId: uuid.optional(),
          })
          .strict()
          .refine(
            (v) => v.outcome !== "DELIVERED" || Boolean(v.recipientId),
            "Selecione o recebedor autorizado.",
          ),
        body,
      ),
    );
  }
}
