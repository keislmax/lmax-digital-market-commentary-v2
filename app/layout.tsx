import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTCDESK — Bitcoin Market Intelligence",
  description: "Live Bitcoin derivatives, options, ETF flows and market sentiment dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
