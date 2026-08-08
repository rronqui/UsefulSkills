#!/usr/bin/env bash
# Human-in-the-loop reproduction loop.
# Copy this file, edit the steps below, and run it.
# The agent runs the script; the user follows prompts in their terminal.
#
# Usage:
#   bash hitl-loop.template.sh
#
# Two helpers:
#   step "<instruction>"          → show instruction, wait for Enter
#   capture VAR "<question>"      → show question, read one response into VAR
#   capture_multiline VAR "<q>"   → read until a line containing __END__
#
# At the end, captured values are printed as KEY=VALUE for the agent to parse.
#
# `capture` prints its value back to the terminal, where the agent reads it — so
# capture observations, and leave signing in to the user as a `step`.

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

capture_multiline() {
  local var="$1" question="$2" line answer=""
  printf '\n>>> %s\n' "$question"
  printf '    Paste lines, then enter __END__ on its own line.\n'
  while IFS= read -r line; do
    [[ "$line" == "__END__" ]] && break
    if [[ -n "$answer" ]]; then answer+=$'\n'; fi
    answer+="$line"
  done
  printf -v "$var" '%s' "$answer"
}

redact() {
  sed -E \
    -e 's/((authorization|proxy-authorization)[=:][[:space:]]*bearer[[:space:]]+)[^[:space:]]+/\1<REDACTED>/Ig' \
    -e 's/((authorization|proxy-authorization|cookie|set-cookie|x-api-key|token|password|secret)[=:][[:space:]]*)[^[:space:]]+/\1<REDACTED>/Ig' \
    -e 's/(bearer[[:space:]]+)[^[:space:]]+/\1<REDACTED>/Ig'
}

# --- edit below ---------------------------------------------------------

step "Open the app at http://localhost:3000 and sign in."

capture ERRORED "Click the 'Export' button. Did it throw an error? (y/n)"
capture_multiline ERROR_MSG "Paste the error message (or 'none'):"

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
redacted_error=$(printf '%s' "$ERROR_MSG" | redact)
redacted_error=${redacted_error//$'\n'/\\n}
printf 'ERROR_MSG=%s\n' "$redacted_error"
