import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rocket Analyzer",
  description: "Analiza tus repeticiones de Rocket League. Estadísticas reales, comparativas de jugadores y consejos para tu próxima partida.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
