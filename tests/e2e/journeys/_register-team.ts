import { loadEnvLocal, stagingSql, supabaseFetch } from "./_helpers";

/**
 * Roster entry needs a season registration (UC-01, UC-04): an invite,
 * offer or join request for a player with none sends them to
 * /register/<season>?team=<team>&invite=<token>. Journeys that are not
 * about the funnel itself (J4 walks it click by click) finish that
 * registration through the same public API the funnel calls, then the
 * league approves it through the admin API. Labelled fixture step: the
 * destination (roster, /team) is still checked in the browser.
 */
export const STAGING_API = process.env.E2E_API_URL ?? "https://staging-api.sportspulse.us/api";

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${STAGING_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {})
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

export async function accessToken(email: string, password: string): Promise<string> {
  const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
  const res = await supabaseFetch(`${env.STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.STAGING_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`token ${email}: ${res.status}`);
  return j.access_token as string;
}

/**
 * Register an existing account for `seasonId` onto `teamId` (the path
 * the ?team= link takes), sign the required documents, pick the first
 * price offered to the team's division, pay (mock card) and have the
 * super admin approve it. Returns the registration id and what the
 * approval said about the roster.
 */
export async function registerOntoTeamAndApprove(opts: {
  email: string;
  password: string;
  fullName: string;
  seasonId: string;
  teamId: string;
  inviteToken?: string | null;
}): Promise<{ registrationId: string; status: string; roster: unknown; log: string[] }> {
  const log: string[] = [];
  const ctx = await api(`/public/registration/seasons/${opts.seasonId}?team=${opts.teamId}`);
  log.push(`context ${ctx.status} joinTeam=${JSON.stringify(ctx.json?.joinTeam)}`);
  const offered: string[] = ctx.json?.season?.config?.registrationType === "team" ? ["captain_invite"] : ["captain_invite", "individual"];
  let start = { status: 0, json: null as any };
  for (const submissionType of offered) {
    start = await api(`/public/registration/seasons/${opts.seasonId}/resume`, {
      method: "POST",
      body: {
        email: opts.email,
        password: opts.password,
        submissionType,
        formVersionId: ctx.json?.formVersionId ?? undefined,
        teamId: opts.teamId,
        ...(opts.inviteToken ? { inviteToken: opts.inviteToken } : {})
      }
    });
    log.push(`resume ${submissionType} ${start.status} ${JSON.stringify(start.json).slice(0, 160)}`);
    if (start.status < 300) break;
  }
  if (start.status >= 300) throw new Error(`registration start failed: ${log.join(" | ")}`);
  const id = start.json.id as string;
  const divisionId = ctx.json?.joinTeam?.divisionId ?? null;
  const tier = (ctx.json?.pricingTiers ?? []).find(
    (t: { divisionIds?: string[]; usageLimit?: number | null; usageCount?: number }) =>
      (!t.divisionIds?.length || (divisionId && t.divisionIds.includes(divisionId))) &&
      (t.usageLimit == null || (t.usageCount ?? 0) < t.usageLimit)
  );
  if (tier) {
    const pt = await api(`/public/registration/submissions/${id}`, { method: "PATCH", body: { email: opts.email, pricingTierId: tier.id } });
    log.push(`price ${pt.status}`);
  }
  const w = await api(`/public/registration/submissions/${id}/waivers?email=${encodeURIComponent(opts.email)}`);
  const signer = w.json?.signerName || opts.fullName;
  for (const doc of w.json?.documents ?? []) {
    if (doc.signed) continue;
    const s = await api(`/public/registration/submissions/${id}/sign-waiver`, {
      method: "POST",
      body: { email: opts.email, key: doc.key, signatureName: signer }
    });
    log.push(`sign ${doc.key} ${s.status}`);
  }
  const pay = await api(`/public/registration/submissions/${id}/pay`, { method: "POST", body: { email: opts.email } });
  log.push(`pay ${pay.status} ${JSON.stringify(pay.json).slice(0, 120)}`);
  const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
  const sa = await accessToken(env.STAGING_SUPERADMIN_EMAIL!, env.STAGING_SUPERADMIN_PASSWORD!);
  const ap = await api(`/registration-v2/admin/submissions/${id}/review`, { method: "POST", body: { action: "approve" }, token: sa });
  log.push(`approve ${ap.status} ${JSON.stringify(ap.json).slice(0, 160)}`);
  const [row] = await stagingSql<{ status: string }>(`select status from registrations where id = $1`, [id]);
  return { registrationId: id, status: row?.status ?? "missing", roster: ap.json?.roster ?? null, log };
}
