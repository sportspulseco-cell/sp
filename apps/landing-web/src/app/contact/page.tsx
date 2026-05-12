import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { ReachUs } from "@/components/landing/reach-us";
import { FooterTicker } from "@/components/landing/footer-ticker";

export const metadata: Metadata = {
  title: "Contact — SportsPulse",
  description:
    "Reach the SportsPulse engineering team. 464 Common Street, Belmont, MA · +1 669-309-7426 · info@sportspulse.us."
};

export default function ContactPage() {
  return (
    <main className="relative">
      <Nav />
      <div className="h-14" />
      <ReachUs />
      <FooterTicker />
    </main>
  );
}
