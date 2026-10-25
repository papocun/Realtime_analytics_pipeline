import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Realtime Music Analytics | Music Streaming Intelligence",
  description: "Music Streaming Intelligence platform providing listener engagement telemetry, geographic distribution, and streaming activity analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0f1115] text-white">
        {children}
      </body>
    </html>
  );
}
