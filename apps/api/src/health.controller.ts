import { Controller, Get, Inject } from "@nestjs/common";
import { Database } from "./db";
@Controller("health")
export class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get()
  async health() {
    await this.db.pool.query("SELECT 1");
    return { status: "ok", stage: 10 };
  }
}
