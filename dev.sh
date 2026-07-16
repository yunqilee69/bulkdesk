#!/usr/bin/env bash

set -u

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT=9000
FRONTEND_PORT=8888
LOG_DIR="$ROOT_DIR/logs/$(date '+%Y-%m-%d')"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
RUNTIME_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bulkdesk-dev.XXXXXX")
BACKEND_PID=""
FRONTEND_PID=""
BACKEND_JOB_PID=""
FRONTEND_JOB_PID=""
SHUTTING_DOWN=0

cleanup_runtime() {
  rm -rf "$RUNTIME_DIR"
}

trap cleanup_runtime EXIT

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

write_service_line() {
  local service=$1
  local log_file=$2
  local message=$3
  local rendered

  rendered="[$(timestamp)] [$service] $message"
  printf '%s\n' "$rendered"
  printf '%s\n' "$rendered" >> "$log_file"
}

write_system_line() {
  printf '[%s] [system] %s\n' "$(timestamp)" "$1"
}

prefix_stream() {
  local service=$1
  local log_file=$2
  local line

  while IFS= read -r line || [[ -n "$line" ]]; do
    write_service_line "$service" "$log_file" "$line"
  done
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    write_system_line "ERROR: required command not found: $1"
    exit 1
  }
}

require_supported_node() {
  local node_major

  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || {
    write_system_line "ERROR: unable to determine Node.js version"
    exit 1
  }

  if ! [[ "$node_major" =~ ^[0-9]+$ ]] || [[ "$node_major" -lt 22 ]]; then
    write_system_line "ERROR: Node.js 22 or newer is required (found $node_major)"
    exit 1
  fi
}

port_in_use() {
  local port=$1

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

require_free_port() {
  local service=$1
  local port=$2

  if port_in_use "$port"; then
    write_system_line "ERROR: $service port $port is already in use"
    exit 1
  fi
}

exec_new_session() {
  exec python3 -c \
    'import os, sys; os.setsid(); os.execvpe(sys.argv[1], sys.argv[1:], os.environ)' \
    "$@"
}

run_backend_service() {
  cd "$BACKEND_DIR" || exit 1
  PYTHONUNBUFFERED=1 exec_new_session \
    uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
}

run_frontend_service() {
  cd "$FRONTEND_DIR" || exit 1
  PORT="$FRONTEND_PORT" API_TARGET="http://localhost:$BACKEND_PORT" \
    exec_new_session npm run dev
}

start_service() {
  local service=$1
  local log_file=$2
  local runner=$3
  local fifo="$RUNTIME_DIR/$service.pipe"
  local service_pid_file="$RUNTIME_DIR/$service.pid"
  local logger_pid
  local service_pid
  local service_status

  mkfifo "$fifo" || return 1
  prefix_stream "$service" "$log_file" < "$fifo" &
  logger_pid=$!
  "$runner" > "$fifo" 2>&1 &
  service_pid=$!
  printf '%s\n' "$service_pid" > "$service_pid_file"
  wait "$service_pid" 2>/dev/null
  service_status=$?
  wait "$logger_pid" >/dev/null 2>&1 || true
  rm -f "$fifo" "$service_pid_file"
  return "$service_status"
}

capture_service_pids() {
  if [[ -z "$BACKEND_PID" && -f "$RUNTIME_DIR/backend.pid" ]]; then
    BACKEND_PID=$(cat "$RUNTIME_DIR/backend.pid")
  fi
  if [[ -z "$FRONTEND_PID" && -f "$RUNTIME_DIR/frontend.pid" ]]; then
    FRONTEND_PID=$(cat "$RUNTIME_DIR/frontend.pid")
  fi
}

terminate_group() {
  local pid=$1
  local attempts=0

  kill -TERM -- "-$pid" >/dev/null 2>&1 || return 0
  while kill -0 -- "-$pid" >/dev/null 2>&1 && [[ "$attempts" -lt 30 ]]; do
    sleep 0.1
    attempts=$((attempts + 1))
  done

  if kill -0 -- "-$pid" >/dev/null 2>&1; then
    kill -KILL -- "-$pid" >/dev/null 2>&1 || true
  fi
}

stop_services() {
  [[ -n "$BACKEND_PID" ]] && terminate_group "$BACKEND_PID"
  [[ -n "$FRONTEND_PID" ]] && terminate_group "$FRONTEND_PID"
  [[ -n "$BACKEND_JOB_PID" ]] && wait "$BACKEND_JOB_PID" >/dev/null 2>&1 || true
  [[ -n "$FRONTEND_JOB_PID" ]] && wait "$FRONTEND_JOB_PID" >/dev/null 2>&1 || true
}

handle_signal() {
  local exit_status=$1

  [[ "$SHUTTING_DOWN" -eq 1 ]] && exit "$exit_status"
  SHUTTING_DOWN=1
  trap - INT TERM
  write_system_line "received signal; stopping backend and frontend"
  stop_services
  exit "$exit_status"
}

trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

[[ -d "$BACKEND_DIR" ]] || {
  write_system_line "ERROR: backend directory not found: $BACKEND_DIR"
  exit 1
}
[[ -d "$FRONTEND_DIR" ]] || {
  write_system_line "ERROR: frontend directory not found: $FRONTEND_DIR"
  exit 1
}

require_command uv
require_command npm
require_command python3
require_command node
require_supported_node
require_free_port backend "$BACKEND_PORT"
require_free_port frontend "$FRONTEND_PORT"

mkdir -p "$LOG_DIR"
touch "$BACKEND_LOG" "$FRONTEND_LOG"
write_service_line backend "$BACKEND_LOG" "===== development session started ====="
write_service_line frontend "$FRONTEND_LOG" "===== development session started ====="

start_service backend "$BACKEND_LOG" run_backend_service &
BACKEND_JOB_PID=$!
start_service frontend "$FRONTEND_LOG" run_frontend_service &
FRONTEND_JOB_PID=$!

for _ in $(seq 1 50); do
  capture_service_pids
  [[ -f "$RUNTIME_DIR/backend.pid" && -f "$RUNTIME_DIR/frontend.pid" ]] && break
  sleep 0.1
done

[[ -f "$RUNTIME_DIR/backend.pid" && -f "$RUNTIME_DIR/frontend.pid" ]] || {
  write_system_line "ERROR: failed to start service processes"
  capture_service_pids
  stop_services
  exit 1
}

capture_service_pids

write_system_line "backend starting at http://localhost:$BACKEND_PORT (PID $BACKEND_PID)"
write_system_line "frontend starting at http://localhost:$FRONTEND_PORT (PID $FRONTEND_PID)"

while kill -0 "$BACKEND_JOB_PID" >/dev/null 2>&1 && kill -0 "$FRONTEND_JOB_PID" >/dev/null 2>&1; do
  sleep 0.2
done

EXITED_SERVICE=backend
EXITED_JOB_PID=$BACKEND_JOB_PID
EXITED_PID=$BACKEND_PID
REMAINING_JOB_PID=$FRONTEND_JOB_PID
REMAINING_PID=$FRONTEND_PID
if kill -0 "$BACKEND_JOB_PID" >/dev/null 2>&1; then
  EXITED_SERVICE=frontend
  EXITED_JOB_PID=$FRONTEND_JOB_PID
  EXITED_PID=$FRONTEND_PID
  REMAINING_JOB_PID=$BACKEND_JOB_PID
  REMAINING_PID=$BACKEND_PID
fi

wait "$EXITED_JOB_PID"
EXITED_STATUS=$?
write_system_line "$EXITED_SERVICE exited with status $EXITED_STATUS; stopping the other service"
terminate_group "$REMAINING_PID"
wait "$REMAINING_JOB_PID" >/dev/null 2>&1 || true

if [[ "$EXITED_STATUS" -eq 0 ]]; then
  exit 1
fi
exit "$EXITED_STATUS"
