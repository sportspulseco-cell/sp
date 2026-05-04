import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Section({
  id,
  children,
  className
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative w-full border-b border-border",
        className
      )}
    >
      <div className="mx-auto max-w-container px-6 py-24 md:py-32 lg:px-10">
        {children}
      </div>
    </section>
  );
}
