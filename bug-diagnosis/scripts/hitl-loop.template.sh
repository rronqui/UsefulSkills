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
  local var="$1" question="$2" line answer="" hidden=0 saw_end=0 line_count=0 tty_state=""
  local restore_tty
  restore_tty() {
    if ((hidden)); then
      if [[ -n "$tty_state" ]]; then stty "$tty_state"; else stty echo; fi
      hidden=0
    fi
  }
  suspend_tty() {
    restore_tty
    trap - TSTP
    kill -TSTP "$$"
    if [[ -n "$tty_state" ]]; then
      stty -echo
      hidden=1
      trap suspend_tty TSTP
    fi
  }
  printf '\n>>> %s\n' "$question"
  printf '    Paste lines, then enter __END__ on its own line (prefix a literal \\__END__ with \\).\n'
  if [[ -t 0 ]]; then
    tty_state=$(stty -g) || return 1
    hidden=1
    trap 'restore_tty; exit 130' INT TERM HUP QUIT
    trap suspend_tty TSTP
    trap restore_tty EXIT
    if ! stty -echo; then
      hidden=0
      trap - EXIT INT TERM HUP QUIT TSTP
      return 1
    fi
    printf '    [input hidden]\n'
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    if [[ "$line" =~ ^\\+__END__$ ]]; then
      line=${line#\\}
    elif [[ "$line" == "__END__" ]]; then
      saw_end=1
      break
    fi
    if (( line_count > 0 )); then answer+=$'\n'; fi
    answer+="$line"
    line_count=$((line_count + 1))
  done
  trap '' TSTP
  restore_tty
  trap - EXIT INT TERM HUP QUIT TSTP
  if (( !saw_end )); then
    printf '    ERROR: multiline capture ended before __END__.\n' >&2
    return 1
  fi
  printf -v "$var" '%s' "$answer"
}
redact() {
  awk -v labels='authorization|proxy[[:space:]_-]*authorization|cookie|set[[:space:]_-]*cookie|x[[:space:]_-]*api[[:space:]_-]*key|api[[:space:]_-]*key|access[[:space:]_-]*token|private[[:space:]_-]*key|secret[[:space:]_-]*key|client[[:space:]_-]*secret|refresh[[:space:]_-]*token|session[[:space:]_-]*token|aws[[:space:]_-]*secret[[:space:]_-]*access[[:space:]_-]*key|jwt|token[a-z]*|password[a-z]*|passphrase|credential|credentials|secret[a-z]*' '
    BEGIN {
      key = "(^|[^[:alnum:]])(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:]"
      bare_key = "(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:]"
      bracket_key = "(" labels ")[[:space:]]*[\047\"]?[[:space:]]*][[:space:]]*[=:]"
      word = "(^|[^[:alnum:]])(" labels ")[[:space:]]+"
      pending = 0
      flow_depth = 0
    }
    {
      lower = tolower($0)
      if (pending == 2) {
        print "<REDACTED>"
        scan = $0
        gsub(/"([^"\\]|\\.)*"/, "", scan)
        gsub(/\047([^\\\047]|\\.)*\047/, "", scan)
        flow_depth += gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
        flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
        if (flow_depth <= 0) pending = 0
        next
      }
      if (pending) {
        if ($0 ~ /^[[:space:]]/ || $0 == "" || $0 ~ /^[-?][[:space:]]/) {
          print "<REDACTED>"
          next
        }
        pending = 0
      }
      if (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ word || lower ~ /bearer[[:space:]]+/) {
        print "<REDACTED>"
        pending = (lower ~ key || lower ~ bare_key || lower ~ bracket_key) && (lower ~ ("(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:][[:space:]]*(#.*|([&!][^[:space:]]+[[:space:]]*)*[|>][[:space:]]*[-+0-9]*[[:space:]]*(#.*)?)?$") || lower ~ ("(" labels ")[[:space:]]*[\047\"]?[[:space:]]*][[:space:]]*[=:][[:space:]]*(#.*|([&!][^[:space:]]+[[:space:]]*)*[|>][[:space:]]*[-+0-9]*[[:space:]]*(#.*)?)?$"))
        if (!pending && (lower ~ key || lower ~ bare_key) && lower ~ /"/ && lower !~ /"[^"\\]*"[[:space:]]*$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key) && lower ~ /\047/ && lower !~ /\047[^\047\\]*\047[[:space:]]*$/) pending = 1
        if (!pending && lower ~ bracket_key && lower ~ /[\047"][[:space:]]*][[:space:]]*[=:][[:space:]]*[\047"]$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key) && lower ~ /[=:][[:space:]]*[&!][^[:space:]]+[[:space:]]*(#.*)?$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key) && lower ~ /[=:][[:space:]]*[\[{][[:space:]]*(#.*)?$/) {
          pending = 2
          flow_depth = 1
        }
        next
      }
      print
    }
  '
}

# --- edit below ---------------------------------------------------------
APP_INSTRUCTIONS="${APP_INSTRUCTIONS:-Open the application and reproduce the issue.}"

step "$APP_INSTRUCTIONS"

ERROR_QUESTION="${ERROR_QUESTION:-Did the operation under test fail? (y/n)}"
capture ERRORED "$ERROR_QUESTION"
capture_multiline ERROR_MSG "Paste the error message (or 'none'):" || exit 1

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
if ! redacted_error=$(printf '%s\001' "$ERROR_MSG" | redact); then
  printf 'ERROR: redaction failed.\n' >&2
  exit 1
fi
redacted_error=${redacted_error%$'\001'}
redacted_error=${redacted_error//\\/\\\\}
redacted_error=${redacted_error//$'\r'/\\r}
redacted_error=${redacted_error//$'\n'/\\n}
printf 'ERROR_MSG=%s\n' "$redacted_error"
