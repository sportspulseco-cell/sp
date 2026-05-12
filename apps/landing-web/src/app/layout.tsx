import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Heartbeat } from "@/components/landing/heartbeat";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "SportsPulse — The pulse of every league.",
  description:
    "The unified league management engine. Autonomous logistics, automated substitutions, real-time revenue, and predictive intelligence for elite sports.",
  metadataBase: new URL("https://sp-landing.vercel.app"),
  openGraph: {
    title: "SportsPulse — The pulse of every league.",
    description:
      "The unified league management engine. Autonomous logistics, automated substitutions, real-time revenue, and predictive intelligence.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#050505"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} dark`}>
      <body className="bg-bg text-fg antialiased">
        {children}
        <Heartbeat />
      </body>
    </html>
  );
}
