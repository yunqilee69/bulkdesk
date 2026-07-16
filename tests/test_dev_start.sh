#!/usr/bin/env bash

set -u

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
SOURCE_SCRIPT="$PROJECT_ROOT/dev.sh"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/bulkdesk-dev-test.XXXXXX")
ACTIVE_SERVICE_PIDS=""

cleanup() {
  local service_pid

  for service_pid in $ACTIVE_SERVICE_PIDS; do
    kill -TERM -- "-$service_pid" >/dev/null 2>&1 || true
  done
  rm -rf "$TEMP_ROOT"
}

trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_matches() {
  local pattern=$1
  local file=$2

  if ! grep -Eq "$pattern" "$file"; then
    printf 'Contents of %s:\n' "$file" >&2
    sed -n '1,120p' "$file" >&2
    if [[ -f "$(dirname "$file")/../../terminal.log" ]]; then
      printf 'Contents of terminal.log:\n' >&2
      sed -n '1,120p' "$(dirname "$file")/../../terminal.log" >&2
    fi
    fail "expected $file to match: $pattern"
  fi
}

create_fixture() {
  local fixture=$1

  mkdir -p "$fixture/backend" "$fixture/frontend" "$fixture/bin"
  cp "$SOURCE_SCRIPT" "$fixture/dev.sh"
  chmod +x "$fixture/dev.sh"

  cat > "$fixture/bin/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

  cat > "$fixture/bin/mktemp" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${TEST_STATE:-}" ]]; then
  printf '%s\n' "${!#}" > "$TEST_STATE/mktemp-template"
fi
exec /usr/bin/mktemp "$@"
EOF

  cat > "$fixture/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "-p" ]]; then
  printf '22\n'
fi
EOF

  cat > "$fixture/bin/uv" <<'EOF'
#!/usr/bin/env bash
printf 'backend-ready\n'
sleep 1
exit 7
EOF

  cat > "$fixture/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf 'frontend-ready\n'
sleep 1
exit 8
EOF

  chmod +x "$fixture/bin/lsof" "$fixture/bin/mktemp" "$fixture/bin/node" "$fixture/bin/uv" "$fixture/bin/npm"
}

wait_for_file() {
  local file=$1
  local attempts=0

  while [[ ! -f "$file" && "$attempts" -lt 50 ]]; do
    sleep 0.1
    attempts=$((attempts + 1))
  done

  [[ -f "$file" ]] || fail "timed out waiting for $file"
}

test_writes_prefixed_daily_service_logs() {
  local fixture="$TEMP_ROOT/logging"
  local today
  local status=0

  [[ -f "$SOURCE_SCRIPT" ]] || fail "missing launcher: $SOURCE_SCRIPT"
  create_fixture "$fixture"
  today=$(date '+%Y-%m-%d')

  PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 || status=$?

  [[ "$status" -ne 0 ]] || fail "launcher should report an abnormal fake service exit"
  assert_matches '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\] \[backend\] backend-ready$' \
    "$fixture/logs/$today/backend.log"
  assert_matches '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\] \[frontend\] frontend-ready$' \
    "$fixture/logs/$today/frontend.log"
  assert_matches '\[backend\] backend-ready$' "$fixture/terminal.log"
  assert_matches '\[frontend\] frontend-ready$' "$fixture/terminal.log"

  printf 'PASS: writes prefixed daily service logs\n'
}

test_uses_bulkdesk_runtime_directory() {
  local fixture="$TEMP_ROOT/runtime-directory"
  local status=0

  create_fixture "$fixture"
  mkdir -p "$fixture/state"

  TEST_STATE="$fixture/state" PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 || status=$?

  [[ "$status" -ne 0 ]] || fail "launcher should report an abnormal fake service exit"
  assert_matches '/bulkdesk-dev\.XXXXXX$' "$fixture/state/mktemp-template"

  printf 'PASS: uses BulkDesk runtime directory\n'
}

test_stops_both_service_groups_on_term() {
  local fixture="$TEMP_ROOT/cleanup"
  local launcher_pid
  local launcher_status=0
  local backend_pid
  local frontend_pid

  [[ -f "$SOURCE_SCRIPT" ]] || fail "missing launcher: $SOURCE_SCRIPT"
  create_fixture "$fixture"
  mkdir -p "$fixture/state"

  cat > "$fixture/bin/uv" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$$" > "$TEST_STATE/backend.pid"
printf 'backend-waiting\n'
trap 'exit 0' TERM INT
while :; do sleep 1; done
EOF

  cat > "$fixture/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$$" > "$TEST_STATE/frontend.pid"
printf 'frontend-waiting\n'
trap 'exit 0' TERM INT
while :; do sleep 1; done
EOF

  chmod +x "$fixture/bin/uv" "$fixture/bin/npm"
  TEST_STATE="$fixture/state" PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 &
  launcher_pid=$!
  wait_for_file "$fixture/state/backend.pid"
  wait_for_file "$fixture/state/frontend.pid"
  backend_pid=$(cat "$fixture/state/backend.pid")
  frontend_pid=$(cat "$fixture/state/frontend.pid")
  ACTIVE_SERVICE_PIDS="$backend_pid $frontend_pid"

  kill -TERM "$launcher_pid"
  wait "$launcher_pid" || launcher_status=$?

  [[ "$launcher_status" -eq 143 ]] || fail "expected TERM exit status 143, got $launcher_status"
  ! kill -0 "$backend_pid" 2>/dev/null || fail "backend process survived TERM"
  ! kill -0 "$frontend_pid" 2>/dev/null || fail "frontend process survived TERM"
  ACTIVE_SERVICE_PIDS=""

  printf 'PASS: stops both service groups on TERM\n'
}

test_rejects_unsupported_node_before_starting_services() {
  local fixture="$TEMP_ROOT/node-version"
  local status=0

  [[ -f "$SOURCE_SCRIPT" ]] || fail "missing launcher: $SOURCE_SCRIPT"
  create_fixture "$fixture"
  mkdir -p "$fixture/state"

  cat > "$fixture/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "-p" ]]; then
  printf '20\n'
fi
EOF

  cat > "$fixture/bin/uv" <<'EOF'
#!/usr/bin/env bash
touch "$TEST_STATE/uv-called"
EOF

  cat > "$fixture/bin/npm" <<'EOF'
#!/usr/bin/env bash
touch "$TEST_STATE/npm-called"
EOF

  chmod +x "$fixture/bin/node" "$fixture/bin/uv" "$fixture/bin/npm"
  TEST_STATE="$fixture/state" PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 || status=$?

  [[ "$status" -ne 0 ]] || fail "launcher should reject Node.js 20"
  assert_matches 'ERROR: Node.js 22 or newer is required' "$fixture/terminal.log"
  [[ ! -e "$fixture/state/uv-called" ]] || fail "backend started with unsupported Node.js"
  [[ ! -e "$fixture/state/npm-called" ]] || fail "frontend started with unsupported Node.js"

  printf 'PASS: rejects unsupported Node.js before starting services\n'
}

test_starts_uvicorn_as_a_python_module() {
  local fixture="$TEMP_ROOT/python-module"
  local status=0

  create_fixture "$fixture"
  mkdir -p "$fixture/state"

  cat > "$fixture/bin/uv" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$TEST_STATE/uv-arguments"
printf 'backend-ready\n'
sleep 1
exit 7
EOF

  chmod +x "$fixture/bin/uv"
  TEST_STATE="$fixture/state" PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 || status=$?

  [[ "$status" -ne 0 ]] || fail "launcher should report an abnormal fake service exit"
  assert_matches '^run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 9000$' \
    "$fixture/state/uv-arguments"

  printf 'PASS: starts Uvicorn as a Python module\n'
}

test_stops_frontend_when_backend_exits_before_startup() {
  local fixture="$TEMP_ROOT/early-backend-exit"
  local status=0
  local frontend_pid

  create_fixture "$fixture"
  mkdir -p "$fixture/state"

  cat > "$fixture/bin/uv" <<'EOF'
#!/usr/bin/env bash
printf 'backend-failed\n'
exit 7
EOF

  cat > "$fixture/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$$" > "$TEST_STATE/frontend.pid"
printf 'frontend-waiting\n'
trap 'exit 0' TERM INT
while :; do sleep 1; done
EOF

  chmod +x "$fixture/bin/uv" "$fixture/bin/npm"
  TEST_STATE="$fixture/state" PATH="$fixture/bin:$PATH" "$fixture/dev.sh" > "$fixture/terminal.log" 2>&1 || status=$?

  [[ "$status" -ne 0 ]] || fail "launcher should report the backend startup failure"
  wait_for_file "$fixture/state/frontend.pid"
  frontend_pid=$(cat "$fixture/state/frontend.pid")
  ! kill -0 "$frontend_pid" 2>/dev/null || fail "frontend process survived backend startup failure"

  printf 'PASS: stops frontend when backend exits before startup\n'
}

test_writes_prefixed_daily_service_logs
test_uses_bulkdesk_runtime_directory
test_stops_both_service_groups_on_term
test_rejects_unsupported_node_before_starting_services
test_starts_uvicorn_as_a_python_module
test_stops_frontend_when_backend_exits_before_startup
