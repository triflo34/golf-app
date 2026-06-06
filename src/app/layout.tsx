import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { BottomNav } from "@/components/nav";
import { V2BottomNav } from "@/components/v2/bottom-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { getUiMode } from "@/lib/ui-mode";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// v2 design system fonts — Fraunces (serif display, used for all numbers and
// titles in the "scorecard / trophy" v2 mode) and Outfit (workhorse sans for
// body / chips / labels). Loaded as CSS variables so they only render where
// v2 components opt in.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Match",
  description:
    "Track scores, compete head-to-head, and dominate the summer leaderboard.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Match",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#15803d",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const uiMode = await getUiMode();
  return (
    <html
      lang="en"
      data-ui={uiMode}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <main className="flex-1 pb-nav pt-safe">{children}</main>
          <OfflineBanner />
          {uiMode === "v2" ? <V2BottomNav /> : <BottomNav />}
        </AuthProvider>
      </body>
    </html>
  );
}
