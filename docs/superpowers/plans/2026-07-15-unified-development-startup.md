# Unified Development Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one root command that runs the frontend on port 8888 and backend on port 9000 with timestamped, service-prefixed output in both the terminal and date-based log files.

**Architecture:** A Bash launcher owns preflight validation, two isolated service process groups, line-oriented log formatting, and coordinated shutdown. A standalone Bash contract test substitutes deterministic `uv`, `npm`, and `lsof` commands so logging and cleanup can be verified without starting the real applications.

**Tech Stack:** Bash 3.2-compatible shell, Python 3 `setsid` launcher, existing `uv`, npm, Umi Max, and Uvicorn commands.

---

### Task 1: Add A Failing Launcher Contract Test

**Files:**
- Create: `tests/test_dev_start.sh`
- Test: `tests/test_dev_start.sh`

- [ ] **Step 1: Write the failing logging contract test**

Create a dependency-free Bash test harness that copies `dev.sh` to a temporary
fixture, places fake `uv`, `npm`, and `lsof` executables first on `PATH`, then
asserts these patterns after the fake services emit output:

```bash
assert_matches '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\] \[backend\] backend-ready$' \
  "$fixture/logs/$today/backend.log"
assert_matches '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\] \[frontend\] frontend-ready$' \
  "$fixture/logs/$today/frontend.log"
assert_matches '\[backend\] backend-ready$' "$fixture/terminal.log"
assert_matches '\[frontend\] frontend-ready$' "$fixture/terminal.log"
```

- [ ] **Step 2: Add the coordinated-shutdown contract**

Run long-lived fake services that write their PIDs to fixture files, terminate
the launcher, and assert neither service remains alive:

```bash
kill -TERM "$launcher_pid"
wait "$launcher_pid" || launcher_status=$?
[[ "$launcher_status" -eq 143 ]]
! kill -0 "$(cat "$fixture/state/backend.pid")" 2>/dev/null
! kill -0 "$(cat "$fixture/state/frontend.pid")" 2>/dev/null
```

- [ ] **Step 3: Run the test to verify RED**

Run: `bash tests/test_dev_start.sh`

Expected: FAIL because root `dev.sh` does not exist.

### Task 2: Implement The Unified Launcher

**Files:**
- Create: `dev.sh`
- Test: `tests/test_dev_start.sh`

- [ ] **Step 1: Add preflight and date-based logging**

Implement these exact observable constants and line format:

```bash
BACKEND_PORT=9000
FRONTEND_PORT=8888
LOG_DIR="$ROOT_DIR/logs/$(date '+%Y-%m-%d')"

write_service_line() {
  local service=$1 log_file=$2 message=$3 rendered
  rendered="[$(date '+%Y-%m-%d %H:%M:%S')] [$service] $message"
  printf '%s\n' "$rendered"
  printf '%s\n' "$rendered" >> "$log_file"
}
```

Require `uv`, `npm`, and `python3`; verify both application directories; use
`lsof` when present and Bash `/dev/tcp` as the fallback port check. Exit before
launching either service when a preflight check fails.

- [ ] **Step 2: Launch both services in isolated sessions**

Use Python only to create a new process session before replacing itself with the
real command:

```bash
exec_new_session() {
  exec python3 -c \
    'import os, sys; os.setsid(); os.execvpe(sys.argv[1], sys.argv[1:], os.environ)' \
    "$@"
}
```

Launch the backend from `backend/` with `PYTHONUNBUFFERED=1` and the frontend
from `frontend/` with `PORT=8888` and `API_TARGET=http://localhost:9000`. Route
each command's merged stdout/stderr through a line reader calling
`write_service_line`.

- [ ] **Step 3: Add coordinated shutdown and abnormal-exit handling**

Track the two session leader PIDs. On `INT` or `TERM`, signal each whole process
group, wait briefly, escalate to `KILL` only if necessary, reap the leaders, and
exit with 130 or 143. Poll both leaders during normal operation; if either exits,
log its exit code under `[system]`, terminate the other service, and return a
nonzero status.

- [ ] **Step 4: Make the launcher executable**

Run: `chmod +x dev.sh tests/test_dev_start.sh`

- [ ] **Step 5: Run the contract test to verify GREEN**

Run: `bash tests/test_dev_start.sh`

Expected: PASS with two named test cases and no surviving fixture processes.

### Task 3: Verify The Real Project Entry Point

**Files:**
- Verify: `dev.sh`
- Verify: `tests/test_dev_start.sh`

- [ ] **Step 1: Check shell syntax**

Run: `bash -n dev.sh tests/test_dev_start.sh`

Expected: exit 0 with no output.

- [ ] **Step 2: Start the real services**

Run: `./dev.sh`

Expected: terminal lines show `[backend]` and `[frontend]`, backend reports port
9000, frontend reports port 8888, and both dated log files receive the same
lines. Stop the launcher with Ctrl+C after both readiness messages appear.

- [ ] **Step 3: Confirm no service remains and inspect retained logs**

Run: `lsof -nP -iTCP:9000 -sTCP:LISTEN` and
`lsof -nP -iTCP:8888 -sTCP:LISTEN`.

Expected: both commands return no listener after shutdown. Inspect
`logs/$(date +%Y-%m-%d)/backend.log` and `frontend.log` for the prefixed session.

- [ ] **Step 4: Commit only launcher files**

```bash
git add dev.sh tests/test_dev_start.sh
git commit -m "feat: add unified development launcher"
```
