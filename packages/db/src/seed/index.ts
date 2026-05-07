import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { currencies, locales, countries, sports } from "../schema/reference";
import { roles } from "../schema/iam";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const sql = postgres(url, { max: 1, ssl: "require" });
  const db = drizzle(sql, { schema, casing: "snake_case" });

  console.log("Seeding currencies …");
  await db
    .insert(currencies)
    .values([
      { code: "USD", symbol: "$", decimals: 2, name: "US Dollar" },
      { code: "CAD", symbol: "$", decimals: 2, name: "Canadian Dollar" },
      { code: "EUR", symbol: "€", decimals: 2, name: "Euro" },
      { code: "GBP", symbol: "£", decimals: 2, name: "Pound Sterling" },
      { code: "AUD", symbol: "$", decimals: 2, name: "Australian Dollar" },
      { code: "NZD", symbol: "$", decimals: 2, name: "New Zealand Dollar" },
      { code: "INR", symbol: "₹", decimals: 2, name: "Indian Rupee" },
      { code: "JPY", symbol: "¥", decimals: 0, name: "Japanese Yen" },
      { code: "CNY", symbol: "¥", decimals: 2, name: "Chinese Yuan" },
      { code: "SGD", symbol: "$", decimals: 2, name: "Singapore Dollar" },
      { code: "HKD", symbol: "$", decimals: 2, name: "Hong Kong Dollar" },
      { code: "AED", symbol: "د.إ", decimals: 2, name: "UAE Dirham" },
      { code: "SAR", symbol: "﷼", decimals: 2, name: "Saudi Riyal" },
      { code: "BRL", symbol: "R$", decimals: 2, name: "Brazilian Real" },
      { code: "MXN", symbol: "$", decimals: 2, name: "Mexican Peso" },
      { code: "ZAR", symbol: "R", decimals: 2, name: "South African Rand" },
      { code: "CHF", symbol: "Fr", decimals: 2, name: "Swiss Franc" }
    ])
    .onConflictDoNothing();

  console.log("Seeding locales …");
  await db
    .insert(locales)
    .values([
      { code: "en-US", rtl: false, name: "English (US)" },
      { code: "en-GB", rtl: false, name: "English (UK)" },
      { code: "en-CA", rtl: false, name: "English (Canada)" },
      { code: "en-AU", rtl: false, name: "English (Australia)" },
      { code: "fr-FR", rtl: false, name: "French (France)" },
      { code: "fr-CA", rtl: false, name: "French (Canada)" },
      { code: "es-ES", rtl: false, name: "Spanish (Spain)" },
      { code: "es-MX", rtl: false, name: "Spanish (Mexico)" },
      { code: "de-DE", rtl: false, name: "German (Germany)" },
      { code: "it-IT", rtl: false, name: "Italian" },
      { code: "pt-BR", rtl: false, name: "Portuguese (Brazil)" },
      { code: "pt-PT", rtl: false, name: "Portuguese (Portugal)" },
      { code: "ja-JP", rtl: false, name: "Japanese" },
      { code: "zh-CN", rtl: false, name: "Chinese (Simplified)" },
      { code: "zh-TW", rtl: false, name: "Chinese (Traditional)" },
      { code: "ko-KR", rtl: false, name: "Korean" },
      { code: "hi-IN", rtl: false, name: "Hindi" },
      { code: "ar-AE", rtl: true, name: "Arabic (UAE)" },
      { code: "ar-SA", rtl: true, name: "Arabic (Saudi Arabia)" },
      { code: "he-IL", rtl: true, name: "Hebrew" }
    ])
    .onConflictDoNothing();

  console.log("Seeding countries …");
  await db
    .insert(countries)
    .values([
      { code: "US", name: "United States", defaultCurrency: "USD", defaultLocale: "en-US", phonePrefix: "+1" },
      { code: "CA", name: "Canada", defaultCurrency: "CAD", defaultLocale: "en-CA", phonePrefix: "+1" },
      { code: "GB", name: "United Kingdom", defaultCurrency: "GBP", defaultLocale: "en-GB", phonePrefix: "+44" },
      { code: "IE", name: "Ireland", defaultCurrency: "EUR", defaultLocale: "en-GB", phonePrefix: "+353" },
      { code: "AU", name: "Australia", defaultCurrency: "AUD", defaultLocale: "en-AU", phonePrefix: "+61" },
      { code: "NZ", name: "New Zealand", defaultCurrency: "NZD", defaultLocale: "en-AU", phonePrefix: "+64" },
      { code: "IN", name: "India", defaultCurrency: "INR", defaultLocale: "hi-IN", phonePrefix: "+91" },
      { code: "JP", name: "Japan", defaultCurrency: "JPY", defaultLocale: "ja-JP", phonePrefix: "+81" },
      { code: "CN", name: "China", defaultCurrency: "CNY", defaultLocale: "zh-CN", phonePrefix: "+86" },
      { code: "SG", name: "Singapore", defaultCurrency: "SGD", defaultLocale: "en-GB", phonePrefix: "+65" },
      { code: "HK", name: "Hong Kong", defaultCurrency: "HKD", defaultLocale: "zh-TW", phonePrefix: "+852" },
      { code: "DE", name: "Germany", defaultCurrency: "EUR", defaultLocale: "de-DE", phonePrefix: "+49" },
      { code: "FR", name: "France", defaultCurrency: "EUR", defaultLocale: "fr-FR", phonePrefix: "+33" },
      { code: "IT", name: "Italy", defaultCurrency: "EUR", defaultLocale: "it-IT", phonePrefix: "+39" },
      { code: "ES", name: "Spain", defaultCurrency: "EUR", defaultLocale: "es-ES", phonePrefix: "+34" },
      { code: "PT", name: "Portugal", defaultCurrency: "EUR", defaultLocale: "pt-PT", phonePrefix: "+351" },
      { code: "CH", name: "Switzerland", defaultCurrency: "CHF", defaultLocale: "de-DE", phonePrefix: "+41" },
      { code: "AE", name: "United Arab Emirates", defaultCurrency: "AED", defaultLocale: "ar-AE", phonePrefix: "+971" },
      { code: "SA", name: "Saudi Arabia", defaultCurrency: "SAR", defaultLocale: "ar-SA", phonePrefix: "+966" },
      { code: "IL", name: "Israel", defaultCurrency: "EUR", defaultLocale: "he-IL", phonePrefix: "+972" },
      { code: "BR", name: "Brazil", defaultCurrency: "BRL", defaultLocale: "pt-BR", phonePrefix: "+55" },
      { code: "MX", name: "Mexico", defaultCurrency: "MXN", defaultLocale: "es-MX", phonePrefix: "+52" },
      { code: "ZA", name: "South Africa", defaultCurrency: "ZAR", defaultLocale: "en-GB", phonePrefix: "+27" },
      { code: "KR", name: "South Korea", defaultCurrency: "USD", defaultLocale: "ko-KR", phonePrefix: "+82" }
    ])
    .onConflictDoNothing();

  console.log("Seeding sports …");
  await db
    .insert(sports)
    .values([
      { code: "HOCKEY_ICE", name: "Ice Hockey", teamSizeDefault: 6, periodModel: "period", scoringModel: { goal: 1 } },
      { code: "HOCKEY_FIELD", name: "Field Hockey", teamSizeDefault: 11, periodModel: "half", scoringModel: { goal: 1 } },
      { code: "SOCCER", name: "Soccer / Football", teamSizeDefault: 11, periodModel: "half", scoringModel: { goal: 1 } },
      { code: "BASKETBALL", name: "Basketball", teamSizeDefault: 5, periodModel: "quarter", scoringModel: { "2pt": 2, "3pt": 3, ft: 1 } },
      { code: "BASEBALL", name: "Baseball", teamSizeDefault: 9, periodModel: "inning", scoringModel: { run: 1 } },
      { code: "CRICKET", name: "Cricket", teamSizeDefault: 11, periodModel: "inning", scoringModel: { run: 1, wicket: 0 } },
      { code: "RUGBY_UNION", name: "Rugby Union", teamSizeDefault: 15, periodModel: "half", scoringModel: { try: 5, conversion: 2, penalty: 3, drop_goal: 3 } },
      { code: "RUGBY_LEAGUE", name: "Rugby League", teamSizeDefault: 13, periodModel: "half", scoringModel: { try: 4, conversion: 2, penalty: 2, drop_goal: 1 } },
      { code: "AFL", name: "Australian Rules Football", teamSizeDefault: 18, periodModel: "quarter", scoringModel: { goal: 6, behind: 1 } },
      { code: "LACROSSE", name: "Lacrosse", teamSizeDefault: 10, periodModel: "quarter", scoringModel: { goal: 1 } },
      { code: "VOLLEYBALL", name: "Volleyball", teamSizeDefault: 6, periodModel: "set", scoringModel: { point: 1 } },
      { code: "NETBALL", name: "Netball", teamSizeDefault: 7, periodModel: "quarter", scoringModel: { goal: 1 } },
      { code: "HANDBALL", name: "Handball", teamSizeDefault: 7, periodModel: "half", scoringModel: { goal: 1 } },
      { code: "FUTSAL", name: "Futsal", teamSizeDefault: 5, periodModel: "half", scoringModel: { goal: 1 } }
    ])
    .onConflictDoNothing();

  console.log("Seeding system roles …");
  // Top-down hierarchy. Permissions are wildcards for now — the resource-scope
  // guard maps scoped requests to specific permission codes per controller.
  await db
    .insert(roles)
    .values([
      {
        orgId: null,
        code: "super_admin",
        name: "Super Admin",
        description: "Platform god-mode. All capabilities, all scopes.",
        isSystem: true,
        permissions: ["*"]
      },
      {
        orgId: null,
        code: "org_admin",
        name: "Org Admin",
        description: "Full control of one organization.",
        isSystem: true,
        permissions: ["org.*"]
      },
      {
        orgId: null,
        code: "league_admin",
        name: "League Admin",
        description: "Manages a single league: divisions, teams, schedules.",
        isSystem: true,
        permissions: ["league.*", "division.*", "team.read"]
      },
      {
        orgId: null,
        code: "season_admin",
        name: "Season Admin",
        description: "Manages registrations + roster locks for one season.",
        isSystem: true,
        permissions: ["season.*", "registration.review"]
      },
      {
        orgId: null,
        code: "division_admin",
        name: "Division Admin",
        description: "Manages teams + games inside one division.",
        isSystem: true,
        permissions: ["division.*", "team.read", "game.read"]
      },
      {
        orgId: null,
        code: "team_admin",
        name: "Team Admin",
        description:
          "League/club-installed manager for one team. Handles paperwork, fees, and league communications.",
        isSystem: true,
        permissions: ["team.*", "roster.write"]
      },
      {
        orgId: null,
        code: "captain",
        name: "Captain",
        description:
          "Rostered player elected to lead the team. Admin powers over roster + invites + lineups; appears in roster + stats as a player.",
        isSystem: true,
        permissions: [
          "team.read",
          "team.write",
          "roster.read",
          "roster.write",
          "lineup.write",
          "invite.issue",
          "invite.revoke",
          "free_agent.read",
          "free_agent.claim",
          "self.read"
        ]
      },
      {
        orgId: null,
        code: "coach",
        name: "Coach",
        description: "Reads roster, manages lineups, requests roster moves.",
        isSystem: true,
        permissions: ["team.read", "roster.read", "lineup.write"]
      },
      {
        orgId: null,
        code: "registrar",
        name: "Registrar",
        description: "Reviews registrations + signs documents on behalf.",
        isSystem: true,
        permissions: ["registration.review", "document.sign"]
      },
      {
        orgId: null,
        code: "referee",
        name: "Referee / Official",
        description: "Officiates assigned games. Logs events + cards.",
        isSystem: true,
        permissions: ["game.read", "game_event.write", "suspension.issue"]
      },
      {
        orgId: null,
        code: "scorekeeper",
        name: "Scorekeeper",
        description: "Operates the scoresheet for assigned games.",
        isSystem: true,
        permissions: ["game.read", "game_event.write", "score.write"]
      },
      {
        orgId: null,
        code: "player",
        name: "Player",
        description: "Sees own roster, schedules, stats.",
        isSystem: true,
        permissions: ["self.read"]
      },
      {
        orgId: null,
        code: "parent",
        name: "Parent / Guardian",
        description: "Manages registrations + consent for linked minors.",
        isSystem: true,
        permissions: ["dependant.read", "dependant.register", "document.sign"]
      },
      {
        orgId: null,
        code: "spectator",
        name: "Spectator",
        description: "Public read access to schedules + standings.",
        isSystem: true,
        permissions: ["public.read"]
      }
    ])
    .onConflictDoNothing();

  console.log("Seed complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
