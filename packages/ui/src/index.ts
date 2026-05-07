// Auto-generated barrel — extend by hand if you add a new primitive.
export * from "./badge";
export * from "./button";
export * from "./dialog";
export * from "./empty-state";
export * from "./eyebrow";
export * from "./icon-tile";
export * from "./input";
export * from "./select";
export * from "./skeleton";
export * from "./table";
export * from "./phase-progress";
export * from "./stat-number";
export * from "./card";
// section-rail + command-palette stay in each app (they import
// next/link + next/navigation, which would couple this package to
// Next.js). If we ever need a framework-neutral version, factor here.
export { cn } from "./lib/cn";
