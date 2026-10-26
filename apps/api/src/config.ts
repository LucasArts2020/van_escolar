import "dotenv/config";
export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://caminho:caminho_local@localhost:5432/caminho",
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:3000",
  production: process.env.NODE_ENV === "production",
};
