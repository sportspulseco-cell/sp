# SportsPulse — App Architecture (DDD, multi-app, shared DB)

Every user-facing app is its own deployable, but they all read/write the same Postgres (Supabase) through the same shared schema and DAL.

## Layout

```
sportspulse/
├── apps/
│   ├── superadmin-api/       NestJS — Super Admin API (DDD)
│   ├── superadmin-web/       Next.js — Super Admin web app
│   ├── (future) org-admin-api / org-admin-web
│   ├── (future) captain-api / captain-mobile
│   ├── (future) ref-api / ref-mobile
│   └── (future) scorekeeper-tablet
└── packages/
    ├── db/                   Drizzle schema + migrations  (single source of truth)
    ├── kernel/               DDD primitives (Entity, AggregateRoot, ValueObject, Result, errors)
    └── auth/                 Supabase JWT verifier (server) + SSR client (web)
```

## Layered architecture per backend app

For each bounded context (module) inside a Nest app:

```
modules/<context>/
├── domain/
│   ├── entities/             Aggregates with behavior, no infra dependencies
│   ├── value-objects/        Immutable, equality by structure
│   ├── identifiers.ts        Branded UUID types (UserId, OrgId, …)
│   ├── repositories/         Repository INTERFACES (DIP — depend on abstraction)
│   ├── services/             Pure domain logic spanning multiple aggregates
│   └── events/               DomainEvent classes
├── application/
│   ├── commands/             CommandHandler<TCommand, TResult>      (mutations)
│   ├── queries/              QueryHandler<TQuery, TResult>          (reads)
│   └── dtos/                 Outbound DTOs — never expose aggregates
├── infrastructure/
│   ├── repositories/         Drizzle implementations of domain repos
│   └── adapters/             External services (Stripe, Twilio, …)
└── interface/
    ├── controllers/          REST controllers / GraphQL resolvers
    └── dto/                  Inbound request DTOs (class-validator)
```

## SOLID applied

- **SRP** — one handler per use case (`SuspendProfileHandler`, `ListProfilesHandler` …)
- **OCP** — entities raise domain events; new behavior plugs in as new event subscribers, not edits to the aggregate
- **LSP** — repository interfaces in `domain/`; any infra impl is substitutable
- **ISP** — small, focused ports (`ProfileRepository`, not a "UserRepository" mega-interface)
- **DIP** — controllers depend on application handlers; handlers depend on domain repository interfaces; only `iam.module.ts` knows the concrete `DrizzleProfileRepository`

## Cross-app rules

- **Shared DB, separate apps.** Never import another app's code. Both apps share `@sportspulse/db` and `@sportspulse/kernel`.
- **Schema migrations only via `@sportspulse/db`.** Apps never run DDL.
- **Multi-tenancy** is enforced in Postgres (RLS) — apps still apply tenant filters in queries, but RLS is the safety net.
- **Auth** is uniform: Supabase issues JWTs; every API verifies the same way via `@sportspulse/auth`.
- **Authorization differs per app.** Super-admin app gates on `profiles.is_super_admin`. Future apps gate on role assignments scoped to that app's bounded context (org admin, captain, ref, etc.).

## Adding a new bounded context (e.g. League Management)

1. Create `apps/superadmin-api/src/modules/league/` mirroring the IAM tree above.
2. Define identifiers, VOs, aggregates, and repository interfaces in `domain/`.
3. Add Drizzle implementations in `infrastructure/repositories/`.
4. Add command + query handlers in `application/`.
5. Wire a controller in `interface/`.
6. Register everything in `<context>.module.ts` and import it from `app.module.ts`.

## Adding a new app (e.g. Org Admin)

1. `cp -r apps/superadmin-api apps/orgadmin-api && cp -r apps/superadmin-web apps/orgadmin-web`
2. Replace `SuperAdminGuard` with `OrgAdminGuard` (gates on `user_role_assignments` for `scope_type='org'`).
3. Trim modules / endpoints to only what that role needs.
4. Same DB, same kernel, same auth package.
