"use client";
import { CopySeasonButton } from "@sportspulse/admin-pages";
import type { Season } from "@sportspulse/api-client";
import { registrationV2 } from "@/lib/api/browser-api";
export function CopySeason({season,divisionCount}:{season:Season;divisionCount:number}) {
 return <CopySeasonButton season={season} divisionCount={divisionCount} copy={(id,body)=>registrationV2.duplicateSeason(id,body)}/>;
}
