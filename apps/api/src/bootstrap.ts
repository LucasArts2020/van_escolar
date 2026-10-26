import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config";
export function configure(app: INestApplication) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Context-Id",
      "X-Client",
    ],
  });
  app.use(
    (
      req: { method: string; headers: Record<string, string> },
      res: { status: (s: number) => { json: (v: unknown) => void } },
      next: () => void,
    ) => {
      // CORS sozinho não bloqueia requisições que alteram estado.
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        ((req.headers.origin && req.headers.origin !== config.webOrigin) ||
          req.headers["sec-fetch-site"] === "cross-site")
      ) {
        return res.status(403).json({ message: "Origem não autorizada." });
      }
      next();
    },
  );
  app.enableShutdownHooks();
}
