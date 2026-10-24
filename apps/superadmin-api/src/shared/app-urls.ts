import type { ConfigService } from "@nestjs/config";

/**
 * Public origin of the player app, for links the API puts in emails
 * (invite links, consent links). `PLAYER_WEB_URL` must be set per
 * environment: staging points at staging-player.sportspulse.us, so a
 * missing variable there would send staging recipients to production.
 * The fallback matches the other two env reads in the API.
 */
export function playerWebUrl(config: ConfigService): string {
  const configured = config.get<string>("PLAYER_WEB_URL");
  return (configured && configured.trim()
    ? configured.trim()
    : "https://player.sportspulse.us"
  ).replace(/\/+$/, "");
}
