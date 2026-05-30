---
title: SportsPulse Scheduler Solver
emoji: 🏒
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: CP-SAT scheduler for SportsPulse leagues
---

# scheduler-solver

CP-SAT solver service for the SportsPulse scheduler. Implements the
`/solve` endpoint against the wire contract defined in
[`packages/scheduler-core/src/contracts.ts`](../../packages/scheduler-core/src/contracts.ts).

Hosted on Hugging Face Spaces (Docker SDK, free tier — 16 GB RAM,
2 vCPU). The same `Dockerfile` redeploys to Cloud Run / Fly / Oracle
Free Ampere with no app-code change if HF's free terms ever shift.

## Endpoints

### `GET /health`
Liveness probe — also used by the orchestrator as a warm-keeper target.

```bash
curl https://<your-space>.hf.space/health
# {"ok":true,"service":"scheduler-solver","version":"0.1.0"}
```

### `POST /solve`
Body: a `SolveRequest` JSON. Returns a `SolveResponse`. See the TS
contract for field-level docs.

```bash
curl -X POST https://<your-space>.hf.space/solve \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SOLVER_API_KEY" \
  -d @example-request.json
```

## What this build handles

| Constraint | Kind | Status |
|---|---|---|
| Each fixture placed exactly once | hard | ✅ |
| Slot single-occupancy (no venue/surface double-book) | hard | ✅ |
| Per-team non-overlap across slot intervals | hard | ✅ |
| Locked fixtures pinned to assigned slot | hard | ✅ |
| Playoff-reservation slots excluded from regular-season pool | hard | ✅ |
| Time-slot fairness (per-team band balance) | soft | next iteration |
| Home/away balance | soft | next iteration |
| Gap balance | soft | next iteration |

Infeasibility (timeout or unsatisfiable hard constraints) returns
`status: "INFEASIBLE" | "TIMEOUT"` plus an `InfeasibilityReport` —
never a silent failure.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `SOLVER_API_KEY` | **production** | When set, the `/solve` endpoint requires the same value in the `X-API-Key` header. Unset → dev-open mode. Set this in the HF Space's **Settings → Secrets** before exposing the URL beyond your orchestrator. |
| `PORT` | no | Defaults to `7860` (HF). Cloud Run sets `8080` automatically. |

## Local development

```bash
cd apps/scheduler-solver
docker build -t scheduler-solver .
docker run --rm -p 7860:7860 -e SOLVER_API_KEY=dev scheduler-solver
curl http://localhost:7860/health
```

## Deploy / redeploy

This directory is the HF Space's git root. Re-running `deploy.py` from
this directory pushes the current state to the Space and triggers a
rebuild (Docker layer cache on HF means subsequent builds are quick
unless `requirements.txt` changed).

```bash
HF_TOKEN=hf_xxx python deploy.py
```

`deploy.py` uses the `huggingface_hub` Python API: creates the Space
if missing (Docker SDK), uploads everything except deploy-side files
(see `deploy.py` for the ignore list), and prints the Space URL.

## Source of truth

The TypeScript contract in `packages/scheduler-core/src/contracts.ts`
is canonical. The Pydantic models in `main.py` mirror it 1:1. If
either side changes, both sides change in the same PR — the orchestrator
fails fast (Pydantic validation) the moment they drift.
