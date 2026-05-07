import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "smartmoni - smart-money tracker for Polymarket",
  description:
    "Track specialist positioning, public odds, and market volume on Polymarket.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-tone="obsidian" className={jetbrainsMono.variable}>
      <body>{children}</body>
    </html>
  );
}
