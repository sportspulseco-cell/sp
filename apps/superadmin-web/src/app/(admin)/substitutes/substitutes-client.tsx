"use client";
import { RegionalSubStaffQueue } from "@sportspulse/admin-pages";
import { subs } from "@/lib/api/browser-api";
export function SubstitutesClient() { return <RegionalSubStaffQueue api={subs} />; }
