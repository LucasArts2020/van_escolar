import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app";
import { configure } from "./bootstrap";
async function main() {
  const app = await NestFactory.create(AppModule);
  configure(app);
  await app.listen(Number(process.env.PORT || 3001), "0.0.0.0");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
