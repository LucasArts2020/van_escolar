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
import { NotificationsService } from "./notifications.service";
@Controller("notifications")
@UseGuards(AuthGuard, ContextGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private notifications: NotificationsService,
  ) {}
  @Get() list(@Req() req: ActorRequest, @Query("before") before?: string) {
    const value = before
      ? parse(z.iso.datetime({ offset: true }), before)
      : undefined;
    return this.notifications.list(req, value);
  }
  @Get("home") home(@Req() req: ActorRequest, @Query("page") page?: string) {
    return this.notifications.home(
      req,
      parse(z.coerce.number().int().min(0).max(10000).default(0), page),
    );
  }
  @Get("children/:passengerId") journey(
    @Req() req: ActorRequest,
    @Param("passengerId") id: string,
  ) {
    return this.notifications.journey(req, parse(uuid, id));
  }
  @Post("devices") register(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          installationId: uuid,
          token: z
            .string()
            .max(250)
            .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
        })
        .strict(),
      body,
    );
    return this.notifications.registerDevice(req, input);
  }
  @Post("devices/remove") remove(
    @Req() req: ActorRequest,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ installationId: uuid }).strict(), body);
    return this.notifications.removeDevice(req, input.installationId);
  }
  @Get(":id") detail(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.notifications.detail(req, parse(uuid, id));
  }
  @Post(":id/read") read(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({}).strict(), body);
    return this.notifications.read(req, parse(uuid, id));
  }
}
