#!/bin/sh
set -u

SRC_DIR="${SMARTPOS_DEV_WATCH_SRC:-/src}"
BIN_PATH="${SMARTPOS_DEV_WATCH_BIN:-/tmp/smartpos-server}"
POLL_INTERVAL="${SMARTPOS_DEV_WATCH_INTERVAL:-1}"
DEBOUNCE_DELAY="${SMARTPOS_DEV_WATCH_DEBOUNCE:-0.2}"

SERVER_PID=""
SLEEP_PID=""

log_json() {
  level="$1"
  event="$2"
  raw_msg="$3"
  safe_msg=$(printf '%s' "$raw_msg" | tr '[:cntrl:]' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"level":"%s","service":"api","event":"%s","msg":"%s"}\n' "$level" "$event" "$safe_msg"
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

shutdown() {
  if [ -n "$SLEEP_PID" ]; then
    kill "$SLEEP_PID" 2>/dev/null || true
  fi
  stop_server
  log_json "INFO" "dev_watch_stopped" "Go API development watcher stopped"
  exit 0
}

trap shutdown INT TERM

compute_fingerprint() {
  find "$SRC_DIR" -name '.*' -prune -o -type f \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -exec sha256sum {} + 2>/dev/null \
    | LC_ALL=C sort \
    | sha256sum \
    | awk '{print $1}'
}

wait_for_stable_fingerprint() {
  prev="$1"
  attempt=0
  while [ "$attempt" -lt 10 ]; do
    sleep "$DEBOUNCE_DELAY" 2>/dev/null || sleep 1
    curr=$(compute_fingerprint)
    if [ "$curr" = "$prev" ]; then
      printf '%s' "$curr"
      return 0
    fi
    prev="$curr"
    attempt=$((attempt + 1))
  done
  printf '%s' "$prev"
}

build_and_swap() {
  cd "$SRC_DIR" || return 1
  export SMARTPOS_DEV_WATCH_SRC="$SRC_DIR"
  export SMARTPOS_DEV_WATCH_BIN="$BIN_PATH"

  if [ -n "${SMARTPOS_DEV_WATCH_BUILD_CMD:-}" ]; then
    build_output=$(sh -c "$SMARTPOS_DEV_WATCH_BUILD_CMD" 2>&1)
    build_status=$?
  else
    build_output=$(CGO_ENABLED="${CGO_ENABLED:-0}" go build -o "$BIN_PATH.next" ./cmd/server 2>&1)
    build_status=$?
  fi

  if [ "$build_status" -ne 0 ]; then
    rm -f "$BIN_PATH.next"
    log_json "ERROR" "dev_build_failed" "${build_output:-go build failed}"
    return 1
  fi

  had_server=0
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    had_server=1
  fi

  stop_server
  mv -f "$BIN_PATH.next" "$BIN_PATH"
  chmod +x "$BIN_PATH" 2>/dev/null || true
  "$BIN_PATH" &
  SERVER_PID=$!

  if [ "$had_server" -eq 1 ]; then
    log_json "INFO" "dev_server_reloaded" "Go API rebuilt and restarted"
  else
    log_json "INFO" "dev_server_started" "Go API built and started in watch mode"
  fi
  return 0
}

LAST_FINGERPRINT=$(compute_fingerprint)
build_and_swap || true

while :; do
  sleep "$POLL_INTERVAL" 2>/dev/null &
  SLEEP_PID=$!
  wait "$SLEEP_PID" 2>/dev/null || true
  SLEEP_PID=""

  if [ -n "$SERVER_PID" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID" 2>/dev/null
    exit_code=$?
    SERVER_PID=""
    printf '{"level":"ERROR","service":"api","event":"dev_server_exited","exit_code":%d,"msg":"Go API process exited; waiting for next source change"}\n' "$exit_code"
  fi

  NEXT_FINGERPRINT=$(compute_fingerprint)
  if [ "$NEXT_FINGERPRINT" != "$LAST_FINGERPRINT" ]; then
    LAST_FINGERPRINT=$(wait_for_stable_fingerprint "$NEXT_FINGERPRINT")
    build_and_swap || true
  fi
done
