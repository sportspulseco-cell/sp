import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { ResourcesHub } from "@/components/landing/resources";
import { SectionCta } from "@/components/landing/section-cta";
import { FooterTicker } from "@/components/landing/footer-ticker";

export const metadata: Metadata = {
  title: "Resources & Podcast — SportsPulse",
  description:
    "Decoding the Game — the SportsPulse podcast and the Knowledge Hub. Training, support, FAQ, updates, and blog from the team building the league infrastructure of the next decade."
};

export default function ResourcesPage() {
  return (
    <main className="relative">
      <Nav />
      <div className="h-14" />
      <ResourcesHub />
      <SectionCta />
      <FooterTicker />
    </main>
  );
}
