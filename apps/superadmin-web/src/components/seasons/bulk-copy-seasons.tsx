"use client";
import { useEffect,useState } from "react";
import { BulkCopySeasonsButton } from "@sportspulse/admin-pages";
import type { Season } from "@sportspulse/api-client";
import { registrationV2,iam } from "@/lib/api/browser-api";
export function BulkCopySeasons({seasons,leagueNames}:{seasons:Season[];leagueNames:Record<string,string>}) {
 const [actorId,setActorId]=useState("");useEffect(()=>{iam.me().then(p=>setActorId(p.id)).catch(()=>{});},[]);
 return <BulkCopySeasonsButton seasons={seasons} leagueNames={leagueNames} actorId={actorId} copy={(id,body)=>registrationV2.duplicateSeason(id,body)}/>;
}
