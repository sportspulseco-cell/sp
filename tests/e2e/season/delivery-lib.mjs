import https from "node:https";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { CFG, TARGET, env } from "./lib.mjs";
if (TARGET !== "staging" || !CFG.api.includes("staging") || env.STAGING_SUPABASE_REF === "nmiiqyfwvbcvtwumtwil") throw new Error("Delivery acceptance is staging-only");

/** Provider requests stay on its verified TLS hostname. The explicit edge
 * is an optional local ISP/DNS workaround, never an application setting. */
export function resendRequest(path, { method = "GET", body } = {}) {
  const apiEnv = parseEnv(readFileSync("apps/superadmin-api/.env", "utf8"));
  const key = env.STAGING_RESEND_API_KEY ?? apiEnv.RESEND_API_KEY;
  if (!key) throw new Error("No provider key configured for the staging acceptance run");
  const payload = body === undefined ? null : JSON.stringify(body), edge = env.E2E_RESEND_IP;
  return new Promise((resolve, reject) => {
    const request = https.request(`https://api.resend.com/${path}`, { method,
      headers: { Authorization: `Bearer ${key}`, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
      ...(edge ? { lookup: (_host, options, callback) => options?.all ? callback(null, [{ address: edge, family: 4 }]) : callback(null, edge, 4) } : {}),
      timeout: 15_000,
    }, response => {
      let raw = ""; response.on("data", chunk => raw += chunk);
      response.on("end", () => {
        let data; try { data = JSON.parse(raw); } catch { reject(new Error("Invalid provider response")); return; }
        if (response.statusCode >= 300) reject(new Error(`Provider ${method} ${response.statusCode}: ${data.message ?? "request failed"}`));
        else resolve(data);
      });
    });
    request.on("error", reject); request.on("timeout", () => request.destroy(new Error("Provider acceptance request timed out")));
    request.end(payload);
  });
}
