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
  local var="$1" question="$2" line answer="" hidden=0 saw_end=0 line_count=0
  local restore_tty
  restore_tty() {
    if ((hidden)); then
      stty echo
      hidden=0
    fi
  }
  printf '\n>>> %s\n' "$question"
  printf '    Paste lines, then enter __END__ on its own line.\n'
  if [[ -t 0 ]]; then
    hidden=1
    trap 'restore_tty; exit 130' INT TERM HUP QUIT
    trap restore_tty EXIT
    if ! stty -echo; then
      hidden=0
      trap - EXIT INT TERM HUP QUIT
      return 1
    fi
    printf '    [input hidden]\n'
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    if [[ "$line" == "__END__" ]]; then
      saw_end=1
      break
    fi
    if (( line_count > 0 )); then answer+=$'\n'; fi
    answer+="$line"
    line_count=$((line_count + 1))
  done
  restore_tty
  trap - EXIT INT TERM HUP QUIT
  if (( !saw_end )); then
    printf '    ERROR: multiline capture ended before __END__.\n' >&2
    return 1
  fi
  printf -v "$var" '%s' "$answer"
}
redact() {
  sed -E \
    -e "s/((authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|private[_-]?key|secret[_-]?key|jwt|token|password|passphrase|credential|secret)[[:space:]]*[\"']?[=:][[:space:]]*[\"']?)[^\"\r\n]*/\1<REDACTED>/Ig" \
    -e "s/((^|[^[:alnum:]_-])(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|private[_-]?key|secret[_-]?key|jwt|token|password|passphrase|credential|secret)[[:space:]]+).*/\1<REDACTED>/Ig" \
    -e 's/(bearer[[:space:]]+)[^[:space:]]+/\1<REDACTED>/Ig'
}

# --- edit below ---------------------------------------------------------

step "Open the app at http://localhost:3000 and sign in."

capture ERRORED "Click the 'Export' button. Did it throw an error? (y/n)"
capture_multiline ERROR_MSG "Paste the error message (or 'none'):" || exit 1

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
redacted_error=$(printf '%s' "$ERROR_MSG" | redact; printf '\001')
redacted_error=${redacted_error%$'\001'}
redacted_error=${redacted_error//\\/\\\\}
redacted_error=${redacted_error//$'\r'/\\r}
redacted_error=${redacted_error//$'\n'/\\n}
printf 'ERROR_MSG=%s\n' "$redacted_error"
