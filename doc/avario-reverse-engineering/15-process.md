# Avario Process — long-running job inbox

URL: `/Process/Process.aspx`. Page title: "Process".

A minimal page — surface for **long-running background jobs**
initiated elsewhere in the app. When a scheduler kicks off a
schedule generation, a publish broadcast, a SportsEngine push,
or a bulk import, that job runs asynchronously on the server and
its progress shows up here.

## Layout

- **Include Closed** checkbox — by default the list hides
  completed/closed jobs; check to see history
- Page size: 10 / 25 / 50 / 100 (default 50)
- Empty state: "No Items to Display"

That's the entire page. The empty grid implies columns/state we
can't enumerate without an active job — likely something like:

| Column (inferred) | Notes |
|---|---|
| Job type | "Schedule Gen", "SE Push", "Import Events", etc. |
| Initiated by | User who kicked it off |
| Started | Timestamp |
| Progress | %, or step counter |
| Status | Running / Closed / Failed |
| Result | Link to output or error detail |

## Key observations

1. **Async job tracking is a first-class operator surface.** Avario
   treats it like an email inbox: a top-nav tab. The fact that it
   has filtering (Include Closed) + pagination (10–100 per page)
   suggests dozens to hundreds of jobs over time — schedule
   generation alone can be N runs per week per league.
2. **No "kick off a job here" affordance** — Process is read-only.
   Jobs are initiated from the module that owns the work
   (Schedule, Publish, etc.). Process exists to monitor them after
   the fact.
3. **Closed jobs are retained** — Include Closed implies job
   history is persisted (audit / debug / rerun reference). Avario
   doesn't garbage-collect outcomes aggressively.

## SportsPulse equivalence

We currently have one cron-style background job (season
auto-transition) and no operator-visible surface for it. As we
add async jobs (Reconcile cron, SE push, schedule generation,
QuickBooks invoice export), we need an inbox.

- New table `background_jobs`:
  - id, job_type (enum), initiated_by_user_id, org_id, season_id,
    payload jsonb, state (queued | running | succeeded | failed |
    cancelled), progress_pct, started_at, finished_at, error
- Use BullMQ (or Inngest/Trigger.dev) as the queue runner;
  background_jobs is the audit/UX read-model
- **superadmin-web `/operations/jobs`** page mirroring Avario's
  Process tab:
  - Filter: include closed
  - Per-row: type · initiator · started · progress · status · view
  - Real-time refresh (SSE or 5s poll) for running jobs
  - Click-through to job detail with full payload + error
  - Re-run failed jobs (admin-only)
- **Generic job kicker pattern**: every place that triggers a
  long-running job creates a `background_jobs` row and returns the
  id to the caller. Caller can deep-link to `/operations/jobs/:id`
  for tracking.
- **Job retention**: keep closed jobs 90 days, then archive.
- **Notification on failure**: alert the initiator + on-call.
