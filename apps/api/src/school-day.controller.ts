import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ActorRequest, AuthGuard, ContextGuard, parse } from "./auth";
import { SchoolDayService } from "./school-day.service";

@Controller("school")
@UseGuards(AuthGuard, ContextGuard)
export class SchoolDayController {
  constructor(@Inject(SchoolDayService) private service: SchoolDayService) {}

  @Get("day")
  day(@Req() req: ActorRequest, @Query("date") date: unknown) {
    return this.service.day(
      req,
      parse(z.iso.date("Data inválida.").optional(), date),
    );
  }
}
