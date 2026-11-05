export interface OfficialUnavailablePeriod { startTsUtc:string;endTsUtc:string }
export function officialUnavailableAt(metadata:unknown,start:Date,durationMin:number):boolean {
  const data=metadata as {officialAvailability?:{periods?:unknown}} | null;
  const periods=data?.officialAvailability?.periods;
  if(!Array.isArray(periods))return false;
  const end=start.getTime()+durationMin*60000;
  return periods.some(p=>typeof p?.startTsUtc==="string" && typeof p?.endTsUtc==="string" &&
    Date.parse(p.startTsUtc)<end && Date.parse(p.endTsUtc)>start.getTime());
}
