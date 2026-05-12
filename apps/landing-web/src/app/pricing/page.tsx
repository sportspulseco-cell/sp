import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { PricingTiers } from "@/components/landing/pricing-tiers";
import { SectionRevenue } from "@/components/landing/section-revenue";
import { SectionCta } from "@/components/landing/section-cta";
import { FooterTicker } from "@/components/landing/footer-ticker";

export const metadata: Metadata = {
  title: "Pricing — SportsPulse",
  description:
    "Three geometric pillars: Starter ($29), Pro ($59), Enterprise ($199). Monthly or yearly (-20%). The revenue engine that runs your league."
};

export default function PricingPage() {
  return (
    <main className="relative">
      <Nav />
      <div className="h-14" />
      <PricingTiers />
      <SectionRevenue />
      <SectionCta />
      <FooterTicker />
    </main>
  );
}
