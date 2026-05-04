import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { SectionLogistics } from "@/components/landing/section-logistics";
import { SectionSubEngine } from "@/components/landing/section-sub-engine";
import { SectionRevenue } from "@/components/landing/section-revenue";
import { SectionFamily } from "@/components/landing/section-family";
import { SectionIntelligence } from "@/components/landing/section-intelligence";
import { SectionContact } from "@/components/landing/section-contact";
import { SectionCta } from "@/components/landing/section-cta";
import { FooterTicker } from "@/components/landing/footer-ticker";

export default function HomePage() {
  return (
    <main className="relative">
      <Nav />
      <Hero />
      <SectionLogistics />
      <SectionSubEngine />
      <SectionRevenue />
      <SectionFamily />
      <SectionIntelligence />
      <SectionContact />
      <SectionCta />
      <FooterTicker />
    </main>
  );
}
