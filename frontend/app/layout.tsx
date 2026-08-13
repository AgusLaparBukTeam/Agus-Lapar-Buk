import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "GateGuard — Shipment assurance workspace",
    template: "%s | GateGuard",
  },
  description: "A controlled workspace for reconciling shipment documents, resolving exceptions, and recording evidence-backed release decisions.",
  applicationName: "GateGuard",
  category: "Business operations",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    title: "GateGuard — Shipment assurance workspace",
    description: "Evidence-backed shipment document reconciliation and release decisions.",
    type: "website",
    siteName: "GateGuard",
  },
  twitter: {
    card: "summary",
    title: "GateGuard — Shipment assurance workspace",
    description: "Evidence-backed shipment document reconciliation and release decisions.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
