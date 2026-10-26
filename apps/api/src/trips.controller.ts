import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ActorRequest, AuthGuard, ContextGuard, parse, uuid } from "./auth";
import { TripsService } from "./trips.service";
const date = z.iso.date("Data inválida.");
const direction = z.enum(["OUTBOUND", "RETURN"]);
const reason = z
  .string()
  .trim()
  .min(10, "Descreva o motivo em pelo menos 10 caracteres.")
  .max(1000);
const version = { expectedVersion: z.number().int().min(1) };
@Controller("trips")
@UseGuards(AuthGuard, ContextGuard)
export class TripsController {
  constructor(@Inject(TripsService) private service: TripsService) {}
  @Post("preparation-key") preparationKey(@Req() req: ActorRequest) {
    this.service.driver(req);
    return { id: randomUUID() };
  }
  @Get("options") options(@Req() req: ActorRequest, @Query() query: unknown) {
    const q = parse(z.object({ date, direction }).strict(), query);
    return this.service.available(req, q.date, q.direction);
  }
  @Get() list(@Req() req: ActorRequest, @Query("date") value: unknown) {
    return this.service.list(req, parse(date, value));
  }
  @Get(":id") detail(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.service.detail(req, parse(uuid, id));
  }
  @Post() create(@Req() req: ActorRequest, @Body() body: unknown) {
    return this.service.create(
      req,
      parse(
        z
          .object({
            id: uuid,
            date,
            direction,
            driverId: uuid,
            vehicleId: uuid,
            exceptionReason: reason.optional(),
            planIds: z
              .array(uuid)
              .min(1)
              .max(60)
              .refine(
                (v) => new Set(v).size === v.length,
                "Não repita passageiros.",
              ),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post(":id/start") start(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.start(
      req,
      parse(uuid, id),
      parse(z.object(version).strict(), body).expectedVersion,
    );
  }
  @Post(":id/close") close(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.close(
      req,
      parse(uuid, id),
      parse(
        z
          .object({
            ...version,
            id: uuid,
            walkedInterior: z.literal(true),
            checkedSeats: z.literal(true),
            checkedHidingPlaces: z.literal(true),
            vanEmpty: z.boolean(),
            note: z.string().trim().max(1000).optional(),
          })
          .strict()
          .refine(
            (v) => v.vanEmpty || (v.note?.length ?? 0) >= 10,
            "Descreva o que foi encontrado em pelo menos 10 caracteres.",
          ),
        body,
      ),
    );
  }
  @Patch(":id/passengers/:passengerId") disposition(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Param("passengerId") passengerId: string,
    @Body() body: unknown,
  ) {
    return this.service.disposition(
      req,
      parse(uuid, id),
      parse(uuid, passengerId),
      parse(
        z
          .object({
            ...version,
            disposition: z.enum(["EXPECTED", "NOT_TRANSPORTED"]),
            reason,
          })
          .strict(),
        body,
      ),
    );
  }
  @Post(":id/passengers") add(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.add(
      req,
      parse(uuid, id),
      parse(z.object({ ...version, planId: uuid, reason }).strict(), body),
    );
  }
  @Patch(":id/assignment") substitute(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.substitute(
      req,
      parse(uuid, id),
      parse(
        z
          .object({ ...version, driverId: uuid, vehicleId: uuid, reason })
          .strict(),
        body,
      ),
    );
  }
  @Post(":id/cancel") cancel(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.cancel(
      req,
      parse(uuid, id),
      parse(z.object({ ...version, reason }).strict(), body),
    );
  }
}
