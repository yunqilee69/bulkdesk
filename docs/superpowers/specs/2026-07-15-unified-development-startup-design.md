# Unified Development Startup Design

## Goal

Provide one project-root command that starts the frontend and backend development
servers together, makes interleaved output attributable at a glance, and retains
the raw development history by service for the day.

## Interface

Add an executable `dev.sh` at the repository root. Running `./dev.sh` starts:

- backend: `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9000`
  from `backend/`;
- frontend: `PORT=8888 API_TARGET=http://localhost:9000 npm run dev` from
  `frontend/`.

The frontend proxy already reads `API_TARGET`, so the script changes no frontend
application code. The default ports are deliberately supplied by the script to
make the combined development entry point deterministic.

## Log Presentation And Retention

For the current local date, the script creates `logs/YYYY-MM-DD/` at the
repository root. It appends backend output to `backend.log` and frontend output
to `frontend.log` within that directory.

Every emitted line is formatted identically in the terminal and in its
service-specific file:

```
[YYYY-MM-DD HH:MM:SS] [backend] message
[YYYY-MM-DD HH:MM:SS] [frontend] message
```

Before a new run appends to either file, it writes a timestamped session
separator. This keeps multiple same-day runs distinguishable without creating
an unbounded directory tree. Standard output and standard error are both
captured so startup failures and application errors remain visible and
persisted.

## Process Lifecycle

The script verifies that `uv` and `npm` are available, that the `backend/` and
`frontend/` directories exist, and that TCP ports 9000 and 8888 are free before
starting either process. A preflight failure exits without starting a service.

It starts both services in the background and tracks their PIDs. On `INT` or
`TERM`, it sends termination to both still-running services and waits for them,
so Ctrl+C never leaves a development process behind. If one service exits on
its own, the script reports which service and exit code caused the shutdown,
then stops the remaining process and returns a nonzero result.

## Verification

Add a focused shell-level test that exercises the script's observable contract
with temporary command stubs: date-based log placement, line prefixes for both
services, and cleanup after an interrupted run. Run that test before and after
implementing the script. Also run `bash -n dev.sh`; the existing backend and
frontend verification commands are outside this script-only change.
