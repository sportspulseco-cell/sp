import postgres from "postgres";

const url = process.env.DATABASE_URL;
const ref = process.env.STAGING_SUPABASE_REF;
const userId = process.env.STAGING_SUPERADMIN_ID;

if (!url || !ref || !userId || new URL(url).hostname !== `db.${ref}.supabase.co`) {
  throw new Error("A direct staging database URL, ref, and user ID are required");
}

async function main() {
  const sql = postgres(url!, { max: 1, ssl: "require" });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("ALTER TABLE public.profiles DISABLE TRIGGER profiles_prevent_escalation");
      const rows = await tx`
        UPDATE public.profiles
        SET is_super_admin = true, display_name = 'Staging Super Admin'
        WHERE id = ${userId!}::uuid
        RETURNING id
      `;
      if (rows.length !== 1) throw new Error("Staging admin profile was not found");
      await tx.unsafe("ALTER TABLE public.profiles ENABLE TRIGGER profiles_prevent_escalation");
    });
    await sql`SELECT pg_notify('pgrst', 'reload schema')`;
    console.log("Staging admin profile bootstrapped.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
