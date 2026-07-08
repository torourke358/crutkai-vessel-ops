import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runa",
  description:
    "Inventory, equipment, maintenance, and yard period management for M/Y Anne-Marie.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Runa",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Extend the layout under the iPhone notch / Dynamic Island / home indicator.
  // Without this, iOS reports every env(safe-area-inset-*) as 0, so the
  // .safe-top header padding and the bottom safe-area padding collapse and the
  // app fails to size edge-to-edge (the iPhone 16 "dynamic sizing" bug).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50">{children}</body>
    </html>
  );
}
