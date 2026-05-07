"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { Game } from "@sportspulse/api-client";

/**
 * Client-side iCalendar (.ics) export — no backend changes needed.
 * Builds a VCALENDAR document from the games this player can see and
 * triggers a download. Each VEVENT carries: opponent (best effort
 * label), venue, scheduled UTC start, 90-minute default duration,
 * and a stable UID so re-imports replace rather than duplicate.
 */
export function ICalExportButton({
  games,
  teamLabel
}: {
  games: Game[];
  teamLabel: string;
}) {
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    try {
      const ics = buildIcs(games, teamLabel);
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sportspulse-${slug(teamLabel)}-schedule.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={busy || games.length === 0}
      title="Download an .ics file you can import into Google / Apple Calendar"
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-widest">
        Add to calendar
      </span>
    </Button>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function toIcsDateTime(iso: string): string {
  // YYYYMMDDTHHMMSSZ — UTC per the iCal spec.
  const d = new Date(iso);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
}

function buildIcs(games: Game[], teamLabel: string): string {
  const now = toIcsDateTime(new Date().toISOString());
  const events = games.map((g) => {
    const start = toIcsDateTime(g.scheduledStartTsUtc);
    const durationMin = g.durationMin ?? 90;
    const endIso = new Date(
      new Date(g.scheduledStartTsUtc).getTime() + durationMin * 60_000
    ).toISOString();
    const end = toIcsDateTime(endIso);
    const opp = g.homeTeamId === g.awayTeamId ? "TBD" : "Opponent";
    const summary = escapeIcs(`${teamLabel} vs. ${opp}`);
    const location = g.venueName
      ? escapeIcs(
          g.surfaceLabel ? `${g.venueName} · ${g.surfaceLabel}` : g.venueName
        )
      : "";
    return [
      "BEGIN:VEVENT",
      `UID:sp-game-${g.id}@sportspulse`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : "",
      `STATUS:${g.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT"
    ]
      .filter(Boolean)
      .join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SportsPulse//Player Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(teamLabel + " — SportsPulse")}`,
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
}
