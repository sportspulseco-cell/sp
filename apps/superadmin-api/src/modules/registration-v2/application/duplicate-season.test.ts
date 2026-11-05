import {test} from "node:test";
import assert from "node:assert/strict";
import {shiftCalendarDay,shiftSeasonInstant} from "./duplicate-season.service";
test("season copies shift calendar days and preserve rink-local time across daylight saving",()=>{
  assert.equal(shiftCalendarDay("2026-11-01",7),"2026-11-08");
  assert.equal(shiftSeasonInstant(new Date("2026-10-31T23:30:59Z"),7,"America/New_York")?.toISOString(),"2026-11-08T00:30:59.000Z");
  assert.throws(()=>shiftCalendarDay("2026-02-30",1),/real start date/);
  assert.throws(()=>shiftSeasonInstant(new Date("2026-03-07T07:30:00Z"),1,"America/New_York"),/daylight-saving/);
});
