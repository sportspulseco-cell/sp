import type {
  AuditEvent,
  AuditFacets,
  ConsentSignature,
  CrossOrgGrant,
  ImportEntityKind,
  ImportJob,
  ImportJobRowEntry,
  ImportStatus,
  FeatureFlag,
  OrgRelation,
  PlatformHealth,
  Role,
  RoleAssignment,
  RoleScopeType,
  Sport,
  SystemSetting,
  Division,
  Document,
  DocumentKind,
  DocumentVersion,
  AgeGroup,
  EligibilityRecord,
  EligibilityStatus,
  GoverningBody,
  IdentityVerification,
  InvoiceEscalation,
  InvoiceEscalationWithInvoice,
  QuickbooksSyncLog,
  QuickbooksSyncStatus,
  Refund,
  RefundType,
  TeamInvoiceSplit,
  TeamInvoiceSplitWithPerson,
  WalletAccount,
  WalletLedgerEntry,
  FeeSchedule,
  FormPurpose,
  FormVersion,
  FreeAgentPoolEntry,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  Game,
  GameEvent,
  GameOfficial,
  GameOfficialRole,
  GameOfficialStatus,
  GameStatus,
  Leaderboard,
  League,
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationTemplate,
  Org,
  Page,
  Person,
  Profile,
  Registration,
  RegistrationForm,
  RosterMove,
  Season,
  StatLine,
  Standing,
  Suspension,
  Team,
  TeamMembership
} from "./types";

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export type Fetcher = <T>(path: string, init?: RequestInit) => Promise<T>;

// Factory: build the SDK against any fetcher.
// Server components bind to the cookie-based fetcher (server-api.ts);
// client components bind to the browser-supabase fetcher (browser-api.ts).
export function createApi(f: Fetcher) {
  return {
    iam: {
      me: () => f<Profile>("/iam/me"),
      patchMe: (body: {
        legalFirstName?: string | null;
        legalLastName?: string | null;
        preferredName?: string | null;
        displayName?: string | null;
        countryCode?: string | null;
        locale?: string;
        timezone?: string;
      }) =>
        f<Profile>("/iam/me", {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      meScope: () =>
        f<{
          userId: string;
          isSuperAdmin: boolean;
          roleCodes: string[];
          orgIds: string[];
          leagueIds: string[];
          teamIds: string[];
          personId: string | null;
        }>("/iam/me/scope"),
      listUsers: (
        q: {
          limit?: number;
          cursor?: string;
          search?: string;
          roleCode?: string;
        } = {}
      ) => f<Page<Profile>>(`/iam/users${qs(q)}`),
      getUser: (id: string) => f<Profile>(`/iam/users/${id}`),
      updateUser: (
        id: string,
        body: {
          displayName?: string | null;
          preferredName?: string | null;
          locale?: string;
          timezone?: string;
        }
      ) =>
        f<Profile>(`/iam/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      suspendUser: (id: string) =>
        f<Profile>(`/iam/users/${id}/suspend`, { method: "POST" }),
      reactivateUser: (id: string) =>
        f<Profile>(`/iam/users/${id}/reactivate`, { method: "POST" }),
      setUserPassword: (id: string, password: string) =>
        f<{ ok: true }>(`/iam/users/${id}/set-password`, {
          method: "POST",
          body: JSON.stringify({ password })
        }),
      getRoleProfile: (id: string, code: string) =>
        f<{ data: Record<string, unknown> }>(
          `/iam/users/${id}/role-profile${qs({ code })}`
        ),
      setRoleProfile: (
        id: string,
        body: {
          roleCode: string;
          data: Record<string, unknown>;
          /**
           * If true, also flips auth.users.app_metadata.profile_complete
           * = true. Used by the onboarding wizard's Finish action so
           * each app's middleware stops bouncing the user back to
           * /onboarding.
           */
          complete?: boolean;
        }
      ) =>
        f<{ ok: true }>(`/iam/users/${id}/role-profile`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      /**
       * Resolve the role-profile FormDefinition for a given role.
       * Returns `source: 'admin'` with the admin-configured schema if
       * one exists, else `source: 'kernel-default'` and the caller
       * falls through to ROLE_PROFILE_SCHEMAS from @sportspulse/kernel.
       */
      getRoleProfileForm: (code: string) =>
        f<{
          source: "admin" | "kernel-default";
          schema: Record<string, unknown> | null;
          formVersionId: string | null;
        }>(`/iam/role-profile-form${qs({ code })}`),
      inviteUser: (body: {
        email: string;
        displayName?: string;
        password?: string;
        scopeLabel?: string;
        role?: {
          roleCode: string;
          scopeType: RoleScopeType;
          scopeId?: string;
        };
      }) =>
        f<{
          userId: string;
          email: string;
          created: boolean;
          assignment: RoleAssignment | null;
          message: {
            subject: string;
            body: string;
            recipient: string;
          };
        }>("/iam/users/invite", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      listPersons: (
        q: { limit?: number; cursor?: string; search?: string; countryCode?: string } = {}
      ) => f<Page<Person>>(`/iam/persons${qs(q)}`),
      getPerson: (id: string) => f<Person>(`/iam/persons/${id}`),
      createPerson: (body: {
        legalFirstName: string;
        legalLastName: string;
        preferredName?: string | null;
        dobDate?: string | null;
        countryCode?: string | null;
      }) =>
        f<Person>("/iam/persons", { method: "POST", body: JSON.stringify(body) }),
      updatePerson: (
        id: string,
        body: {
          legalFirstName?: string;
          legalLastName?: string;
          preferredName?: string | null;
          dobDate?: string | null;
          countryCode?: string | null;
        }
      ) =>
        f<Person>(`/iam/persons/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      linkPersonToUser: (id: string, userId: string) =>
        f<Person>(`/iam/persons/${id}/link-user`, {
          method: "POST",
          body: JSON.stringify({ userId })
        }),

      // Roles
      listRoles: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          isSystem?: boolean;
          search?: string;
        } = {}
      ) => f<Page<Role>>(`/iam/roles${qs(q)}`),
      getRole: (id: string) => f<Role>(`/iam/roles/${id}`),
      createRole: (body: {
        orgId?: string | null;
        code: string;
        name: string;
        description?: string | null;
        permissions?: string[];
      }) =>
        f<Role>("/iam/roles", { method: "POST", body: JSON.stringify(body) }),
      updateRole: (
        id: string,
        body: {
          name?: string;
          description?: string | null;
          permissions?: string[];
        }
      ) =>
        f<Role>(`/iam/roles/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      deleteRole: (id: string) =>
        f<{ ok: true }>(`/iam/roles/${id}`, { method: "DELETE" }),

      // Role assignments
      listRoleAssignments: (
        q: {
          limit?: number;
          cursor?: string;
          userId?: string;
          roleId?: string;
          scopeType?: RoleScopeType;
          scopeId?: string;
          activeOnly?: boolean;
        } = {}
      ) => f<Page<RoleAssignment>>(`/iam/role-assignments${qs(q)}`),
      assignRole: (body: {
        userId: string;
        roleId: string;
        scopeType: RoleScopeType;
        scopeId?: string | null;
        effectiveFrom?: string | null;
        effectiveTo?: string | null;
      }) =>
        f<RoleAssignment>("/iam/role-assignments", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      revokeAssignment: (id: string) =>
        f<RoleAssignment>(`/iam/role-assignments/${id}/revoke`, {
          method: "POST"
        }),
      activeRolesForUser: (userId: string) =>
        f<RoleAssignment[]>(`/iam/users/${userId}/roles`),
      myActiveRoles: () => f<RoleAssignment[]>(`/iam/me/roles`)
    },

    compliance: {
      // Workflow 7B · pre-add roster eligibility precheck (non-blocking).
      precheck: (q: {
        personId: string;
        divisionId: string;
        teamId: string;
      }) =>
        f<{
          rosterSizeCheck: {
            currentCount: number;
            maxAllowed: number;
            wouldExceed: boolean;
          };
          ageCheck:
            | { status: "eligible"; ageYears: number }
            | {
                status: "out_of_range";
                ageYears: number;
                minYears?: number;
                maxYears?: number;
              }
            | { status: "unknown" };
          genderCheck:
            | { status: "eligible" }
            | {
                status: "warning";
                divisionEligibility: string;
                personGender: string;
              };
          playoffWarning: {
            gamesPlayed: number;
            gamesRemaining: number;
            minRequired: number;
            willBePlayoffEligible: boolean;
            message: string | null;
          };
        }>(`/compliance/eligibility/precheck${qs(q)}`),

      // Eligibility
      listEligibility: (
        q: {
          limit?: number;
          cursor?: string;
          personId?: string;
          seasonId?: string;
          governingBodyId?: string;
          status?: EligibilityStatus;
        } = {}
      ) => f<Page<EligibilityRecord>>(`/compliance/eligibility${qs(q)}`),
      createEligibility: (body: {
        personId: string;
        seasonId?: string | null;
        governingBodyId?: string | null;
        ruleEvaluation?: Record<string, unknown>;
        status?: EligibilityStatus;
      }) =>
        f<EligibilityRecord>("/compliance/eligibility", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      reevaluateEligibility: (
        id: string,
        body: { ruleEvaluation: Record<string, unknown>; status: EligibilityStatus }
      ) =>
        f<EligibilityRecord>(`/compliance/eligibility/${id}/reevaluate`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      waiveEligibility: (id: string, reason: string) =>
        f<EligibilityRecord>(`/compliance/eligibility/${id}/waive`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),

      // Documents
      listDocuments: (
        q: { limit?: number; cursor?: string; orgId?: string; kind?: DocumentKind } = {}
      ) => f<Page<Document>>(`/compliance/documents${qs(q)}`),
      getDocument: (id: string) => f<Document>(`/compliance/documents/${id}`),
      createDocument: (body: {
        orgId?: string | null;
        kind: DocumentKind;
        name: string;
        description?: string | null;
      }) =>
        f<Document>("/compliance/documents", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      listDocumentVersions: (documentId: string) =>
        f<DocumentVersion[]>(`/compliance/documents/${documentId}/versions`),
      publishDocumentVersion: (
        documentId: string,
        body: {
          contentHtml: string;
          languageCode?: string;
          jurisdictionCountryCode?: string | null;
        }
      ) =>
        f<DocumentVersion>(
          `/compliance/documents/${documentId}/versions/publish`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      signDocument: (body: {
        documentVersionId: string;
        personId: string;
      }) =>
        f<ConsentSignature>("/compliance/documents/signatures", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      revokeSignature: (id: string, reason?: string) =>
        f<ConsentSignature>(`/compliance/documents/signatures/${id}/revoke`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      signaturesByPerson: (personId: string) =>
        f<ConsentSignature[]>(
          `/compliance/documents/signatures/by-person/${personId}`
        ),

      // Self-service — players self-attest their governing-body IDs.
      // Format-validated server-side; recorded as source=self_attest +
      // status=pending so an admin can verify or expire later.
      submitMyIdentityVerification: (body: {
        governingBodyCode: string;
        externalId: string;
      }) =>
        f<IdentityVerification>(
          "/compliance/self/identity-verifications",
          { method: "POST", body: JSON.stringify(body) }
        )
    },

    audit: {
      list: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          actorUserId?: string;
          resourceType?: string;
          resourceId?: string;
          action?: string;
          fromTs?: string;
          toTs?: string;
        } = {}
      ) => f<Page<AuditEvent>>(`/audit${qs(q)}`),
      get: (id: string) => f<AuditEvent>(`/audit/${id}`),
      facets: () => f<AuditFacets>(`/audit/facets`)
    },

    finance: {
      // Fee schedules
      listFeeSchedules: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          kind?: string;
          isActive?: boolean;
        } = {}
      ) => f<Page<FeeSchedule>>(`/finance/fee-schedules${qs(q)}`),
      createFeeSchedule: (body: {
        orgId: string;
        name: string;
        description?: string | null;
        kind?: string;
        code?: string | null;
        currency?: string;
        baseAmountCents: number;
        dueOffsetDays?: number;
        lateFeeCents?: number;
        seasonId?: string | null;
        leagueId?: string | null;
        divisionId?: string | null;
        isActive?: boolean;
      }) =>
        f<FeeSchedule>("/finance/fee-schedules", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updateFeeSchedule: (
        id: string,
        body: {
          orgId: string;
          name: string;
          description?: string | null;
          kind?: string;
          code?: string | null;
          currency?: string;
          baseAmountCents: number;
          dueOffsetDays?: number;
          lateFeeCents?: number;
          seasonId?: string | null;
          leagueId?: string | null;
          divisionId?: string | null;
          isActive?: boolean;
        }
      ) =>
        f<FeeSchedule>(`/finance/fee-schedules/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),

      // Invoices
      listInvoices: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          status?: InvoiceStatus;
          recipientPersonId?: string;
          registrationId?: string;
        } = {}
      ) => f<Page<Invoice>>(`/finance/invoices${qs(q)}`),
      getInvoice: (id: string) => f<Invoice>(`/finance/invoices/${id}`),
      createInvoice: (body: {
        orgId: string;
        invoiceNumber?: string;
        registrationId?: string | null;
        recipientPersonId?: string | null;
        recipientEmail?: string | null;
        currency?: string;
        taxCents?: number;
        discountCents?: number;
        dueAt?: string | null;
        notes?: string | null;
        idempotencyKey?: string | null;
        items: Array<{
          kind?: string;
          description: string;
          quantity?: number;
          unitAmountCents: number;
          feeScheduleId?: string | null;
        }>;
      }) =>
        f<Invoice>("/finance/invoices", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      sendInvoice: (id: string) =>
        f<Invoice>(`/finance/invoices/${id}/send`, { method: "POST" }),
      voidInvoice: (id: string, reason?: string) =>
        f<Invoice>(`/finance/invoices/${id}/void`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      reconcileInvoice: (id: string) =>
        f<Invoice>(`/finance/invoices/${id}/reconcile`, { method: "POST" }),

      // Payments
      listPayments: (invoiceId: string) =>
        f<Payment[]>(`/finance/invoices/${invoiceId}/payments`),
      recordPayment: (
        invoiceId: string,
        body: {
          orgId: string;
          amountCents: number;
          currency?: string;
          method?: PaymentMethod;
          status?: "pending" | "succeeded" | "failed" | "refunded";
          receivedAt?: string;
          externalProviderId?: string | null;
          notes?: string | null;
        }
      ) =>
        f<Payment>(`/finance/invoices/${invoiceId}/payments`, {
          method: "POST",
          body: JSON.stringify(body)
        }),

      // ----- Dues split (per-player share of a team invoice) -----
      listSplits: (
        q: { invoiceId?: string; teamId?: string; playerPersonId?: string }
      ) =>
        f<TeamInvoiceSplitWithPerson[]>(`/finance/splits${qs(q)}`),
      createSplit: (body: {
        invoiceId: string;
        teamId: string;
        playerPersonId: string;
        allocatedCents: number;
      }) =>
        f<TeamInvoiceSplit>(`/finance/splits`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      createSplitsBatchEqual: (body: {
        invoiceId: string;
        teamId: string;
        playerPersonIds: string[];
      }) =>
        f<TeamInvoiceSplit[]>(`/finance/splits/batch-equal`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      patchSplit: (
        id: string,
        body: {
          collectedCents?: number;
          allocatedCents?: number;
          status?: "pending" | "partial" | "paid" | "overdue";
        }
      ) =>
        f<TeamInvoiceSplit>(`/finance/splits/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      remindSplit: (id: string) =>
        f<TeamInvoiceSplit>(`/finance/splits/${id}/remind`, { method: "POST" }),

      // ----- Refunds -----
      listRefunds: (
        q: { invoiceId?: string; orgId?: string; status?: string } = {}
      ) => f<Refund[]>(`/finance/refunds${qs(q)}`),
      issueRefund: (body: {
        invoiceId: string;
        paymentId?: string | null;
        refundType: RefundType;
        amountCents: number;
        reason: string;
      }) =>
        f<Refund>(`/finance/refunds`, {
          method: "POST",
          body: JSON.stringify(body)
        }),

      // ----- Wallet -----
      getWallet: (q: { personId: string; orgId: string; currency?: string }) =>
        f<WalletAccount | null>(`/finance/wallet${qs(q)}`),
      walletLedger: (walletId: string) =>
        f<WalletLedgerEntry[]>(`/finance/wallet/${walletId}/ledger`),
      issueWalletCredit: (body: {
        personId: string;
        orgId: string;
        amountCents: number;
        currency?: string;
        expiresAt?: string | null;
        reason: string;
      }) =>
        f<{ wallet: WalletAccount; entry: WalletLedgerEntry }>(
          `/finance/wallet/issue-credit`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      freezeWallet: (walletId: string) =>
        f<WalletAccount>(`/finance/wallet/${walletId}/freeze`, { method: "POST" }),
      unfreezeWallet: (walletId: string) =>
        f<WalletAccount>(`/finance/wallet/${walletId}/unfreeze`, { method: "POST" }),

      // ----- Overdue escalations -----
      listEscalations: (q: { orgId?: string; lockSuspended?: boolean } = {}) =>
        f<InvoiceEscalationWithInvoice[]>(`/finance/escalations${qs(q)}`),
      patchEscalation: (
        id: string,
        body: {
          level?: 1 | 2 | 3;
          lockSuspended?: boolean;
          extendedDueAt?: string | null;
          lastActionKind?:
            | "mark_paid"
            | "message"
            | "extend"
            | "suppress"
            | "waive_flag";
        }
      ) =>
        f<InvoiceEscalation>(`/finance/escalations/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      ensureEscalation: (invoiceId: string) =>
        f<InvoiceEscalation>(`/finance/escalations/ensure`, {
          method: "POST",
          body: JSON.stringify({ invoiceId })
        }),

      // ----- QuickBooks sync (read-only display + worker append) -----
      listQbSync: (
        q: {
          orgId?: string;
          entityType?: string;
          entityId?: string;
          status?: string;
          limit?: number;
        } = {}
      ) => f<QuickbooksSyncLog[]>(`/finance/quickbooks-sync${qs(q)}`),
      qbSyncStatus: (orgId: string) =>
        f<QuickbooksSyncStatus>(
          `/finance/quickbooks-sync/status${qs({ orgId })}`
        )
    },

    communications: {
      myUnreadCount: () =>
        f<{ unread: number }>("/notifications/me/unread-count"),
      markRead: (id: string) =>
        f<Notification>(`/notifications/${id}/read`, { method: "POST" }),
      markAllRead: () =>
        f<{ updated: number }>("/notifications/me/read-all", {
          method: "POST"
        }),
      listNotifications: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          status?: NotificationStatus;
          recipientPersonId?: string;
          templateCode?: string;
          channel?: NotificationChannel;
        } = {}
      ) => f<Page<Notification>>(`/notifications${qs(q)}`),
      getNotification: (id: string) =>
        f<Notification>(`/notifications/${id}`),
      forPerson: (personId: string) =>
        f<Notification[]>(`/notifications/for-person/${personId}`),
      retry: (id: string) =>
        f<Notification>(`/notifications/${id}/retry`, { method: "POST" }),
      flushQueued: () =>
        f<{ sent: number; failed: number }>(`/notifications/flush`, {
          method: "POST"
        }),

      // Templates
      listTemplates: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          code?: string;
          channel?: "email" | "sms" | "in_app";
          locale?: string;
        } = {}
      ) =>
        f<Page<NotificationTemplate>>(`/notification-templates${qs(q)}`),
      getTemplate: (id: string) =>
        f<NotificationTemplate>(`/notification-templates/${id}`),
      upsertTemplate: (body: {
        orgId?: string | null;
        code: string;
        channel: "email" | "sms" | "in_app";
        locale?: string;
        subject?: string | null;
        bodyTemplate: string;
        variables?: string[];
        isActive?: boolean;
      }) =>
        f<NotificationTemplate>("/notification-templates", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      deleteTemplate: (id: string) =>
        f<{ ok: true }>(`/notification-templates/${id}`, { method: "DELETE" })
    },

    orgs: {
      list: (
        q: {
          limit?: number;
          cursor?: string;
          search?: string;
          status?: string;
          orgType?: string;
        } = {}
      ) => f<Page<Org>>(`/orgs${qs(q)}`),
      get: (id: string) => f<Org>(`/orgs/${id}`),
      create: (body: {
        slug: string;
        legalName: string;
        displayName: string;
        orgType: Org["orgType"];
        countryCode: string;
        defaultLocale: string;
        defaultCurrency: string;
        defaultTimezone?: string;
      }) => f<Org>("/orgs", { method: "POST", body: JSON.stringify(body) }),
      suspend: (id: string) => f<Org>(`/orgs/${id}/suspend`, { method: "POST" }),
      reactivate: (id: string) => f<Org>(`/orgs/${id}/reactivate`, { method: "POST" }),

      // Org relations (parent/child hierarchy)
      listChildren: (orgId: string) =>
        f<OrgRelation[]>(`/orgs/${orgId}/children`),
      listParents: (orgId: string) =>
        f<OrgRelation[]>(`/orgs/${orgId}/parents`),
      linkOrgs: (body: {
        parentOrgId: string;
        childOrgId: string;
        relation: "sanctions" | "member_of" | "owns";
      }) =>
        f<OrgRelation>("/orgs/relations", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      unlinkOrgs: (id: string) =>
        f<OrgRelation>(`/orgs/relations/${id}`, { method: "DELETE" })
    },

    crossOrgGrants: {
      list: (q: { userId?: string; orgId?: string }) =>
        f<CrossOrgGrant[]>(`/cross-org-grants${qs(q)}`),
      issue: (body: {
        userId: string;
        fromOrgId: string;
        toOrgId: string;
        permissions?: string[];
      }) =>
        f<CrossOrgGrant>("/cross-org-grants", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      revoke: (id: string) =>
        f<CrossOrgGrant>(`/cross-org-grants/${id}`, { method: "DELETE" })
    },

    leagueMgmt: {
      // Post-flip hierarchy (2026-05-09): Org → League → Season → Division.
      listSeasons: (
        q: {
          leagueId?: string;
          orgId?: string;
          sportCode?: string;
          status?: string;
        } = {}
      ) => f<Page<Season>>(`/league/seasons${qs(q)}`),
      getSeason: (id: string) => f<Season>(`/league/seasons/${id}`),
      createSeason: (body: {
        leagueId: string;
        name: string;
        sportCode: string;
        startDate: string;
        endDate: string;
        timezone?: string;
        registrationOpensAt?: string | null;
        registrationClosesAt?: string | null;
        rosterLockAt?: string | null;
      }) =>
        f<Season>("/league/seasons", { method: "POST", body: JSON.stringify(body) }),
      changeSeasonStatus: (id: string, status: string) =>
        f<Season>(`/league/seasons/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status })
        }),
      updateSeason: (
        id: string,
        body: {
          name?: string;
          startDate?: string;
          endDate?: string;
          timezone?: string;
          registrationOpensAt?: string | null;
          registrationClosesAt?: string | null;
          rosterLockAt?: string | null;
        }
      ) =>
        f<Season>(`/league/seasons/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      /**
       * Patch a season's per-season toggles (`seasons.config` JSONB).
       * Body keys mirror @sportspulse/kernel SeasonConfig — only the
       * keys you pass are updated; the rest survive.
       */
      updateSeasonConfig: (
        id: string,
        body: Partial<{
          requireUsaHockeyId: boolean;
          allowFreeAgent: boolean;
          parentalConsentRequired: boolean;
          requireLiabilityWaiver: boolean;
          requireCodeOfConduct: boolean;
          liabilityWaiverContent: string;
          codeOfConductContent: string;
          maxRosterSize: number;
          rosterLockAt: string;
        }>
      ) =>
        f<{ id: string; config: Record<string, unknown> }>(
          `/league/seasons/${id}/config`,
          { method: "PATCH", body: JSON.stringify(body) }
        ),

      listLeagues: (
        q: { orgId?: string; sportCode?: string; status?: string } = {}
      ) => f<Page<League>>(`/league/leagues${qs(q)}`),
      getLeague: (id: string) => f<League>(`/league/leagues/${id}`),
      createLeague: (body: {
        orgId: string;
        sportCode: string;
        name: string;
        format?: League["format"];
        governingBodyId?: string | null;
        ruleSetId?: string | null;
        /** JSONB — wizard stores slug, branding, privacy here. */
        metadata?: Record<string, unknown>;
      }) =>
        f<League>("/league/leagues", { method: "POST", body: JSON.stringify(body) }),
      updateLeague: (
        id: string,
        body: {
          name?: string;
          format?: League["format"];
          governingBodyId?: string | null;
          ruleSetId?: string | null;
          metadata?: Record<string, unknown>;
        }
      ) =>
        f<League>(`/league/leagues/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      changeLeagueStatus: (id: string, status: string) =>
        f<League>(`/league/leagues/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status })
        }),

      // Reference data — feeds the org-setup wizard's dropdowns.
      listGoverningBodies: (q: { sportCode?: string } = {}) =>
        f<GoverningBody[]>(`/league/governing-bodies${qs(q)}`),
      listAgeGroups: (q: { governingBodyId?: string } = {}) =>
        f<AgeGroup[]>(`/league/age-groups${qs(q)}`),

      listDivisions: (q: { seasonId?: string } = {}) =>
        f<Page<Division>>(`/league/divisions${qs(q)}`),
      getDivision: (id: string) =>
        f<Division>(`/league/divisions/${id}`),
      createDivision: (body: {
        seasonId: string;
        name: string;
        tier?: string | null;
        ageGroupId?: string | null;
        genderEligibility?: "male" | "female" | "mixed" | "open";
        maxTeams?: number | null;
        /** JSONB — game rules: periods, periodLength, clockType, etc. */
        ruleSetOverrides?: Record<string, unknown>;
        /** JSONB — playoff config: enabled, spots, dates, seriesFormat, bracketType, homeIceRule. */
        playoffConfig?: Record<string, unknown>;
      }) =>
        f<Division>("/league/divisions", {
          method: "POST",
          body: JSON.stringify(body)
        }),

      listTeams: (
        q: { orgId?: string; sportCode?: string; status?: string; search?: string } = {}
      ) => f<Page<Team>>(`/league/teams${qs(q)}`),
      getTeam: (id: string) => f<Team>(`/league/teams/${id}`),
      createTeam: (body: {
        orgId: string;
        name: string;
        sportCode: string;
        shortName?: string | null;
        logoUrl?: string | null;
        colors?: Record<string, unknown>;
        homeRink?: string | null;
        /** Optional initial captain — team + role assigned in one tx. */
        captainUserId?: string;
        /** Minimum deposit cents to flip a DTE to confirmed. 0 = auto. */
        confirmationThresholdCents?: number;
      }) =>
        f<Team>("/league/teams", { method: "POST", body: JSON.stringify(body) }),
      updateTeam: (
        id: string,
        body: {
          name?: string;
          shortName?: string | null;
          logoUrl?: string | null;
          colors?: Record<string, unknown>;
          homeRink?: string | null;
          confirmationThresholdCents?: number;
        }
      ) =>
        f<Team>(`/league/teams/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      /** Assign / rotate the team captain (Workflow 7A Phase 1). */
      assignTeamCaptain: (teamId: string, body: { userId: string }) =>
        f<Team>(`/league/teams/${teamId}/captain`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      /** Lifecycle status change — only super/org admin should call. */
      setTeamStatus: (teamId: string, status: "active" | "dissolved") =>
        f<Team>(`/league/teams/${teamId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        })
    },

    registration: {
      listForms: (
        q: {
          orgId?: string;
          scope?: string;
          scopeId?: string;
          purpose?: FormPurpose;
          role?: string;
          search?: string;
        } = {}
      ) => f<Page<RegistrationForm>>(`/registration/forms${qs(q)}`),
      getForm: (id: string) => f<RegistrationForm>(`/registration/forms/${id}`),
      createForm: (body: {
        orgId: string;
        scope: "org" | "league" | "division" | "season";
        scopeId?: string | null;
        seasonId?: string | null;
        name: string;
        description?: string | null;
        purpose?: FormPurpose;
        appliesToRoles?: string[];
      }) =>
        f<RegistrationForm>("/registration/forms", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updateForm: (
        id: string,
        body: {
          name?: string;
          description?: string | null;
          seasonId?: string | null;
          purpose?: FormPurpose;
          appliesToRoles?: string[];
        }
      ) =>
        f<RegistrationForm>(`/registration/forms/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      listFormVersions: (formId: string) =>
        f<FormVersion[]>(`/registration/forms/${formId}/versions`),
      createFormVersion: (
        formId: string,
        body: { schema: Record<string, unknown> }
      ) =>
        f<FormVersion>(`/registration/forms/${formId}/versions`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      publishFormVersion: (formId: string, versionId: string) =>
        f<FormVersion>(
          `/registration/forms/${formId}/versions/${versionId}/publish`,
          { method: "POST" }
        ),

      listRegistrations: (
        q: { orgId?: string; status?: string; subjectPersonId?: string } = {}
      ) => f<Page<Registration>>(`/registration/registrations${qs(q)}`),
      /**
       * Self-scoped variant — returns only the caller's own
       * registrations. Backed by /registration/self/registrations,
       * which is JwtAuthGuard'd (no SuperAdminGuard) so player-web
       * users can hit it without scope errors.
       */
      listMyRegistrations: () =>
        f<{ items: Registration[] }>(`/registration/self/registrations`),
      reviewRegistration: (
        id: string,
        body: { action: "approve" | "reject" | "waitlist" | "start_review"; reason?: string }
      ) =>
        f<Registration>(`/registration/registrations/${id}/review`, {
          method: "POST",
          body: JSON.stringify(body)
        })
    },

    roster: {
      listMemberships: (q: {
        teamId?: string;
        personId?: string;
        seasonId?: string;
        activeOnly?: boolean;
      } = {}) =>
        f<Page<TeamMembership>>(`/roster/memberships${qs(q)}`),
      listMoves: (q: { teamId?: string; personId?: string; seasonId?: string } = {}) =>
        f<Page<RosterMove>>(`/roster/moves${qs(q)}`),
      add: (body: {
        teamId: string;
        personId: string;
        seasonId: string;
        jerseyNumber?: number;
        positionCode?: string;
      }) =>
        f<RosterMove>("/roster/moves/add", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      drop: (body: {
        teamId: string;
        personId: string;
        seasonId: string;
        reason?: string;
      }) =>
        f<RosterMove>("/roster/moves/drop", {
          method: "POST",
          body: JSON.stringify(body)
        })
    },

    gameOps: {
      listGames: (
        q: {
          limit?: number;
          cursor?: string;
          leagueId?: string;
          divisionId?: string;
          teamId?: string;
          status?: GameStatus;
          fromTs?: string;
          toTs?: string;
        } = {}
      ) => f<Page<Game>>(`/games${qs(q)}`),
      getGame: (id: string) => f<Game>(`/games/${id}`),
      createGame: (body: {
        leagueId: string;
        divisionId?: string | null;
        homeTeamId: string;
        awayTeamId: string;
        sportCode: string;
        scheduledStartTsUtc: string;
        tz?: string;
        durationMin?: number;
        venueName?: string | null;
        surfaceLabel?: string | null;
      }) => f<Game>("/games", { method: "POST", body: JSON.stringify(body) }),
      startGame: (id: string) =>
        f<Game>(`/games/${id}/start`, { method: "POST" }),
      applyScore: (id: string, body: { home: number; away: number; period?: number }) =>
        f<Game>(`/games/${id}/score`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      postponeGame: (id: string) =>
        f<Game>(`/games/${id}/postpone`, { method: "POST" }),
      cancelGame: (id: string) =>
        f<Game>(`/games/${id}/cancel`, { method: "POST" }),
      forfeitGame: (id: string, winningTeamId: string) =>
        f<Game>(`/games/${id}/forfeit`, {
          method: "POST",
          body: JSON.stringify({ winningTeamId })
        }),
      finalizeGame: (id: string) =>
        f<Game>(`/games/${id}/finalize`, { method: "POST" }),

      listEvents: (
        q: {
          limit?: number;
          cursor?: string;
          gameId?: string;
          eventType?: string;
          primaryPersonId?: string;
        } = {}
      ) => f<Page<GameEvent>>(`/game-events${qs(q)}`),
      eventsForGame: (gameId: string) =>
        f<GameEvent[]>(`/game-events/for-game/${gameId}`),
      appendEvent: (body: {
        gameId: string;
        eventType: string;
        tsUtc?: string;
        period?: number;
        clockRemainingSec?: number;
        teamId?: string;
        primaryPersonId?: string;
        secondaryPersonIds?: string[];
        attributes?: Record<string, unknown>;
        idempotencyKey?: string;
        correctionOfEventId?: string;
      }) =>
        f<GameEvent>("/game-events", {
          method: "POST",
          body: JSON.stringify(body)
        }),

      listSuspensions: (
        q: { limit?: number; cursor?: string; personId?: string; status?: string } = {}
      ) => f<Page<Suspension>>(`/suspensions${qs(q)}`),
      issueSuspension: (body: {
        personId: string;
        kind: Suspension["kind"];
        sourceEventId?: string | null;
        nGames?: number | null;
        nDays?: number | null;
        reason?: string | null;
      }) =>
        f<Suspension>("/suspensions", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      liftSuspension: (id: string, reason?: string) =>
        f<Suspension>(`/suspensions/${id}/lift`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      serveSuspension: (id: string) =>
        f<Suspension>(`/suspensions/${id}/serve`, { method: "POST" }),

      // Officials
      listOfficials: (gameId: string) =>
        f<GameOfficial[]>(`/games/${gameId}/officials`),
      officialsForPerson: (personId: string) =>
        f<GameOfficial[]>(`/game-officials/for-person/${personId}`),
      assignOfficial: (
        gameId: string,
        body: {
          personId: string;
          role: GameOfficialRole;
          slot?: string | null;
          status?: GameOfficialStatus;
          notes?: string | null;
        }
      ) =>
        f<GameOfficial>(`/games/${gameId}/officials`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updateOfficialStatus: (id: string, status: GameOfficialStatus) =>
        f<GameOfficial>(`/game-officials/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        }),
      revokeOfficial: (id: string) =>
        f<GameOfficial>(`/game-officials/${id}`, { method: "DELETE" })
    },

    stats: {
      listLines: (
        q: {
          limit?: number;
          cursor?: string;
          personId?: string;
          teamId?: string;
          leagueId?: string;
          seasonId?: string;
          divisionId?: string;
          gameId?: string;
        } = {}
      ) => f<Page<StatLine>>(`/stats/lines${qs(q)}`),
      linesForGame: (gameId: string) =>
        f<StatLine[]>(`/stats/lines/for-game/${gameId}`),
      project: (gameId: string, allowInProgress?: boolean) =>
        f<{ linesWritten: number }>(`/stats/games/${gameId}/project`, {
          method: "POST",
          body: JSON.stringify({ allowInProgress: allowInProgress ?? false })
        }),
      standings: (leagueId: string, divisionId?: string) =>
        f<Standing[]>(`/stats/standings/${leagueId}${qs({ divisionId })}`),
      recomputeStandings: (
        leagueId: string,
        body: { ppw?: number; ppl?: number; ppt?: number; ppotl?: number } = {}
      ) =>
        f<Standing[]>(`/stats/standings/${leagueId}/recompute`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      buildLeaderboard: (body: {
        scopeType: "platform" | "org" | "league" | "division";
        scopeId?: string | null;
        metric: string;
        windowKind?: "season" | "last_n" | "all_time";
        sportCode: string;
        topN?: number;
        leagueId?: string;
        divisionId?: string;
      }) =>
        f<Leaderboard>("/stats/leaderboards", {
          method: "POST",
          body: JSON.stringify(body)
        })
    },

    admin: {
      // Settings
      listSettings: (q: { category?: string } = {}) =>
        f<SystemSetting[]>(`/admin/settings${qs(q)}`),
      upsertSetting: (body: {
        key: string;
        category?: string;
        value: unknown;
        description?: string | null;
        isEditable?: boolean;
      }) =>
        f<SystemSetting>("/admin/settings", {
          method: "POST",
          body: JSON.stringify(body)
        }),

      // Flags
      listFlags: () => f<FeatureFlag[]>("/admin/flags"),
      upsertFlag: (body: {
        key: string;
        description?: string | null;
        isEnabled?: boolean;
        rolloutPct?: number;
        orgAllowlist?: string[];
        variants?: Array<{ name: string; weight?: number; payload?: unknown }>;
      }) =>
        f<FeatureFlag>("/admin/flags", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      deleteFlag: (key: string) =>
        f<{ ok: true }>(`/admin/flags/${encodeURIComponent(key)}`, {
          method: "DELETE"
        }),

      // Sports
      listSports: () => f<Sport[]>("/admin/sports"),
      updateSport: (
        code: string,
        body: {
          active?: boolean;
          teamSizeDefault?: number | null;
          scoringModel?: Record<string, unknown>;
        }
      ) =>
        f<Sport>(`/admin/sports/${encodeURIComponent(code)}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),

      // Health
      health: () => f<PlatformHealth>("/admin/health")
    },

    dataMigration: {
      supportedKinds: () => f<{ kinds: ImportEntityKind[] }>("/imports/supported"),
      listJobs: (
        q: {
          limit?: number;
          cursor?: string;
          orgId?: string;
          entityKind?: ImportEntityKind;
          status?: ImportStatus;
        } = {}
      ) => f<Page<ImportJob>>(`/imports${qs(q)}`),
      getJob: (id: string) => f<ImportJob>(`/imports/${id}`),
      jobRows: (id: string, status?: "ok" | "failed" | "skipped") =>
        f<ImportJobRowEntry[]>(`/imports/${id}/rows${qs({ status })}`),
      runImport: (body: {
        entityKind: ImportEntityKind;
        csv: string;
        orgId?: string | null;
        sourceFilename?: string | null;
      }) =>
        f<ImportJob>("/imports", {
          method: "POST",
          body: JSON.stringify(body)
        })
    },

    // Registration v2 admin review queue (Workflow 1 v2 §8).
    // Lives alongside the legacy `registration.reviewRegistration`
    // because the v2 actions (request_resubmission, override_flag,
    // bulk variants) don't fit the v1 contract.
    registrationV2Admin: {
      listSubmissions: (
        q: {
          status?: string;
          statuses?: string;
          orgId?: string;
          search?: string;
          limit?: number;
        } = {}
      ) =>
        f<{
          items: Array<{
            id: string;
            status: string;
            orgId: string;
            createdAt: string;
            submittedAt: string | null;
            reviewedAt: string | null;
            decisionReason: string | null;
            metadata: Record<string, unknown>;
          }>;
        }>(`/registration-v2/admin/submissions${qs(q)}`),
      review: (
        id: string,
        body: {
          action:
            | "approve"
            | "reject"
            | "request_resubmission"
            | "override_flag";
          reason?: string;
          flagKey?: string;
        }
      ) =>
        f<{
          id: string;
          status: string | null;
          error?: string;
          flagOverridden?: string;
        }>(`/registration-v2/admin/submissions/${id}/review`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      bulkApprove: (ids: string[]) =>
        f<{
          matched: number;
          applied: number;
          skipped: number;
          emailDelivered: number;
        }>(`/registration-v2/admin/submissions/bulk-approve`, {
          method: "POST",
          body: JSON.stringify({ ids })
        }),
      bulkReject: (ids: string[], reason: string) =>
        f<{
          matched: number;
          applied: number;
          skipped: number;
          emailDelivered: number;
        }>(`/registration-v2/admin/submissions/bulk-reject`, {
          method: "POST",
          body: JSON.stringify({ ids, reason })
        }),
      bulkEmail: (ids: string[], subject: string, body: string) =>
        f<{
          matched: number;
          delivered: number;
          logOnly: number;
        }>(`/registration-v2/admin/submissions/bulk-email`, {
          method: "POST",
          body: JSON.stringify({ ids, subject, body })
        })
    },

    // Registration v2 — pricing tiers, email templates, team invites,
    // free agent pool. Backed by apps/superadmin-api/src/modules/registration-v2.
    registrationV2: {
      listPricingTiers: (q: { seasonId?: string } = {}) =>
        f<PricingTier[]>(`/registration-v2/pricing-tiers${qs(q)}`),
      getPricingTier: (id: string) =>
        f<PricingTier>(`/registration-v2/pricing-tiers/${id}`),
      createPricingTier: (body: PricingTierInput) =>
        f<PricingTier>("/registration-v2/pricing-tiers", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updatePricingTier: (id: string, body: Partial<PricingTierInput>) =>
        f<PricingTier>(`/registration-v2/pricing-tiers/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      deletePricingTier: (id: string) =>
        f<{ id: string }>(`/registration-v2/pricing-tiers/${id}`, {
          method: "DELETE"
        }),

      // N:M tier ↔ division assignments (Registration setup wizard's
      // "Assign divisions to pricing tier" checkbox grid).
      listTierDivisions: (tierId: string) =>
        f<Array<{ id: string; pricingTierId: string; divisionId: string; createdAt: string }>>(
          `/registration-v2/pricing-tier-divisions/${tierId}`
        ),
      replaceTierDivisions: (tierId: string, divisionIds: string[]) =>
        f<Array<{ id: string; pricingTierId: string; divisionId: string; createdAt: string }>>(
          `/registration-v2/pricing-tier-divisions/${tierId}`,
          { method: "PUT", body: JSON.stringify({ divisionIds }) }
        ),
      tierDivisionsByTiers: (tierIds: string[]) =>
        f<Record<string, string[]>>(
          `/registration-v2/pricing-tier-divisions${qs({ ids: tierIds.join(",") })}`
        ),

      listEmailTemplates: (q: { seasonId?: string } = {}) =>
        f<EmailTemplate[]>(`/registration-v2/email-templates${qs(q)}`),
      getEmailTemplate: (id: string) =>
        f<EmailTemplate>(`/registration-v2/email-templates/${id}`),
      createEmailTemplate: (body: EmailTemplateInput) =>
        f<EmailTemplate>("/registration-v2/email-templates", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      updateEmailTemplate: (id: string, body: Partial<EmailTemplateInput>) =>
        f<EmailTemplate>(`/registration-v2/email-templates/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
      deleteEmailTemplate: (id: string) =>
        f<{ id: string }>(`/registration-v2/email-templates/${id}`, {
          method: "DELETE"
        }),

      listTeamInvites: (q: { teamId?: string; seasonId?: string; status?: string } = {}) =>
        f<TeamInvite[]>(`/registration-v2/team-invites${qs(q)}`),
      createTeamInvite: (body: {
        teamId: string;
        seasonId: string;
        kind?: "personal" | "generic";
        inviteeEmail?: string;
      }) =>
        f<TeamInvite>("/registration-v2/team-invites", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      revokeTeamInvite: (id: string) =>
        f<TeamInvite>(`/registration-v2/team-invites/${id}/revoke`, {
          method: "PATCH"
        }),

      // Free-agent pool — captains read + place; players upsert their
      // own entry to advertise themselves between seasons. The pool
      // table is the Path 2C marketplace from registration-v2 schema.
      listFreeAgentPool: (q: { seasonId?: string } = {}) =>
        f<FreeAgentPoolEntry[]>(
          `/registration-v2/free-agent-pool${qs(q)}`
        ),
      upsertFreeAgentEntry: (body: {
        playerPersonId: string;
        seasonId: string;
        positions: string[];
        availability?: Record<string, unknown>;
        levelPrimary: "A" | "B" | "C" | "D";
        levelFlexibility?: string[];
        note?: string;
      }) =>
        f<FreeAgentPoolEntry>("/registration-v2/free-agent-pool", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      placeFreeAgent: (id: string, body: { teamId: string }) =>
        f<FreeAgentPoolEntry>(
          `/registration-v2/free-agent-pool/${id}/place`,
          { method: "PATCH", body: JSON.stringify(body) }
        ),

      rolloverSeason: (targetSeasonId: string, sourceSeasonId: string) =>
        f<{
          sourceSeasonId: string;
          targetSeasonId: string;
          copiedPricingTiers: number;
          copiedEmailTemplates: number;
        }>(`/registration-v2/seasons/${targetSeasonId}/rollover`, {
          method: "POST",
          body: JSON.stringify({ sourceSeasonId })
        })
    },

    // Public, anonymous endpoints for the player registration funnel
    // (Workflow 1 v2). No JWT required — the funnel runs before the
    // visitor has an account. The Account step in the funnel binds the
    // resulting draft submission to a real auth user.
    publicRegistration: {
      /**
       * List every season currently open for public registration that
       * also has a published form attached. Drives the player-web
       * discovery list at /register so players can find a season to
       * sign up for without needing a captain's invite URL.
       */
      listOpen: () =>
        f<{
          items: Array<{
            seasonId: string;
            seasonName: string;
            sportCode: string;
            leagueId: string;
            leagueName: string;
            orgId: string;
            orgName: string;
            formId: string;
            formName: string;
            registrationOpensAt: string | null;
            registrationClosesAt: string | null;
          }>;
        }>(`/public/registration/open`),
      getSeasonContext: (seasonId: string) =>
        f<PublicSeasonContext>(`/public/registration/seasons/${seasonId}`),
      startSubmission: (
        seasonId: string,
        body: {
          email: string;
          password: string;
          fullName: string;
          phone?: string;
          dobDate?: string;
          pricingTierId?: string;
          submissionType?:
            | "team"
            | "individual"
            | "free_agent"
            | "captain_invite";
          answers?: Record<string, unknown>;
        }
      ) =>
        f<{
          id: string;
          status: string;
          resumed: boolean;
          userId: string;
          userCreated: boolean;
          isMinor: boolean;
        }>(`/public/registration/seasons/${seasonId}/submissions`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      getSubmission: (id: string, email: string) =>
        f<{
          id: string;
          status: string;
          submissionType: string;
          pricingTierId: string | null;
          email: string;
          fullName: string | null;
          phone: string | null;
          dobDate: string | null;
          isMinor: boolean;
          answers: Record<string, unknown>;
        }>(`/public/registration/submissions/${id}${qs({ email })}`),
      cancelSubmission: (id: string, email: string) =>
        f<{ id: string; status: "cancelled" }>(
          `/public/registration/submissions/${id}/cancel`,
          {
            method: "POST",
            body: JSON.stringify({ email })
          }
        ),
      listWaivers: (seasonId: string) =>
        f<{
          requiredKinds: string[];
          documents: Array<{
            documentId: string;
            kind: string;
            name: string;
            description: string | null;
            versionId: string;
            contentHtml: string;
            languageCode: string;
          }>;
        }>(`/public/registration/seasons/${seasonId}/waivers`),
      signWaiver: (
        submissionId: string,
        body: { email: string; documentVersionId: string; signatureName: string }
      ) =>
        f<{ signatureId: string; outstandingRequired: number }>(
          `/public/registration/submissions/${submissionId}/sign-waiver`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      startParentalConsent: (
        submissionId: string,
        body: { email: string; parentEmail: string }
      ) =>
        f<{
          consentToken: string;
          mockConsentMessage: { to: string; subject: string; body: string };
        }>(
          `/public/registration/submissions/${submissionId}/parental-consent/start`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      confirmParentalConsent: (
        submissionId: string,
        body: { email: string; consentToken: string }
      ) =>
        f<{ id: string; status: "pending_payment" }>(
          `/public/registration/submissions/${submissionId}/parental-consent/confirm`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      runEligibilityCheck: (submissionId: string, email: string) =>
        f<{ passed: boolean; flags: string[] }>(
          `/public/registration/submissions/${submissionId}/eligibility-check`,
          { method: "POST", body: JSON.stringify({ email }) }
        ),
      pay: (
        submissionId: string,
        body: {
          email: string;
          mockOutcome?: "succeeded" | "failed" | "offline";
        }
      ) =>
        f<{
          id: string;
          status:
            | "pending_review"
            | "pending_payment"
            | "pending_offline";
          invoiceId: string | null;
          amountCents?: number;
          currency?: string;
          mock: boolean;
          declineReason?: string;
        }>(`/public/registration/submissions/${submissionId}/pay`, {
          method: "POST",
          body: JSON.stringify(body)
        })
    },

    // Workflow 7A · captain console (team-admin-web rollover wizard).
    captain: {
      /**
       * Returns the team's current registration mode. `registration_open`
       * = the green pulsing banner + sidebar item should render.
       */
      dashboardState: (teamId: string) =>
        f<{
          mode:
            | "off_season"
            | "registration_open"
            | "applied"
            | "in_season"
            | "post_season";
          teamId: string;
          seasonId: string | null;
          leagueId: string | null;
          seasonName: string | null;
          leagueName: string | null;
          divisionTeamEntryId: string | null;
          entryStatus: string | null;
          registrationClosesAt: string | null;
          collectedCents: number;
          thresholdCents: number;
        }>(`/captain/dashboard-state${qs({ teamId })}`),
      /**
       * Divisions for a season, with their pricing tier and a live
       * team-count. Powers wizard step 2.
       */
      listDivisions: (seasonId: string) =>
        f<{
          season: {
            id: string;
            name: string;
            registrationClosesAt: string | null;
          };
          items: Array<{
            id: string;
            name: string;
            tier: string | null;
            genderEligibility: string;
            maxTeams: number | null;
            currentTeamCount: number;
            pricing: {
              tierId: string;
              name: string;
              currency: string;
              fullPriceCents: number;
              paymentPlanEnabled: boolean;
              depositCents: number;
              installmentCount: number;
              installmentIntervalDays: number;
            } | null;
          }>;
        }>(`/captain/divisions${qs({ seasonId })}`),
      /**
       * Workflow 7A § 4.4 — atomic 8-write submit. Throws on validation
       * or transaction failure; nothing is created on the back end.
       */
      register: (body: {
        teamId: string;
        divisionId: string;
        splitMode: "even" | "custom";
        playerSplits: Array<{
          personId?: string;
          email?: string;
          amountCents: number;
        }>;
      }) =>
        f<{
          divisionTeamEntryId: string;
          entryStatus: string;
          masterInvoiceId: string;
          subInvoiceCount: number;
          inviteCount: number;
        }>(`/captain/register`, {
          method: "POST",
          body: JSON.stringify(body)
        }),
      /** Poll while entryStatus = 'applied'. Returns 0..100 pct. */
      registerStatus: (dteId: string) =>
        f<{
          entryStatus: string;
          collectedCents: number;
          thresholdCents: number;
          pct: number;
        }>(`/captain/register/status${qs({ dteId })}`),
      /** Manual / webhook-driven watcher trigger. Idempotent. */
      recomputeThreshold: (dteId: string) =>
        f<{
          entryStatus: string;
          collectedCents: number;
          thresholdCents: number;
          transitioned: boolean;
        }>(`/captain/register/${dteId}/recompute-threshold`, {
          method: "POST"
        }),

      // ---------------------------------------------------------------
      // Workflow 7B · roster management
      // ---------------------------------------------------------------
      roster: {
        list: (teamId: string, seasonId?: string) =>
          f<{
            team: { id: string; name: string };
            season: {
              id: string;
              name: string;
              rosterLockAt: string | null;
            } | null;
            division: {
              id: string;
              name: string;
              tier: string | null;
            } | null;
            rules: {
              maxRosterSize: number;
              minGamesForPlayoffs: number;
              maxGuestPlayersPerGame: number;
              guestPlayerSeasonLimit: number;
              ageMinYears?: number;
              ageMaxYears?: number;
            };
            memberships: Array<{
              id: string;
              personId: string;
              membershipType: string;
              currentStatus: string;
              effectiveFrom: string;
              jerseyNumber: number | null;
              positionCode: string | null;
              personFirstName: string | null;
              personLastName: string | null;
              personEmail: string | null;
              personDob: string | null;
            }>;
            invites: Array<{
              id: string;
              email: string | null;
              status: string;
              expiresAt: string | null;
              sendCount: number;
              extensionCount: number;
              lastSentAt: string | null;
              createdAt: string;
            }>;
            rosterLockAt: string | null;
            isLocked: boolean;
          }>(`/captain/roster/${teamId}${qs({ seasonId })}`),
        add: (
          teamId: string,
          body: {
            seasonId: string;
            personId: string;
            jerseyNumber?: number;
            positionCode?: string;
          }
        ) =>
          f<{ move: unknown; membership: unknown }>(
            `/captain/roster/${teamId}/add`,
            { method: "POST", body: JSON.stringify(body) }
          ),
        drop: (
          teamId: string,
          body: { seasonId: string; personId: string; reason: string }
        ) =>
          f<{
            move: unknown;
            refundAssessment: { id: string; status: string } | null;
            voidedInvoiceId: string | null;
          }>(`/captain/roster/${teamId}/drop`, {
            method: "POST",
            body: JSON.stringify(body)
          }),
        invite: (
          teamId: string,
          body: { seasonId: string; email: string; splitAmountCents?: number }
        ) =>
          f<{
            invite: {
              id: string;
              token: string;
              expiresAt: string | null;
              inviteeEmail: string | null;
            };
          }>(`/captain/roster/${teamId}/invite`, {
            method: "POST",
            body: JSON.stringify(body)
          }),
        remind: (teamId: string, inviteId: string) =>
          f<{
            invite: {
              id: string;
              status: string;
              expiresAt: string | null;
              extensionCount: number;
            };
          }>(`/captain/roster/${teamId}/remind/${inviteId}`, {
            method: "POST"
          }),
        guest: (
          teamId: string,
          body: {
            seasonId: string;
            gameId: string;
            personId?: string;
            guestName?: string;
          }
        ) =>
          f<{ attendance: unknown }>(`/captain/roster/${teamId}/guest`, {
            method: "POST",
            body: JSON.stringify(body)
          }),
        // Workflow 7B · Case 6 — three-actor transfer flow.
        transfers: {
          initiate: (
            fromTeamId: string,
            body: { personId: string; toTeamId: string; reason: string }
          ) =>
            f<{ transfer: TransferRequest }>(
              `/league/teams/${fromTeamId}/transfer`,
              { method: "POST", body: JSON.stringify(body) }
            ),
          accept: (transferId: string) =>
            f<{ transfer: TransferRequest }>(
              `/league/teams/transfer/${transferId}/accept`,
              { method: "POST" }
            ),
          cancel: (transferId: string) =>
            f<{ transfer: TransferRequest }>(
              `/league/teams/transfer/${transferId}/cancel`,
              { method: "POST" }
            ),
          captainReject: (transferId: string, reason: string) =>
            f<{ transfer: TransferRequest }>(
              `/league/teams/transfer/${transferId}/captain-reject`,
              { method: "POST", body: JSON.stringify({ reason }) }
            ),
          listIncoming: (teamId: string) =>
            f<{ items: TransferRequest[] }>(
              `/captain/transfers/incoming/${teamId}`
            ),
          listOutgoing: (teamId: string) =>
            f<{ items: TransferRequest[] }>(
              `/captain/transfers/outgoing/${teamId}`
            )
        }
      }
    },

    adminTransfers: {
      list: (q: { status?: string; orgId?: string } = {}) =>
        f<{ items: TransferRequest[] }>(`/league/admin/transfers${qs(q)}`),
      approve: (transferId: string) =>
        f<{
          transfer: TransferRequest;
          destinationInvoiceId: string | null;
        }>(`/league/teams/transfer/${transferId}/approve`, { method: "POST" }),
      reject: (transferId: string, reason: string) =>
        f<{ transfer: TransferRequest }>(
          `/league/teams/transfer/${transferId}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) }
        ),
      rejectDivisionEntry: (entryId: string, reason: string) =>
        f<{ entryId: string; status: "rejected" }>(
          `/league/division-team-entries/${entryId}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) }
        ),
      noShowReport: (q: { lastSeasonId: string; newSeasonId: string }) =>
        f<{
          items: Array<{
            teamId: string;
            teamName: string;
            lastDivisionId: string;
            lastDivisionName: string;
            captainEmail: string | null;
            captainName: string | null;
          }>;
        }>(`/league/reports/no-show${qs(q)}`)
    }
  };
}

// ----- transfer request type -----
export interface TransferRequest {
  id: string;
  orgId: string;
  seasonId: string;
  personId: string;
  fromTeamId: string;
  toTeamId: string;
  status:
    | "pending_destination"
    | "pending_admin"
    | "approved"
    | "rejected"
    | "cancelled";
  reason: string | null;
  initiatedByUserId: string | null;
  initiatedAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  destinationInvoiceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ----- public registration types -----
import type { FormDefinition } from "@sportspulse/kernel";

export interface PublicSeasonContext {
  season: {
    id: string;
    name: string;
    sportCode: string;
    startDate: string;
    endDate: string;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    rosterLockAt: string | null;
    status: string;
  };
  pricingTiers: PricingTier[];
  formVersionId: string | null;
  formDefinition: FormDefinition;
}

// ----- registration v2 types -----
export interface PricingTier {
  id: string;
  seasonId: string;
  name: string;
  code: string | null;
  description: string | null;
  divisionId: string | null;
  currency: string;
  fullPriceCents: number;
  isFree: boolean;
  paymentPlanEnabled: boolean;
  depositCents: number;
  installmentCount: number;
  installmentIntervalDays: number;
  lateFeeCents: number;
  usageLimit: number | null;
  usageCount: number;
  customUrlSlug: string | null;
  isReturningTeamPricing: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PricingTierInput {
  seasonId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  divisionId?: string | null;
  currency?: string;
  fullPriceCents: number;
  isFree?: boolean;
  paymentPlanEnabled?: boolean;
  depositCents?: number;
  installmentCount?: number;
  installmentIntervalDays?: number;
  lateFeeCents?: number;
  usageLimit?: number | null;
  customUrlSlug?: string | null;
  isReturningTeamPricing?: boolean;
  isActive?: boolean;
}

export type EmailEventType =
  | "on_payment"
  | "on_approved"
  | "on_rejected"
  | "installment_reminder"
  | "season_closing"
  | "parental_consent"
  | "custom";
export type EmailTypeFilter = "all" | "team" | "individual";

export interface EmailTemplate {
  id: string;
  seasonId: string;
  eventType: EmailEventType;
  registrationTypeFilter: EmailTypeFilter;
  subject: string;
  bodyHtml: string;
  attachmentPath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateInput {
  seasonId: string;
  eventType: EmailEventType;
  registrationTypeFilter?: EmailTypeFilter;
  subject: string;
  bodyHtml: string;
  attachmentPath?: string | null;
  isActive?: boolean;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  seasonId: string;
  inviteeEmail: string | null;
  token: string;
  kind: "personal" | "generic";
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type Api = ReturnType<typeof createApi>;
