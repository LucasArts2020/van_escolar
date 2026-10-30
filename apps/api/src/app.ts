import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Database } from "./db";
import { AuthGuard, ContextGuard } from "./auth";
import { AuthController } from "./auth.controller";
import { WorkspaceController } from "./workspace.controller";
import { Delivery } from "./delivery";
import { HealthController } from "./health.controller";
import { RegistryController } from "./registry.controller";
import { RegistryService } from "./registry.service";
import { PlanningController } from "./planning.controller";
import { PlanningService } from "./planning.service";
import { PlanningClock } from "./planning-clock";
import { TripsService } from "./trips.service";
import { TripsController } from "./trips.controller";
import { MovementsService } from "./movements.service";
import { MovementsController } from "./movements.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationWorker } from "./notification-worker";
import { ExpoPush } from "./expo-push";
import { AlertsService } from "./alerts.service";
import { AlertsController } from "./alerts.controller";
import { HistoryController } from "./history.controller";
import { HistoryService } from "./history.service";
import { SchoolDayController } from "./school-day.controller";
import { SchoolDayService } from "./school-day.service";
import { DriverDayController } from "./driver-day.controller";
import {
  OperationsController,
  OperationsGuard,
  OperationsService,
} from "./operations";
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: process.env.NODE_ENV === "test" ? 1000 : 30 },
    ]),
  ],
  controllers: [
    AuthController,
    WorkspaceController,
    HealthController,
    RegistryController,
    PlanningController,
    TripsController,
    MovementsController,
    NotificationsController,
    AlertsController,
    HistoryController,
    OperationsController,
    SchoolDayController,
    DriverDayController,
  ],
  providers: [
    Database,
    Delivery,
    RegistryService,
    PlanningService,
    PlanningClock,
    TripsService,
    MovementsService,
    NotificationsService,
    NotificationWorker,
    ExpoPush,
    AlertsService,
    HistoryService,
    OperationsGuard,
    OperationsService,
    SchoolDayService,
    AuthGuard,
    ContextGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
