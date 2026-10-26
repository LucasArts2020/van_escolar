import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Throttle } from "@nestjs/throttler";
import { ActorRequest, AuthGuard, ContextGuard, parse, uuid } from "./auth";
import { MovementsService } from "./movements.service";
@Controller("trips/:tripId/passengers/:passengerId/movements")
@UseGuards(AuthGuard, ContextGuard)
export class MovementsController {
  constructor(@Inject(MovementsService) private service: MovementsService) {}
  @Post(":kind/confirm")
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  confirm(
    @Req() req: ActorRequest,
    @Param("tripId") tripId: string,
    @Param("passengerId") passengerId: string,
    @Param("kind") kind: string,
    @Body() body: unknown,
  ) {
    parse(z.object({}).strict(), body);
    return this.service.confirm(
      req,
      parse(uuid, tripId),
      parse(uuid, passengerId),
      parse(z.enum(["BOARDING", "ALIGHTING"]), kind),
    );
  }
}
