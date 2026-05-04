import { CheckCircle2 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { SelfHealingCalendar } from "./self-healing-calendar";

const BULLETS = [
  "Venue double-booking prevention",
  "Referee availability cross-check",
  "Weather-aware rescheduling"
];

export function SectionLogistics() {
  return (
    <Section id="logistics">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>// 01 · Autonomous Logistics</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
              We solve the season puzzle.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Our AI engine detects scheduling conflicts the moment they form
              and resolves them automatically — before anyone notices.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <ul className="mt-7 space-y-2.5">
              {BULLETS.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 text-[14px] text-fg"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-cyan"
                    strokeWidth={2}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={0.08}>
            <SelfHealingCalendar />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
