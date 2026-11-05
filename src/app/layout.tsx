import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rocket Analyzer",
  description: "Datos de tus repeticiones de Rocket League: jugadores, posiciones, mapas de calor y estadísticas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
