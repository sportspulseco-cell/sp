import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { defer, firstValueFrom } from "rxjs";
import { NotificationDeliveryInterceptor } from "./notification-delivery.interceptor";
import { trackNotification } from "../application/notification-work";

test("post-commit delivery wakes only IDs from a successful request and never a failed command", async () => {
  const calls: string[][] = [];
  const interceptor = new NotificationDeliveryInterceptor({ deliverCommitted: async (ids: string[]) => { calls.push(ids); } } as never);
  const succeeded = interceptor.intercept({} as never, { handle: () => defer(async () => {
    trackNotification("committed"); await Promise.resolve(); return "saved";
  }) });
  assert.equal(await firstValueFrom(succeeded), "saved"); assert.deepEqual(calls, [["committed"]]);
  const failed = interceptor.intercept({} as never, { handle: () => defer(async () => {
    trackNotification("rolled-back"); throw new Error("command rolled back");
  }) });
  await assert.rejects(firstValueFrom(failed), /rolled back/); assert.deepEqual(calls, [["committed"]]);
});
