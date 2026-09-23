import postgres from "postgres";

const url = process.env.DATABASE_URL;
const ref = process.env.STAGING_SUPABASE_REF;
const playerId = process.env.STAGING_PLAYER_ID;
const teamId = process.env.STAGING_TEAM_ENTITY_ID;

const dbUrl = url ? new URL(url) : null;
const direct = dbUrl?.hostname === `db.${ref}.supabase.co`;
const pooler =
  dbUrl?.hostname === "aws-0-ap-northeast-1.pooler.supabase.com" &&
  dbUrl.username === `postgres.${ref}`;
if (!url || !ref || (!direct && !pooler)) {
  throw new Error("A staging database URL and matching staging ref are required");
}
if (!playerId || !teamId) {
  throw new Error("Staging player and team IDs are required");
}

async function main() {
  const sql = postgres(url!, { max: 1, ssl: "require", prepare: false });
  try {
    const [role] = await sql`
      SELECT id FROM public.roles WHERE code = 'captain' AND org_id IS NULL
    `;
    const [team] = await sql`
      SELECT id FROM public.teams WHERE id = ${teamId!}::uuid
    `;
    const [player] = await sql`
      SELECT id FROM auth.users WHERE id = ${playerId!}::uuid
    `;
    if (!role || !team || !player) {
      throw new Error("Missing staging captain role, team, or player");
    }

    await sql`
      INSERT INTO public.user_role_assignments
        (user_id, role_id, scope_type, scope_id)
      SELECT ${playerId!}::uuid, ${role.id}::uuid, 'team', ${teamId!}::uuid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_role_assignments
        WHERE user_id = ${playerId!}::uuid
          AND role_id = ${role.id}::uuid
          AND scope_type = 'team'
          AND scope_id = ${teamId!}::uuid
          AND revoked_at IS NULL
      )
    `;
    await sql`
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'role_codes', (
            SELECT COALESCE(jsonb_agg(DISTINCT r.code), '[]'::jsonb)
            FROM public.user_role_assignments ura
            JOIN public.roles r ON r.id = ura.role_id
            WHERE ura.user_id = ${playerId!}::uuid
              AND ura.revoked_at IS NULL
              AND ura.effective_from <= now()
              AND (ura.effective_to IS NULL OR ura.effective_to > now())
          ),
          'profile_complete', true
        ),
        updated_at = now()
      WHERE id = ${playerId!}::uuid
    `;
    console.log("Staging player now has the captain role for the staging team");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
