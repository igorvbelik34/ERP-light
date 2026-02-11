#!/bin/bash
# ============================================================
#  ERP-lite — Dev Server Watchdog
#  Keeps next dev alive, auto-restarts on crash or broken state
# ============================================================

# ── Configuration ────────────────────────────────────────────
PORT=3005
HEALTH_INTERVAL=20          # seconds between health checks
STARTUP_WAIT=15             # seconds to wait after start before first check
MAX_CONSECUTIVE_FAILS=2     # how many fails before restart
FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$FRONTEND_DIR/watchdog.log"
PID_FILE="$FRONTEND_DIR/.watchdog.pid"
HEALTH_URL="http://localhost:$PORT/api/health"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── State ────────────────────────────────────────────────────
SERVER_PID=""
FAIL_COUNT=0

# ── Logging ──────────────────────────────────────────────────
log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp]${NC} $1"
    echo "[$timestamp] $(echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g')" >> "$LOG_FILE"
}

# ── Kill previous watchdog instance ─────────────────────────
kill_previous_watchdog() {
    if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
        if [ -n "$old_pid" ] && [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
            log "${YELLOW}Killing previous watchdog (PID $old_pid)...${NC}"
            kill "$old_pid" 2>/dev/null || true
            sleep 2
            kill -9 "$old_pid" 2>/dev/null || true
            sleep 1
        fi
    fi
    # Also kill any other watchdog scripts for this project (except ourselves)
    local my_pid=$$
    local other_watchdogs
    other_watchdogs=$(pgrep -f "ERP-lite/scripts/dev-watchdog.sh" 2>/dev/null | grep -v "^${my_pid}$" || true)
    if [ -n "$other_watchdogs" ]; then
        log "${YELLOW}Killing stale watchdog processes: $other_watchdogs${NC}"
        echo "$other_watchdogs" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    # Write our PID
    echo $$ > "$PID_FILE"
}

# ── Cleanup on exit ─────────────────────────────────────────
cleanup() {
    log "${YELLOW}Watchdog shutting down...${NC}"
    stop_server
    rm -f "$PID_FILE"
    log "${GREEN}Goodbye!${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Wait until port is free ──────────────────────────────────
wait_for_port_free() {
    local max_wait=${1:-10}
    local waited=0
    while lsof -ti:"$PORT" &>/dev/null; do
        if [ "$waited" -ge "$max_wait" ]; then
            log "${RED}Port $PORT still occupied after ${max_wait}s${NC}"
            return 1
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 0
}

# ── Force-free the port ──────────────────────────────────────
force_free_port() {
    local pids
    pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        log "${YELLOW}Killing processes on port $PORT: $pids${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
    wait_for_port_free 10
}

# ── Stop the current server ─────────────────────────────────
stop_server() {
    # 1) Graceful kill of tracked PID
    if [ -n "$SERVER_PID" ]; then
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            log "Stopping server PID $SERVER_PID..."
            kill "$SERVER_PID" 2>/dev/null || true
            local i
            for i in 1 2 3 4 5; do
                kill -0 "$SERVER_PID" 2>/dev/null || break
                sleep 1
            done
            kill -9 "$SERVER_PID" 2>/dev/null || true
        fi
        wait "$SERVER_PID" 2>/dev/null || true
        SERVER_PID=""
    fi
    # 2) Force-free the port (catches orphaned children)
    force_free_port
}

# ── Clean corrupted .next cache ──────────────────────────────
clean_cache() {
    if [ -d "$FRONTEND_DIR/.next" ]; then
        log "${YELLOW}Cleaning .next cache...${NC}"
        rm -rf "$FRONTEND_DIR/.next"
    fi
}

# ── Start the server ─────────────────────────────────────────
start_server() {
    cd "$FRONTEND_DIR"

    # Double-check port is free
    if lsof -ti:"$PORT" &>/dev/null; then
        log "${YELLOW}Port $PORT busy before start — forcing free...${NC}"
        force_free_port
    fi

    log "${GREEN}Starting Next.js dev server on port $PORT...${NC}"

    npx next dev -p "$PORT" >> "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    log "${GREEN}Server launched (PID $SERVER_PID). Waiting ${STARTUP_WAIT}s...${NC}"
    sleep "$STARTUP_WAIT"

    # Verify process is still running
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        log "${RED}Server died during startup — will retry${NC}"
        SERVER_PID=""
        FAIL_COUNT=$((MAX_CONSECUTIVE_FAILS - 1))  # will retry soon
        return 1
    fi

    FAIL_COUNT=0
    log "${GREEN}Server is running (PID $SERVER_PID)${NC}"
    return 0
}

# ── Full restart cycle ───────────────────────────────────────
full_restart() {
    local clean_cache_flag=${1:-false}

    log "${YELLOW}═══ RESTARTING SERVER ═══${NC}"

    stop_server

    if [ "$clean_cache_flag" = true ]; then
        clean_cache
    fi

    start_server
}

# ── Health check ─────────────────────────────────────────────
check_health() {
    # 1) Is the process alive?
    if [ -z "$SERVER_PID" ] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
        log "${RED}Server process is dead!${NC}"
        return 1
    fi

    # 2) Does the health endpoint respond?
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")

    if [ "$http_code" = "000" ]; then
        log "${RED}Server not responding (connection refused)${NC}"
        return 1
    fi
    if [ "$http_code" -ge 500 ] 2>/dev/null; then
        log "${RED}Server error: HTTP $http_code${NC}"
        return 1
    fi

    # 3) Check static assets (broken .next cache detection)
    local html
    html=$(curl -s --max-time 5 "http://localhost:$PORT/" 2>/dev/null || echo "")
    if [ -n "$html" ]; then
        local chunk_path
        chunk_path=$(echo "$html" | grep -o '/_next/static/[^"]*\.js' | head -1 || true)
        if [ -n "$chunk_path" ]; then
            local chunk_code
            chunk_code=$(curl -s -o /dev/null -w "%{http_code}" \
                --max-time 5 "http://localhost:$PORT$chunk_path" 2>/dev/null || echo "000")
            if [ "$chunk_code" = "404" ]; then
                log "${RED}Static assets broken! $chunk_path → 404${NC}"
                return 2  # needs cache clean
            fi
        fi
    fi

    return 0
}

# ── Main ─────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   ERP-lite Dev Server Watchdog            ║${NC}"
    echo -e "${GREEN}║   Port: $PORT | Check every: ${HEALTH_INTERVAL}s          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    # Truncate log file if too big (> 1MB)
    if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1048576 ]; then
        tail -500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi

    log "Watchdog starting (PID $$)..."
    log "Frontend dir: $FRONTEND_DIR"

    # Kill any previous watchdog instances
    kill_previous_watchdog

    # Initial clean start
    stop_server
    clean_cache
    start_server

    # ── Health check loop ────────────────────────────────────
    while true; do
        sleep "$HEALTH_INTERVAL"

        local health_result=0
        check_health || health_result=$?

        if [ "$health_result" -eq 0 ]; then
            if [ "$FAIL_COUNT" -gt 0 ]; then
                log "${GREEN}Server recovered!${NC}"
            fi
            FAIL_COUNT=0
        else
            FAIL_COUNT=$((FAIL_COUNT + 1))
            log "${YELLOW}Health check failed ($FAIL_COUNT/$MAX_CONSECUTIVE_FAILS)${NC}"

            if [ "$FAIL_COUNT" -ge "$MAX_CONSECUTIVE_FAILS" ]; then
                if [ "$health_result" -eq 2 ]; then
                    log "${RED}Cache corruption — full clean restart${NC}"
                    full_restart true
                else
                    log "${RED}Server down — restarting...${NC}"
                    full_restart false
                fi
            fi
        fi
    done
}

main "$@"
