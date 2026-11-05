import type { RosterMoveRepository } from "../../domain/repositories/roster-move.repository";
import type { TeamMembershipRepository } from "../../domain/repositories/team-membership.repository";
export const ROSTER_UNIT_OF_WORK = Symbol("ROSTER_UNIT_OF_WORK");
export interface RosterWorkRepositories {
  moves: RosterMoveRepository;
  memberships: TeamMembershipRepository;
}
export interface RosterUnitOfWork {
  run<T>(subject: { personId: string; seasonId: string }, work: (repositories: RosterWorkRepositories) => Promise<T>): Promise<T>;
}
