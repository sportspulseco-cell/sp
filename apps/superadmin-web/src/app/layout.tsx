import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Heartbeat, RouteProgress, ThemeProvider } from "@sportspulse/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "SportsPulse — Super Admin",
  description: "Platform administration for SportsPulse"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        {/* Light by default, as before; the shared top bar now offers
            the same theme toggle as the other consoles. */}
        <ThemeProvider storageKey="sp-superadmin-theme" defaultTheme="light">
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
          <Heartbeat />
        </ThemeProvider>
      </body>
    </html>
  );
}
