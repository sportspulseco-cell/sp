import {test} from "node:test";
import assert from "node:assert/strict";
import {readOnce,withRequestReads} from "./request-read-cache";
test("parallel reads share one query only within the same request, actor and connection",async()=>{
 const db={};let queries=0;const query=async()=>++queries;
 await withRequestReads("GET",async()=>{
  assert.deepEqual(await Promise.all([readOnce(db,"actor-a",query),readOnce(db,"actor-a",query)]),[1,1]);
  assert.equal(await readOnce(db,"actor-b",query),2);
  assert.equal(await readOnce({},"actor-a",query),3);
 });
 assert.equal(await withRequestReads("GET",()=>readOnce(db,"actor-a",query)),4);
});
test("overlapping requests stay isolated and mutating requests never cache authorization",async()=>{
 const db={};let queries=0;const query=async()=>++queries;
 const result=await Promise.all([withRequestReads("GET",()=>readOnce(db,"same-actor",query)),withRequestReads("GET",()=>readOnce(db,"same-actor",query))]);
 assert.equal(new Set(result).size,2);
 await withRequestReads("POST",async()=>{await readOnce(db,"actor",query);await readOnce(db,"actor",query);});
 assert.equal(queries,4);
});
test("failed reads can be retried and work outside a request has no global cache",async()=>{
 const db={};let count=0;
 await withRequestReads("GET",async()=>{
  await assert.rejects(readOnce(db,"actor",async()=>{throw new Error("temporary");}),/temporary/);
  assert.equal(await readOnce(db,"actor",async()=>++count),1);
 });
 await readOnce(db,"actor",async()=>++count);await readOnce(db,"actor",async()=>++count);assert.equal(count,3);
});
