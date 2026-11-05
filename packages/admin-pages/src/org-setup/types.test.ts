import assert from "node:assert/strict";
import {test} from "node:test";
import {seasonDraftChecks,type SeasonDraft} from "./types";
const draft:SeasonDraft={name:"Spring 2027",startDate:"2027-01-02",endDate:"2027-04-30",registrationOpensAt:"2026-11-05",registrationClosesAt:"2027-01-01",playoffStartDate:"",playoffEndDate:"",rosterLockAt:""};
test("season dates can be completed before registration dates without making the whole draft valid",()=>{
 const checks=seasonDraftChecks({...draft,registrationOpensAt:"",registrationClosesAt:""},"2026-11-05");
 assert.equal(checks.season,true);assert.equal(checks.registration,false);assert.equal(Object.values(checks).every(Boolean),false);
});
test("optional dates cannot bypass validation when their panel is hidden",()=>{
 for(const patch of [{playoffStartDate:"2027-04-20"},{playoffEndDate:"2027-04-30"},{playoffStartDate:"2027-01-01",playoffEndDate:"2027-04-30"},{playoffStartDate:"2027-04-20",playoffEndDate:"2027-05-01"},{playoffStartDate:"2027-04-25",playoffEndDate:"2027-04-20"},{rosterLockAt:"2026-11-04"}]){
  assert.equal(seasonDraftChecks({...draft,...patch},"2026-11-05").options,false,JSON.stringify(patch));
 }
 assert.equal(seasonDraftChecks({...draft,playoffStartDate:draft.startDate,playoffEndDate:draft.endDate,rosterLockAt:"2026-11-05"},"2026-11-05").options,true);
});
test("registration and season ordering and local-day boundaries remain required",()=>{
 assert.deepEqual(seasonDraftChecks(draft,"2026-11-05"),{season:true,registration:true,options:true});
 assert.equal(seasonDraftChecks({...draft,registrationClosesAt:"2026-11-04"},"2026-11-05").registration,false);
 assert.equal(seasonDraftChecks({...draft,startDate:"2027-05-01"},"2026-11-05").season,false);
 assert.equal(seasonDraftChecks({...draft,name:" "},"2026-11-05").season,false);
 assert.equal(seasonDraftChecks(draft,"2026-11-06").registration,false);
});
