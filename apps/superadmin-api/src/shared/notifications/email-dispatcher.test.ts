import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { EmailDispatcherService } from "./email-dispatcher.service";

test("email transport uses a stable provider key, tagged receipts and escaped user content", async () => {
  const original = globalThis.fetch, requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (_url, options) => { requests.push({ headers: new Headers(options?.headers), body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify({ id: "e6ef210e-e92a-433c-b8f6-09ff557d681a" }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  try {
    const dispatcher = new EmailDispatcherService(new ConfigService({ RESEND_API_KEY: "re_synthetic_test", EMAIL_FROM_ADDRESS: "test@sportspulse.us",
      NOTIFICATION_ENVIRONMENT: "staging", NOTIFICATION_EMAIL_ALLOWLIST: "qa@sportspulse.us" }));
    const message = { to: "qa@sportspulse.us", subject: "QA", body: "<script>alert('x')</script> & text", notificationId: "99c73408-dd4b-4baf-a39f-28df3ddaa0e5" };
    assert.equal((await dispatcher.send(message)).delivered, true); await dispatcher.send(message);
    assert.equal(requests[0]!.headers.get("Idempotency-Key"), `sportspulse/${message.notificationId}`);
    assert.equal(requests[1]!.headers.get("Idempotency-Key"), requests[0]!.headers.get("Idempotency-Key"));
    assert.deepEqual(requests[0]!.body.tags, [{ name: "sportspulse_notification_id", value: message.notificationId }, { name: "sportspulse_environment", value: "staging" }]);
    assert.match(String(requests[0]!.body.html), /&lt;script&gt;/); assert.equal(String(requests[0]!.body.html).includes("<script>"), false);
    assert.equal((await dispatcher.send({ ...message, to: "unapproved@example.invalid" })).failure, "suppressed");
    assert.equal(requests.length, 2, "Unapproved staging recipients never reach the provider");
  } finally { globalThis.fetch = original; }
});

test("email transport separates permanent refusals, rate limits, outages and missing acknowledgments", async () => {
  const original = globalThis.fetch;
  try {
    const dispatcher = new EmailDispatcherService(new ConfigService({ RESEND_API_KEY: "re_synthetic_test" }));
    for (const [status, expected] of [[422, "permanent"], [429, "transient"], [503, "transient"]] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ name: "validation_error", message: "QA refusal", statusCode: status }), { status });
      assert.equal((await dispatcher.send({ to: "nobody@example.invalid", subject: "QA", body: "QA" })).failure, expected);
    }
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    assert.equal((await dispatcher.send({ to: "nobody@example.invalid", subject: "QA", body: "QA" })).delivered, false);
  } finally { globalThis.fetch = original; }
});
