import postgres from "postgres";

const url = process.env.DATABASE_URL;
const ref = process.env.STAGING_SUPABASE_REF;
if (!url || !ref || new URL(url).hostname !== `db.${ref}.supabase.co`) {
  throw new Error("A direct staging database URL and matching staging ref are required");
}

const users = [
  process.env.STAGING_SUPERADMIN_ID,
  process.env.STAGING_LEAGUE_USER_ID,
  process.env.STAGING_ORG_USER_ID,
  process.env.STAGING_TEAM_USER_ID,
  process.env.STAGING_PLAYER_ID
];
if (users.some((id) => !id) || new Set(users).size !== users.length) {
  throw new Error("Five distinct staging user IDs are required");
}

async function main() {
  const sql = postgres(url!, { max: 1, ssl: "require", prepare: false });
  try {
    for (const userId of users) {
      const [row] = await sql`
        SELECT COALESCE(jsonb_agg(DISTINCT r.code), '[]'::jsonb) AS codes
        FROM public.user_role_assignments ura
        JOIN public.roles r ON r.id = ura.role_id
        WHERE ura.user_id = ${userId!}::uuid
          AND ura.revoked_at IS NULL
          AND ura.effective_from <= now()
          AND (ura.effective_to IS NULL OR ura.effective_to > now())
      `;
      const codes = row?.codes as string[];
      if (!codes?.length) throw new Error(`No active roles for staging user ${userId}`);
      const updated = await sql`
        UPDATE auth.users
        SET raw_app_meta_data =
              COALESCE(
                CASE WHEN jsonb_typeof(raw_app_meta_data) = 'array'
                  THEN raw_app_meta_data->0 ELSE raw_app_meta_data END,
                '{}'::jsonb
              ) || jsonb_build_object(
                'role_codes', (
                  SELECT COALESCE(jsonb_agg(DISTINCT r.code), '[]'::jsonb)
                  FROM public.user_role_assignments ura
                  JOIN public.roles r ON r.id = ura.role_id
                  WHERE ura.user_id = ${userId!}::uuid
                    AND ura.revoked_at IS NULL
                    AND ura.effective_from <= now()
                    AND (ura.effective_to IS NULL OR ura.effective_to > now())
                ),
                'profile_complete', true
              ),
            updated_at = now()
        WHERE id = ${userId!}::uuid
        RETURNING id
      `;
      if (updated.length !== 1) throw new Error(`Missing staging auth user ${userId}`);
      console.log(`Synced staging auth role codes: ${codes.join(", ")}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
