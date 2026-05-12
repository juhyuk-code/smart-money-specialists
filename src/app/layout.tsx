import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pref",
  description:
    "Track current holder positioning, public odds, and market volume on Polymarket.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-tone="obsidian">
      <body>{children}</body>
    </html>
  );
}
