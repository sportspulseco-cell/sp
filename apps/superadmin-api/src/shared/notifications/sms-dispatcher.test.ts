import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ConfigService } from "@nestjs/config";
import { SMS_NOT_SET_UP, SmsDispatcherService, twilioMessageForm } from "./sms-dispatcher.service";

/**
 * FR-3.10.2: the SMS adapter against a fake provider. No real Twilio
 * account exists; the fake answers the way the Messages API documents
 * (201 + sid on accept, 4xx JSON {code, message} on refusal).
 */

type Seen = { method: string; url: string; auth: string; contentType: string; form: URLSearchParams };

function fakeTwilio(reply: (form: URLSearchParams) => { status: number; body: unknown }): Promise<{
  server: Server;
  base: string;
  seen: Seen[];
}> {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const form = new URLSearchParams(raw);
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers.authorization ?? "",
        contentType: req.headers["content-type"] ?? "",
        form
      });
      const r = reply(form);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.body));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}`, seen });
    })
  );
}

function config(env: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}

const SID = "AC00000000000000000000000000000000";

test("SMS: not configured sends nothing and says so", async () => {
  const sms = new SmsDispatcherService(config({}));
  assert.equal(sms.isConfigured(), false);
  const r = await sms.send({ to: "+14155552671", body: "hi" });
  assert.deepEqual(r, { delivered: false, providerMessageId: null, reason: SMS_NOT_SET_UP, failure: "not_configured" });
  // Credentials without a sender are not configured either.
  assert.equal(new SmsDispatcherService(config({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "t" })).isConfigured(), false);
});

test("SMS: request matches the Twilio Messages API create call", async () => {
  const fake = await fakeTwilio(() => ({ status: 201, body: { sid: "SM123", status: "queued" } }));
  try {
    const sms = new SmsDispatcherService(
      config({
        TWILIO_ACCOUNT_SID: SID,
        TWILIO_AUTH_TOKEN: "secret-token",
        TWILIO_FROM_NUMBER: "+15005550006",
        TWILIO_API_BASE_URL: fake.base
      })
    );
    const r = await sms.send({ to: "+14155552671", body: "Game moved: 7:30 PM & Rink 2", channel: "game.rescheduled" });
    assert.deepEqual(r, { delivered: true, providerMessageId: "SM123", statusCode: 201 });
    assert.equal(fake.seen.length, 1);
    const s = fake.seen[0]!;
    assert.equal(s.method, "POST");
    assert.equal(s.url, `/2010-04-01/Accounts/${SID}/Messages.json`);
    assert.equal(s.auth, `Basic ${Buffer.from(`${SID}:secret-token`).toString("base64")}`);
    assert.equal(s.contentType, "application/x-www-form-urlencoded");
    assert.deepEqual([...s.form.keys()].sort(), ["Body", "From", "To"]);
    assert.equal(s.form.get("To"), "+14155552671");
    assert.equal(s.form.get("From"), "+15005550006");
    assert.equal(s.form.get("Body"), "Game moved: 7:30 PM & Rink 2");
  } finally {
    fake.server.close();
  }
});

test("SMS: a Messaging Service replaces From", () => {
  const f = twilioMessageForm({ to: "+14155552671", body: "x", from: "+15005550006", messagingServiceSid: "MG1" });
  assert.equal(f.get("MessagingServiceSid"), "MG1");
  assert.equal(f.has("From"), false);
});

test("SMS: provider refusals are permanent, 429 and 5xx are transient", async () => {
  let next: { status: number; body: unknown } = { status: 400, body: { code: 21211, message: "The 'To' number is not a valid phone number.", status: 400 } };
  const fake = await fakeTwilio(() => next);
  try {
    const sms = new SmsDispatcherService(
      config({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "t", TWILIO_MESSAGING_SERVICE_SID: "MG1", TWILIO_API_BASE_URL: fake.base })
    );
    const bad = await sms.send({ to: "+14155552671", body: "x" });
    assert.equal(bad.delivered, false);
    assert.equal(bad.failure, "permanent");
    assert.equal(bad.providerCode, 21211);
    assert.match(bad.reason ?? "", /provider 400 code 21211/);

    next = { status: 429, body: { code: 20429, message: "Too Many Requests" } };
    assert.equal((await sms.send({ to: "+14155552671", body: "x" })).failure, "transient");
    next = { status: 503, body: {} };
    assert.equal((await sms.send({ to: "+14155552671", body: "x" })).failure, "transient");
  } finally {
    fake.server.close();
  }
});

test("SMS: unreachable provider is transient; a non-E.164 number never leaves", async () => {
  const sms = new SmsDispatcherService(
    config({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+15005550006", TWILIO_API_BASE_URL: "http://127.0.0.1:1" })
  );
  const down = await sms.send({ to: "+14155552671", body: "x" });
  assert.equal(down.failure, "transient");
  const bad = await sms.send({ to: "4155552671", body: "x" });
  assert.equal(bad.failure, "permanent");
});
