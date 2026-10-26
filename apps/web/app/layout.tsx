import type { Metadata } from "next";
import "./globals.css";
import "./registry.css";
import "./planning.css";
import "./agenda.css";
import "./trips.css";
import "./movements.css";
import "./notifications.css";
import "./alerts.css";
import "./history.css";
import "./operation.css";
import "./school-central.css";
export const metadata: Metadata = {
  title: "Caminho · Transporte escolar",
  description: "Contas e permissões do transporte escolar.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
