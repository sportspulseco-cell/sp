import {and,gt,isNull,lte,or} from "drizzle-orm";
import {schema} from "@sportspulse/db";
/** A future, expired or revoked grant must never contribute access. */
export function activeRoleAssignment(now=new Date()) {
 return and(isNull(schema.userRoleAssignments.revokedAt),lte(schema.userRoleAssignments.effectiveFrom,now),or(isNull(schema.userRoleAssignments.effectiveTo),gt(schema.userRoleAssignments.effectiveTo,now)));
}
