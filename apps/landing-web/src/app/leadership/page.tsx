import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Leadership } from "@/components/landing/leadership";
import { SectionCta } from "@/components/landing/section-cta";
import { FooterTicker } from "@/components/landing/footer-ticker";

export const metadata: Metadata = {
  title: "Leadership — SportsPulse",
  description:
    "The Architects. A collective of athletes and pioneers based in Belmont, MA, engineering the competitive edge for the next generation of professional sports."
};

export default function LeadershipPage() {
  return (
    <main className="relative">
      <Nav />
      <div className="h-14" />
      <Leadership />
      <SectionCta />
      <FooterTicker />
    </main>
  );
}
