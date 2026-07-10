#!/usr/bin/env bash

set -euo pipefail

log_file="${LOCAL_APP_LOG:-/tmp/inspectiq-dev.log}"
pid_file="${LOCAL_APP_PID:-/tmp/inspectiq-dev.pid}"
rm -f "$log_file" "$pid_file"

terminate_tree() {
  local parent_pid="$1"
  local child_pid
  while read -r child_pid; do
    if [[ -n "$child_pid" ]]; then
      terminate_tree "$child_pid"
    fi
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
  kill -TERM "$parent_pid" 2>/dev/null || true
}

cleanup() {
  if [[ -f "$pid_file" ]]; then
    terminate_tree "$(cat "$pid_file")"
    rm -f "$pid_file"
  fi
}
trap cleanup EXIT INT TERM

PERSISTENCE_MODE=memory npm run dev >"$log_file" 2>&1 &
app_pid=$!
printf '%s\n' "$app_pid" >"$pid_file"

for _ in {1..90}; do
  if curl -fsS http://localhost:4000/api/health >/dev/null && curl -fsS http://localhost:5173 >/dev/null; then
    sleep 1
    if curl -fsS http://localhost:4000/api/health >/dev/null && curl -fsS http://localhost:5173 >/dev/null; then
      "$@"
      exit $?
    fi
  fi
  sleep 2
done

cat "$log_file"
exit 1
