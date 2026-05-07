import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-aware class-name joiner. Used by every primitive in this
 * package and re-exported so app code can use it too without a local
 * copy.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
