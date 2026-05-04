// Sport-agnostic stats reducer. New sports plug in by adding a reducer
// keyed by sport_code. Output is per-(personId) Stat row to write into
// stat_lines.

export interface RawEvent {
  eventType: string;
  teamId: string | null;
  primaryPersonId: string | null;
  secondaryPersonIds: string[];
  attributes: Record<string, unknown>;
}

export interface PersonStat {
  personId: string;
  teamId: string | null;
  core: Record<string, number>;
  extended: Record<string, unknown>;
}

export interface StatReducer {
  fold(events: RawEvent[]): PersonStat[];
}

// Hockey reducer — counts goals, assists, points, PIM, saves, shots-against.
export const hockeyReducer: StatReducer = {
  fold(events) {
    const map = new Map<string, PersonStat>();
    const get = (personId: string, teamId: string | null): PersonStat => {
      let s = map.get(personId);
      if (!s) {
        s = {
          personId,
          teamId,
          core: {
            goals: 0,
            assists: 0,
            points: 0,
            pim: 0,
            shots: 0,
            saves: 0,
            shots_faced: 0,
            ga: 0
          },
          extended: {}
        };
        map.set(personId, s);
      }
      // Most recent team association wins
      if (teamId) s.teamId = teamId;
      return s;
    };

    for (const e of events) {
      switch (e.eventType) {
        case "goal": {
          if (e.primaryPersonId) {
            const s = get(e.primaryPersonId, e.teamId);
            s.core.goals = (s.core.goals ?? 0) + 1;
            s.core.points = (s.core.points ?? 0) + 1;
            s.core.shots = (s.core.shots ?? 0) + 1;
          }
          for (const aId of e.secondaryPersonIds ?? []) {
            const s = get(aId, e.teamId);
            s.core.assists = (s.core.assists ?? 0) + 1;
            s.core.points = (s.core.points ?? 0) + 1;
          }
          break;
        }
        case "shot": {
          if (e.primaryPersonId) {
            const s = get(e.primaryPersonId, e.teamId);
            s.core.shots = (s.core.shots ?? 0) + 1;
          }
          break;
        }
        case "save": {
          if (e.primaryPersonId) {
            const s = get(e.primaryPersonId, e.teamId);
            s.core.saves = (s.core.saves ?? 0) + 1;
            s.core.shots_faced = (s.core.shots_faced ?? 0) + 1;
          }
          break;
        }
        case "goal_against": {
          if (e.primaryPersonId) {
            const s = get(e.primaryPersonId, e.teamId);
            s.core.ga = (s.core.ga ?? 0) + 1;
            s.core.shots_faced = (s.core.shots_faced ?? 0) + 1;
          }
          break;
        }
        case "penalty":
        case "minor":
        case "major":
        case "misconduct":
        case "match_penalty": {
          if (e.primaryPersonId) {
            const s = get(e.primaryPersonId, e.teamId);
            const min =
              typeof e.attributes?.minutes === "number"
                ? (e.attributes.minutes as number)
                : e.eventType === "minor"
                ? 2
                : e.eventType === "major"
                ? 5
                : e.eventType === "misconduct"
                ? 10
                : 0;
            s.core.pim = (s.core.pim ?? 0) + min;
          }
          break;
        }
      }
    }

    // Derive sv_pct + GAA into extended for goalie lines
    for (const s of map.values()) {
      const faced = s.core.shots_faced ?? 0;
      if (faced > 0) {
        s.extended.sv_pct = +((s.core.saves ?? 0) / faced).toFixed(3);
      }
    }
    return Array.from(map.values());
  }
};

// Generic catch-all (used for sports we don't have a reducer for).
export const genericReducer: StatReducer = {
  fold(events) {
    const map = new Map<string, PersonStat>();
    for (const e of events) {
      if (!e.primaryPersonId) continue;
      let s = map.get(e.primaryPersonId);
      if (!s) {
        s = {
          personId: e.primaryPersonId,
          teamId: e.teamId,
          core: { events: 0 },
          extended: {}
        };
        map.set(e.primaryPersonId, s);
      }
      s.core.events = (s.core.events ?? 0) + 1;
      const k = `${e.eventType}_count`;
      s.core[k] = (s.core[k] ?? 0) + 1;
    }
    return Array.from(map.values());
  }
};

export function reducerForSport(sportCode: string): StatReducer {
  switch (sportCode) {
    case "HOCKEY_ICE":
      return hockeyReducer;
    default:
      return genericReducer;
  }
}
