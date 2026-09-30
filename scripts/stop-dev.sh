#!/usr/bin/env sh
#
# Stop the dev servers and free their ports.
#
# `npm run dev` builds a four-deep process tree (npm → concurrently → npm →
# tsx watch → node), and `tsx watch` is a supervisor: kill the node process
# holding the port and it immediately starts a replacement. So the port looks
# stuck no matter how many times you kill "the server".
#
# Worse, closing a terminal does not necessarily take the tree with it. A shell
# sends SIGHUP to its foreground process group, but npm does not reliably
# forward signals to grandchildren — orphans get reparented to PID 1, which
# never kills anything, and they keep running across reboots of your patience.
#
# This kills the supervisors first, so nothing is left to respawn.
#
# Scoped to THIS checkout: every process it touches must have this directory in
# its command line. A stray `pkill -f "tsx watch"` would take out unrelated
# projects, which is not a trade worth making for a convenience script.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
API_PORT=${PORT:-3031}
WEB_PORT=${WEB_PORT:-5173}

# Supervisors before workers. Anything that can restart a child is listed first.
SUPERVISORS='concurrently -n api,web|tsx watch|/\.bin/vite'
WORKERS='src/server\.ts|/\.bin/vite'

# PIDs in this checkout matching a pattern, excluding this script and its parent
# (both have $ROOT in their own command lines).
ours() {
  pgrep -fl "$ROOT" 2>/dev/null \
    | grep -E "$1" \
    | awk -v self="$$" -v parent="${PPID:-0}" '$1 != self && $1 != parent {print $1}'
}

stop() {
  pids=$(ours "$1" || true)
  [ -z "$pids" ] && return 0

  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  echo "$pids" | tr '\n' ' '
}

killed=$(stop "$SUPERVISORS")
[ -n "$killed" ] && sleep 1

# Anything the supervisors left behind, plus servers started directly with
# `npm run dev:api` / `dev:web`.
stragglers=$(stop "$WORKERS")
[ -n "$stragglers" ] && sleep 1

# Last resort for anything ignoring SIGTERM.
remaining=$(ours "$SUPERVISORS|$WORKERS" || true)
if [ -n "$remaining" ]; then
  # shellcheck disable=SC2086
  kill -9 $remaining 2>/dev/null || true
  sleep 1
fi

if [ -z "$killed$stragglers" ]; then
  echo "Nothing was running."
else
  echo "Stopped:$killed$stragglers"
fi

# Report rather than kill: something else holding 3031 is more likely to be a
# tool you care about than a leftover of ours, and we have already killed
# everything that is provably ours.
blocked=0
for port in "$API_PORT" "$WEB_PORT"; do
  holder=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
  if [ -n "$holder" ]; then
    blocked=1
    echo
    echo "Port $port is still held by PID $holder, which is not part of this project:"
    ps -o pid,command -p "$holder" | tail -n +2 | sed 's/^/  /'
    echo "  Kill it with: kill $holder"
  fi
done

[ "$blocked" -eq 0 ] && echo "Ports $API_PORT and $WEB_PORT are free."
exit 0
