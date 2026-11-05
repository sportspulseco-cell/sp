import { test } from "node:test";
import assert from "node:assert/strict";
import { captainPoolView } from "./captain-pool-view";

test("captain recruiting response withholds contact, DOB and unreviewed free text regardless of offer state", () => {
  for (const status of [undefined, "pending", "accepted", "declined"]) {
    const row = { id: "entry", playerName: "Alex Rivera", positions: ["goalie"],
      playerEmail: "private@example.test", playerDob: "1990-01-01",
      metadata: { phone: "+15555550100" }, note: "Call my private number",
      availability:{Mon:["EVE"],privatePhone:"+15555550100"},futureContactField:"private@example.test",
      teamOffer: { status } };
    const result = captainPoolView(row);
    assert.equal(result.playerEmail, null);
    assert.equal(result.playerDob, null);
    assert.deepEqual(result.metadata, {});
    assert.deepEqual(result.availability,{Mon:true});
    assert.equal(Object.hasOwn(result,"futureContactField"),false);
    assert.equal(result.note, null);
    assert.equal(result.playerName, row.playerName);
    assert.deepEqual(result.positions, row.positions);
    assert.equal(row.playerEmail, "private@example.test");
  }
});
