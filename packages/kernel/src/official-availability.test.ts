import {test} from "node:test";
import assert from "node:assert/strict";
import {officialUnavailableAt} from "./official-availability";
test("official availability excludes overlap but permits adjacent assignments",()=>{
 const metadata={officialAvailability:{periods:[{startTsUtc:"2026-11-10T20:00:00Z",endTsUtc:"2026-11-10T21:00:00Z"}]}};
 assert.equal(officialUnavailableAt(metadata,new Date("2026-11-10T20:30:00Z"),60),true);
 assert.equal(officialUnavailableAt(metadata,new Date("2026-11-10T21:00:00Z"),60),false);
 assert.equal(officialUnavailableAt(metadata,new Date("2026-11-10T19:00:00Z"),60),false);
 assert.equal(officialUnavailableAt({officialAvailability:{periods:"bad"}},new Date(),60),false);
});
