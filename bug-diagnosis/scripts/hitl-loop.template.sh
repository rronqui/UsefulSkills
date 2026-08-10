#!/usr/bin/env bash
# Human-in-the-loop reproduction loop.
# Copy this file, edit the steps below, and run it.
# The agent runs the script; the user follows prompts in their terminal.
#
# Usage:
#   bash hitl-loop.template.sh
#
# Helpers:
#   step "<instruction>"          → show instruction, wait for Enter
#   capture VAR "<question>"      → show question, read one response into VAR
#   capture_multiline VAR "<q>"   → read until a line containing __END__
#
# At the end, captured values are printed as KEY=VALUE for the agent to parse.
#
# `capture` prints its value back to the terminal, where the agent reads it — so
# capture observations, and leave signing in to the user as a `step`.

if [ -z "${BASH_VERSION:-}" ]; then
  printf 'SKIPPED: Bash indisponível; cenário HITL gated.\n' >&2
  exit 0
fi
if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 1) )); then
  printf 'SKIPPED: Bash >= 4.1 necessário para o cenário HITL gated.\n' >&2
  exit 0
fi
set -euo pipefail
if ! command -v awk >/dev/null 2>&1; then
  printf 'SKIPPED: AWK indisponível; cenário HITL gated.\n' >&2
  exit 0
fi

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
  local var="$1" question="$2" line answer="" hidden=0 saw_end=0 line_count=0 tty_state="" prefix=""
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
    if [[ "$line" == *__END__ ]]; then
      prefix=${line%__END__}
      if [[ -n "$prefix" && "${prefix//\\/}" == "" ]]; then
        line=${line:1}
      elif [[ "$line" == "__END__" ]]; then
        saw_end=1
        break
      fi
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
  awk -v labels='authorization[[:alnum:]_-]*|proxy[[:space:]_-]*authorization[[:alnum:]_-]*|cookie[[:alnum:]_-]*|set[[:space:]_-]*cookie[[:alnum:]_-]*|x[[:space:]_-]*api[[:alnum:]_-]*|x[[:space:]_-]*api[[:space:]_-]*key[[:alnum:]_-]*|api[[:space:]_-]*key[[:alnum:]_-]*|access[[:space:]_-]*token[[:alnum:]_-]*|private[[:space:]_-]*key[[:alnum:]_-]*|encryption[[:space:]_-]*key[[:alnum:]_-]*|secret[[:alnum:]_-]*|secret[[:space:]_-]*key[[:alnum:]_-]*|client[[:space:]_-]*secret[[:alnum:]_-]*|refresh[[:space:]_-]*token[[:alnum:]_-]*|session[[:space:]_-]*token[[:alnum:]_-]*|aws[[:space:]_-]*access[[:space:]_-]*key[[:alnum:]_-]*|aws[[:space:]_-]*secret[[:space:]_-]*access[[:alnum:]_-]*key[[:alnum:]_-]*|jwt[[:space:]_-]*token[[:alnum:]_-]*|jwt[[:alnum:]_-]*|token[[:alnum:]_-]*|password[[:alnum:]_-]*|passphrase[[:alnum:]_-]*|credential[[:alnum:]_-]*|credentials[[:alnum:]_-]*' '
    function unescaped_double(s, i, j, slashes, backticks) {
      for (i = 1; i <= length(s); i++) {
        if (substr(s, i, 1) != "\"") continue
        backticks = 0
        for (j = i - 1; j >= 1 && substr(s, j, 1) == "`"; j--) backticks++
        if ((backticks % 2) == 1) continue
        slashes = 0
        for (j = i - 1; j >= 1 && substr(s, j, 1) == "\\"; j--) slashes++
        if ((slashes % 2) == 0) return i
      }
      return 0
    }
    function unescaped_single(s, i, j, count) {
      if (!match(s, /\047[[:space:]]*[,;\]\}\)]?[[:space:]]*(#.*)?$/)) return 0
      i = RSTART
      while (i > 1 && substr(s, i - 1, 1) == "\047") i--
      count = 0
      for (j = i; j <= length(s) && substr(s, j, 1) == "\047"; j++) count++
      return (count % 2) == 1
    }
    function quote_escaped(s, i, j, slashes, backticks) {
      backticks = 0
      for (j = i - 1; j >= 1 && substr(s, j, 1) == "`"; j--) backticks++
      if ((backticks % 2) == 1) return 1
      slashes = 0
      for (j = i - 1; j >= 1 && substr(s, j, 1) == "\\"; j--) slashes++
      return (slashes % 2) == 1
    }
    function assignment_start(s, i, ch, quote, brackets, segment_start, segment, candidate) {
      quote = ""
      brackets = 0
      segment_start = 1
      candidate = 0
      for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (quote == "\"") {
          if (ch == "\"" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (quote == "\047") {
          if (ch == "\047" && !quote_escaped(s, i)) {
            if (substr(s, i + 1, 1) == "\047") i++
            else quote = ""
          }
          continue
        }
        if (ch == "\047" && i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) continue
        if (ch == "\"" || ch == "\047") {
          quote = ch
          continue
        }
        if (ch == "[") {
          brackets++
          continue
        }
        if (ch == "]" && brackets > 0) {
          brackets--
          continue
        }
        if (!brackets && (ch == ":" || ch == "=")) {
          segment = substr(s, segment_start, i - segment_start)
          if (segment ~ labels) candidate = i
          segment_start = i + 1
        }
      }
      if (candidate) return candidate
      if (match(s, "(" labels ")[[:space:]]*[:=]")) return RSTART + RLENGTH - 1
      return 0
    }
    function strip_quoted(s, out, i, ch, quote) {
      out = ""
      quote = ""
      for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (quote == "\"") {
          if (ch == "\"" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (quote == "\047") {
          if (ch == "\047" && i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) continue
          if (ch == "\047" && !quote_escaped(s, i)) {
            if (substr(s, i + 1, 1) == "\047") i++
            else quote = ""
          }
          continue
        }
        if (ch == "\047" && i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) {
          out = out ch
          continue
        }
        if (ch == "\"" || ch == "\047") {
          quote = ch
          continue
        }
        out = out ch
      }
      return out
    }
    function strip_comment(s, out, i, ch, quote) {
      out = ""
      quote = quote_open
      for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (quote == "\"") {
          out = out ch
          if (ch == "\"" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (quote == "\047") {
          out = out ch
          if (ch == "\047" && !quote_escaped(s, i)) {
            if (i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) continue
            if (substr(s, i + 1, 1) == "\047") { out = out "\047"; i++ }
            else quote = ""
          }
          continue
        }
        if (quote == "`") {
          out = out ch
          if (ch == "`" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (ch == "#" && (i == 1 || substr(s, i - 1, 1) ~ /[[:space:]]/)) break
        if (ch == "\047" && i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) {
          out = out ch
          continue
        }
        out = out ch
        if (ch == "\"" || ch == "\047" || ch == "`") quote = ch
      }
      return out
    }
    function single_close_pos(s, i, prev, nxt) {
      for (i = 1; i <= length(s); i++) {
        if (substr(s, i, 1) != "\047" || quote_escaped(s, i)) continue
        prev = (i > 1) ? substr(s, i - 1, 1) : ""
        nxt = (i < length(s)) ? substr(s, i + 1, 1) : ""
        if (prev ~ /[[:alnum:]]/ && nxt ~ /[[:alnum:]]/) continue
        if (nxt == "\047") { i++; continue }
        return i
      }
      return 0
    }
    function single_unclosed_text(s, i, ch, quote, count, prev, nxt) {
      quote = ""
      count = 0
      for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (quote == "\"") {
          if (ch == "\"" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (quote == "\047") {
          if (ch == "\047" && !quote_escaped(s, i)) {
            prev = (i > 1) ? substr(s, i - 1, 1) : ""
            nxt = (i < length(s)) ? substr(s, i + 1, 1) : ""
            if (prev ~ /[[:alnum:]]/ && nxt ~ /[[:alnum:]]/) continue
            if (substr(s, i + 1, 1) == "\047") i++
            else { quote = ""; count++ }
          }
          continue
        }
        if (ch == "#") break
        if (ch == "\"") { quote = "\""; continue }
        if (ch != "\047" || quote_escaped(s, i)) continue
        prev = (i > 1) ? substr(s, i - 1, 1) : ""
        nxt = (i < length(s)) ? substr(s, i + 1, 1) : ""
        if (prev ~ /[[:alnum:]]/ && nxt ~ /[[:alnum:]]/) continue
        if (nxt == "\047") { i++; continue }
        quote = "\047"
        count++
      }
      return (count % 2) == 1
    }
    function double_unclosed_text(s, i, ch, quote) {
      quote = ""
      for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (quote == "\047") {
          if (ch == "\047" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (quote == "\"") {
          if (ch == "\"" && !quote_escaped(s, i)) quote = ""
          continue
        }
        if (ch == "#") break
        if (ch == "\047" && !quote_escaped(s, i)) {
          if (i > 1 && i < length(s) && substr(s, i - 1, 1) ~ /[[:alnum:]]/ && substr(s, i + 1, 1) ~ /[[:alnum:]]/) continue
          quote = "\047"
          continue
        }
        if (ch == "\"" && !quote_escaped(s, i)) quote = "\""
      }
      return quote == "\""
    }
    function single_closed(s, i, start, count) {
      start = assignment_start(s)
      if (!start) return 0
      count = 0
      for (i = start + 1; i <= length(s); i++) if (substr(s, i, 1) == "\047") count++
      return count > 0 && (count % 2) == 0
    }
    function value_has_quote(s, wanted, i, start) {
      start = assignment_start(s)
      if (!start) return 0
      for (i = start + 1; i <= length(s); i++) if (substr(s, i, 1) == wanted) return 1
      return 0
    }
    function value_quote_count(s, wanted, i, start, count, prev, nxt) {
      start = assignment_start(s)
      if (!start) return 0
      count = 0
      for (i = start + 1; i <= length(s); i++) {
        if (substr(s, i, 1) != wanted) continue
        if (wanted == "\047" && quote_escaped(s, i)) continue
        prev = (i > 1) ? substr(s, i - 1, 1) : ""
        nxt = (i < length(s)) ? substr(s, i + 1, 1) : ""
        if (wanted == "\047" && prev ~ /[[:alnum:]]/ && nxt ~ /[[:alnum:]]/) continue
        count++
      }
      return count
    }
    function value_double_unclosed(s, rest, pos, count, start) {
      start = assignment_start(s)
      if (!start) return 0
      rest = substr(s, start + 1)
      count = 0
      while ((pos = unescaped_double(rest))) {
        count++
        rest = substr(rest, pos + 1)
      }
      return (count % 2) == 1
    }
    function value_plain_scalar(s, start, value) {
      start = assignment_start(s)
      if (!start) return 0
      value = substr(s, start + 1)
      return value !~ /^[[:space:]]*(#.*)?$/ &&
        value !~ /^[[:space:]]*[\047"]/ &&
        value !~ /^[[:space:]]*[\[{(@|>`]/
    }
    function pem_label(s, marker) {
      marker = s
      sub(/^.*-----begin[[:space:]]+/, "", marker)
      sub(/^.*-----end[[:space:]]+/, "", marker)
      sub(/[[:space:]]+private[[:space:]]+key-----.*$/, "", marker)
      sub(/^private[[:space:]]+key-----.*$/, "", marker)
      return marker
    }
    BEGIN {
      key = "(^|[^[:alnum:]])(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:]"
      bare_key = "(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:]"
      bracket_key = "(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*][[:space:]]*[=:]"
      word = "(^|[^[:alnum:]])(" labels ")[[:space:]]+"
      quote_open = ""
      quote_pos = 0
      pem_label_value = ""
      pem_parent_depth = 0
      pem_parent_pending = 0
      here_parent_depth = 0
      backtick_parent_depth = 0
      flow_parent_pending = 0
      backtick_parent_pending = 0
      here_parent_pending = 0
    }
    {
      quoted_key = "([\047\"][^\047\"]*(" labels ")[^\047\"]*[\047\"][[:space:]]*[=:]|\\[[^]]*(" labels ")[^]]*\\][[:space:]]*[=:])"
      lower = tolower($0)
      if (pending == 2) {
        print "<REDACTED>"
        scan = $0
        scan = strip_comment(scan)
        if (scan ~ /^[[:space:]]*#/) next
        if (quote_open == "\"") {
          quote_pos = unescaped_double(scan)
          if (quote_pos) {
            scan = substr(scan, quote_pos + 1)
            quote_open = ""
          } else next
        } else if (quote_open == "\047") {
          quote_pos = single_close_pos(scan)
          if (quote_pos) {
            scan = substr(scan, quote_pos + 1)
            quote_open = ""
          } else next
        }
        if (quote_open == "" && double_unclosed_text(scan)) quote_open = "\""
        else if (quote_open == "" && single_unclosed_text(scan)) quote_open = "\047"
        scan = strip_quoted(scan)
        gsub(/#.*/, "", scan)
        flow_depth += gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
        flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
        if (flow_parens) {
          flow_depth += gsub(/\(/, "", scan)
          flow_depth -= gsub(/\)/, "", scan)
        }
        if (flow_depth > 0 && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*@["\047][[:space:]]*$/) {
          here_quote = (lower ~ /@"/) ? "\"" : "\047"
          here_parent_depth = flow_depth
          quote_open = ""
          pending = 4
          next
        }
        if (flow_depth > 0 && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*`[[:space:]]*$/) {
          backtick_parent_depth = flow_depth
          pending = 5
          next
        }
        if (flow_depth <= 0) {
          pending = (quote_open == "") ? 0 : 6
          flow_parens = 0
          if ((lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*@["\047][[:space:]]*$/) {
            here_quote = (lower ~ /@"/) ? "\"" : "\047"
            quote_open = ""
            pending = 4
          }
          if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*(\{|\[|@\{|@\(|\()/) {
            scan = strip_quoted($0)
            gsub(/#.*/, "", scan)
            flow_parens = (scan ~ /[()]/)
            flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
            flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
            if (flow_parens) flow_depth += gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
            pending = (flow_depth > 0) ? 2 : 0
          }
          if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && (lower ~ /[=:][[:space:]]*$/ || lower ~ /[=:][[:space:]]*(\||>)/)) pending = 1
          if ((lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*`[[:space:]]*$/) pending = 5
          if ((lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && value_plain_scalar(lower)) pending = 1
          if (lower ~ /-----begin[[:space:]].*private[[:space:]]+key/) { pending = 3; pem_label_value = pem_label(lower) }
        }
        next
      }
      if (pending == 6) {
        print "<REDACTED>"
        scan = $0
        scan = strip_comment(scan)
        if (scan ~ /^[[:space:]]*#/) next
        if (quote_open == "\"") {
          quote_pos = unescaped_double(scan)
          if (quote_pos) {
            scan = substr(scan, quote_pos + 1)
            quote_open = ""
            pending = 0
          } else next
        } else if (quote_open == "\047") {
          quote_pos = single_close_pos(scan)
          if (quote_pos) {
            scan = substr(scan, quote_pos + 1)
            quote_open = ""
            pending = 0
          } else next
        }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*@["\047][[:space:]]*$/) {
          here_quote = (lower ~ /@"/) ? "\"" : "\047"
          pending = 4
          next
        }
        value_scan = lower
        value_scan = strip_comment(value_scan)
        if (!pending && (value_scan ~ key || value_scan ~ bare_key || value_scan ~ bracket_key || value_scan ~ quoted_key) && value_has_quote(value_scan, "\"") && value_double_unclosed(value_scan)) { quote_open = "\""; pending = 6 }
        if (!pending && (value_scan ~ key || value_scan ~ bare_key || value_scan ~ bracket_key || value_scan ~ quoted_key) && value_quote_count(value_scan, "\047") % 2 == 1) { quote_open = "\047"; pending = 6 }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*(@\(|@\{|[\[{(])/) {
          scan = strip_quoted(scan)
          gsub(/#.*/, "", scan)
          flow_parens = (scan ~ /[()]/)
          flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          if (flow_parens) flow_depth += gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
          pending = (flow_depth > 0) ? 2 : 0
        }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*(\||>)/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*`[[:space:]]*$/) pending = 5
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && value_plain_scalar(lower)) pending = 1
        if (!pending && lower ~ /-----begin[[:space:]].*private[[:space:]]+key/) { pending = 3; pem_label_value = pem_label(lower) }
        next
      }
      if (pending == 5) {
        print "<REDACTED>"
        if (lower ~ /^[[:space:]]*`[[:space:]]*[,;\]\}\)]?[[:space:]]*$/) {
          if (backtick_parent_depth > 0) {
            flow_depth = backtick_parent_depth
            delimiter_line = lower
            sub(/[[:space:]]+$/, "", delimiter_line)
            last = substr(delimiter_line, length(delimiter_line), 1)
            if (last == "}" || last == "]" || last == ")") flow_depth--
            pending = (flow_depth > 0) ? 2 : 0
            backtick_parent_depth = 0
          } else if (backtick_parent_pending > 0) {
            pending = backtick_parent_pending
            backtick_parent_pending = 0
          } else {
            pending = 0
          }
        }
        next
      }
      if (pending == 4) {
        print "<REDACTED>"
        if ((here_quote == "\"" && lower ~ /^"@[[:space:]]*$/) || (here_quote == "\047" && lower ~ /^\047@[[:space:]]*$/)) {
          if (here_parent_depth > 0) {
            flow_depth = here_parent_depth
            pending = 2
            here_parent_depth = 0
          } else if (here_parent_pending > 0) {
            pending = here_parent_pending
            here_parent_pending = 0
          } else {
            pending = 0
          }
          here_quote = ""
        }
        next
      }
      if (pending == 3) {
        print "<REDACTED>"
        pem_line = lower
        gsub(/\[debug-[^]]*\][[:space:]]*/, "", pem_line)
        if (pem_line ~ /^[[:space:]]*-----end[[:space:]].*private[[:space:]]+key-----[[:space:]]*$/ && pem_label(pem_line) == pem_label_value) {
          if (pem_parent_depth > 0) {
            flow_depth = pem_parent_depth
            pending = 2
          } else if (pem_parent_pending > 0) {
            pending = pem_parent_pending
          } else {
            pending = 0
          }
          pem_parent_depth = 0
          pem_parent_pending = 0
          pem_label_value = ""
        }
        next
      }
      if (lower ~ /-----begin[[:space:]].*private[[:space:]]+key.*-----[[:space:]]*(#.*)?$/) {
        print "<REDACTED>"
        pem_parent_pending = (pending && pending != 3) ? pending : 0
        scan = strip_quoted($0)
        gsub(/#.*/, "", scan)
        pem_parent_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
        pem_parent_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
        if (scan ~ /@\(/) pem_parent_depth += gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
        pending = 3
        pem_label_value = pem_label(lower)
        next
      }
      if (pending) {
        if (lower ~ /-----begin[[:space:]].*private[[:space:]]+key/) {
          print "<REDACTED>"
          pem_parent_depth = (flow_depth > 0) ? flow_depth : 0
          pending = 3
          pem_label_value = pem_label(lower)
          next
        }
        if ($0 ~ /^[[:space:]]*[\[{(]/ || $0 ~ /^[[:space:]]*@[\{(]/) {
          print "<REDACTED>"
          flow_parent_pending = (pending == 2) ? 0 : pending
          scan = $0
          scan = strip_quoted(scan)
          gsub(/#.*/, "", scan)
          flow_parens = ($0 ~ /^[[:space:]]*@?\(/)
          flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          if (flow_parens) {
            flow_depth += gsub(/\(/, "", scan)
            flow_depth -= gsub(/\)/, "", scan)
          }
          if (flow_depth > 0) pending = 2
          else { pending = flow_parent_pending; flow_parent_pending = 0; flow_parens = 0 }
          next
        }
        if ($0 ~ /^[[:space:]]*`[[:space:]]*$/) {
          print "<REDACTED>"
          backtick_parent_pending = (pending == 2) ? 0 : pending
          backtick_parent_depth = (pending == 2) ? flow_depth : 0
          pending = 5
          next
        }
        if ($0 ~ /^[[:space:]]*@["\047]/) {
          print "<REDACTED>"
          here_parent_pending = (pending == 4) ? 0 : pending
          here_quote = ($0 ~ /^[[:space:]]*@"/) ? "\"" : "\047"
          pending = 4
          next
        }
        if (pending == 7 && $0 ~ /^[[:space:]]*:[[:space:]]*/) {
          scan = strip_comment($0)
          flow_scan = strip_quoted(scan)
          if (scan ~ /[|>]/) {
            pending = 1
          } else if (scan ~ /:[[:space:]]*["\047]/) {
            if (scan ~ /:[[:space:]]*"/ && double_unclosed_text(scan)) {
              quote_open = "\""
              pending = 6
            } else if (scan ~ /:[[:space:]]*\047/ && single_unclosed_text(scan)) {
              quote_open = "\047"
              pending = 6
            } else pending = 0
          } else if (flow_scan ~ /[\[{(]/) {
            scan = flow_scan
            gsub(/#.*/, "", scan)
            flow_parens = (scan ~ /[()]/)
            flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
            flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
            if (flow_parens) flow_depth += gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
            pending = (flow_depth > 0) ? 2 : 0
          } else pending = 7
          next
        }
        if ($0 ~ /^[[:space:]]/ || $0 == "" || $0 ~ /^[-?][[:space:]]/ || $0 ~ /^[[:space:]]*#/) {
          print "<REDACTED>"
          next
        }
        if ($0 ~ /^[^[:space:]][^:]*:[[:space:]]/ && !(lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key || lower ~ word || lower ~ /bearer[[:space:]]+/)) {
          pending = 0
          print
          next
        }
        if (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) {
          pending = 0
        } else {
          print "<REDACTED>"
          pending = 0
          next
        }
      }
      question_key = strip_comment(lower)
      sub(/^[[:space:]]*\?[[:space:]]*/, "", question_key)
      while (question_key ~ /^[[:space:]]*(!+[^[:space:]]*|&[^[:space:]]+)[[:space:]]*/) sub(/^[[:space:]]*(!+[^[:space:]]*|&[^[:space:]]+)[[:space:]]*/, "", question_key)
      sub(/^[[:space:]]*\[[[:space:]]*[\047"]?/, "[", question_key)
      sub(/[\047"]?[[:space:]]*\][[:space:]]*$/, "]", question_key)
      sub(/^[[:space:]]*[\047"]/, "", question_key)
      sub(/[\047"][[:space:]]*$/, "", question_key)
      if (!pending && lower ~ /^[[:space:]]*\?[[:space:]]*/ && (question_key ~ ("^(" labels ")[[:space:]]*$") || question_key ~ ("^\\[(" labels ")\\][[:space:]]*$"))) {
        print "<REDACTED>"
        pending = 7
        next
      }
      if (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key || lower ~ word || lower ~ /bearer[[:space:]]+/) {
        print "<REDACTED>"
        pending = (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && (lower ~ ("(" labels ")[[:space:]]*[\\\\]?[\047\"]?[[:space:]]*[=:][[:space:]]*(#.*|([&!][^[:space:]]+[[:space:]]*)*[|>][[:space:]]*[-+0-9]*[[:space:]]*(#.*)?)?$") || lower ~ ("(" labels ")[[:space:]]*[\047\"]?[[:space:]]*][[:space:]]*[=:][[:space:]]*(#.*|([&!][^[:space:]]+[[:space:]]*)*[|>][[:space:]]*[-+0-9]*[[:space:]]*(#.*)?)?$"))
        if (!pending && lower ~ quoted_key && lower ~ /[=:][[:space:]]*([&!][^[:space:]]+[[:space:]]*)*[|>][[:space:]]*[-+0-9]*[[:space:]]*$/) pending = 1
        if (!pending && lower ~ quoted_key && lower ~ /[=:][[:space:]]*$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*@["\047][[:space:]]*$/) {
          here_quote = (lower ~ /@"/) ? "\"" : "\047"
          scan = strip_comment(strip_quoted($0))
          here_parent_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          here_parent_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          paren_depth = gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
          here_parent_depth += paren_depth
          flow_parens = (here_parent_depth > 0 && paren_depth > 0)
          pending = 4
        }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && value_has_quote(lower, "\"") && value_double_unclosed(lower)) { quote_open = "\""; pending = 6 }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && value_quote_count(lower, "\047") % 2 == 1) { quote_open = "\047"; pending = 6 }
        if (!pending && lower ~ bracket_key && lower ~ /[\047"][[:space:]]*][[:space:]]*[=:][[:space:]]*[\047"]$/) pending = 1
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*`[[:space:]]*$/) {
          scan = strip_comment(strip_quoted($0))
          backtick_parent_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          backtick_parent_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          paren_depth = gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
          backtick_parent_depth += paren_depth
          flow_parens = (backtick_parent_depth > 0 && paren_depth > 0)
          pending = 5
        }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && value_plain_scalar(lower)) pending = 1
        if ((lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*@\(/) {
          scan = strip_quoted($0)
          gsub(/#.*/, "", scan)
          paren_depth = gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
          flow_parens = (paren_depth > 0)
          flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          flow_depth += paren_depth
          flow_parens = (flow_depth > 0 && flow_parens)
          pending = (flow_depth > 0) ? 2 : 0
        }
        if (!pending && (lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*[&!][^[:space:]]+[[:space:]]*(#.*)?$/) pending = 1
        if ((lower ~ key || lower ~ bare_key || lower ~ bracket_key || lower ~ quoted_key) && lower ~ /[=:][[:space:]]*[^#]*[\[{(]/ && lower !~ /[=:][[:space:]]*@\(/) {
          scan = $0
          if (quote_open == "" && double_unclosed_text(scan)) quote_open = "\""
          else if (quote_open == "" && single_unclosed_text(scan)) quote_open = "\047"
          scan = strip_quoted(scan)
          gsub(/#.*/, "", scan)
          flow_parens = (scan ~ /[()]/)
          flow_depth = gsub(/\[/, "", scan) + gsub(/\{/, "", scan)
          flow_depth -= gsub(/\]/, "", scan) + gsub(/\}/, "", scan)
          if (flow_parens) flow_depth += gsub(/\(/, "", scan) - gsub(/\)/, "", scan)
          if (flow_depth > 0) pending = 2
        }
        next
      }
      print
    }
  '
}
sanitize_trace() {
  # The only value handed to persistence or output is already redacted.  Keep
  # this final hygiene pass separate from the redaction state machine so new
  # credential formats and debug probes cannot bypass redact-before-write.
  awk '
    function pem_label(line, marker) {
      marker = tolower(line)
      sub(/^.*-----begin[[:space:]]+/, "", marker)
      sub(/^.*-----end[[:space:]]+/, "", marker)
      sub(/-----.*$/, "", marker)
      return marker
    }
    BEGIN { pem_label_value = "" }
    {
      lower = tolower($0)
      if (pem_label_value != "") {
        pem_line = lower
        gsub(/\[debug-[^]]*\][[:space:]]*/, "", pem_line)
        print "<REDACTED>"
        if (pem_line ~ /^[[:space:]]*-----end[[:space:]][a-z0-9 -]+-----[[:space:]]*$/ &&
            pem_label(pem_line) == pem_label_value) pem_label_value = ""
        next
      }
      if (lower ~ /\[debug-[^]]*\]/) {
        debug_line = lower
        if (debug_line ~ /-----begin[[:space:]][a-z0-9 -]+-----/) {
          print "<REDACTED>"
          pem_label_value = pem_label(debug_line)
        }
        next
      }
      if (lower ~ /-----begin[[:space:]][a-z0-9 -]+-----/) {
        print "<REDACTED>"
        pem_label_value = pem_label(lower)
        next
      }
      gsub(/eyJ[[:alnum:]_-]+([.][[:alnum:]_-]+){1,2}|glpat_[[:alnum:]_-]+|glpat-[[:alnum:]_-]+|sk_live_[[:alnum:]_-]+|sk_test_[[:alnum:]_-]+|github_pat_[[:alnum:]_-]+|ghp_[[:alnum:]_-]*|gho_[[:alnum:]_-]*|ghs_[[:alnum:]_-]*|ghr_[[:alnum:]_-]*|npm_[[:alnum:]_-]+|AKIA[[:alnum:]]+|AIza[[:alnum:]_-]+|xox[bp]-[[:alnum:]_-]+|sk-[[:alnum:]_-]+/, "<REDACTED>")
      print
    }
  '
}

scan_clean_trace() {
  awk '
    {
      lower = tolower($0)
      if (lower ~ /\[debug-[^]]*\]/ ||
          lower ~ /(^|[^[:alnum:]])encryption[[:space:]_-]*key[[:alnum:]_-]*[[:space:]]*[=:][[:space:]]*[^[:space:]#]/ ||
          $0 ~ /eyJ[[:alnum:]_-]+|glpat_|sk_live_|sk_test_|github_pat_|ghp_|gho_|ghs_|ghr_|npm_|AKIA[[:alnum:]]+|AIza[[:alnum:]_-]+|xox[bp]-[[:alnum:]_-]+|sk-[[:alnum:]_-]+/ ||
          lower ~ /eyj|glpat_|sk_live_|sk_test_|github_pat_[[:alnum:]_-]+|ghp_[[:alnum:]_-]*|gho_[[:alnum:]_-]*|ghs_[[:alnum:]_-]*|ghr_[[:alnum:]_-]*|npm_[[:alnum:]_-]+|akia[[:alnum:]]+|aiza[[:alnum:]_-]+|xox[bp]-[[:alnum:]_-]+|sk-[[:alnum:]_-]+/ ||
          lower ~ /-----begin[[:space:]][a-z0-9 -]+-----|-----end[[:space:]][a-z0-9 -]+-----/) found = 1
    }
    END { exit found ? 1 : 0 }
  '
}


persist_trace() {
  local path="${1:-}" tmp="" guard="" published=0 write_fd="" read_fd="" verify_fd=""
  local guard_owned=0 scan_checksum="" verify_checksum=""
  cleanup_tmp() {
    local guard_target=""
    if [[ -n "$write_fd" ]]; then eval "exec ${write_fd}>&-" || true; write_fd=""; fi
    if [[ -n "$read_fd" ]]; then eval "exec ${read_fd}<&-" || true; read_fd=""; fi
    if [[ -n "$verify_fd" ]]; then eval "exec ${verify_fd}<&-" || true; verify_fd=""; fi
    if [[ -n "$guard" && ( -e "$guard" || -L "$guard" ) ]]; then
      if [[ -e "$tmp" && "$guard" -ef "$tmp" ]]; then
        guard_target="$tmp"
      elif [[ -e "$path" && ! -L "$path" && "$guard" -ef "$path" ]]; then
        guard_target="$path"
      fi
    fi
    if [[ -n "$tmp" && -e "$tmp" && ( "$guard_owned" -eq 0 || "$guard_target" == "$tmp" ) ]]; then
      rm -f -- "$tmp" || rm -f "$tmp" || true
    fi
    if [[ -n "$guard_target" && -e "$guard" ]]; then
      rm -f -- "$guard" || rm -f "$guard" || true
    fi
  }
  cleanup_nested_tmp() {
    local tmp_name="${tmp##*/}" candidate="" dir_fd="" backslash=""
    printf -v backslash '%b' '\\'
    if [[ "$tmp_name" == "$tmp" ]]; then tmp_name="${tmp##*${backslash}}"; fi
    [[ -d "$path" && ! -L "$path" ]] || return 0
    [[ -n "$guard" && ( -e "$guard" || -L "$guard" ) ]] || return 0
    exec {dir_fd}<"$path" || return 0
    if [[ ! -e "/dev/fd/$dir_fd" || ! "/dev/fd/$dir_fd" -ef "$path" ]]; then
      eval "exec ${dir_fd}<&-" || true
      return 0
    fi
    candidate="${path%/}/$tmp_name"
    for candidate in "$candidate" "$path"/*; do
      [[ ( -e "$candidate" || -L "$candidate" ) && "$candidate" -ef "$guard" &&
          -e "/dev/fd/$dir_fd" && "/dev/fd/$dir_fd" -ef "$path" ]] || continue
      rm -f -- "$candidate" || rm -f "$candidate" || true
      break
    done
    rm -f -- "$guard" || rm -f "$guard" || true
    eval "exec ${dir_fd}<&-" || true
  }
  discard_published() {
    if [[ -e "$path" && ! -L "$path" && -e "$guard" && "$path" -ef "$guard" ]]; then
      rm -f -- "$path" || rm -f "$path" || true
      published=0
    fi
  }
  cleanup_abort() {
    local status=$?
    trap - EXIT TERM INT
    cleanup_nested_tmp || true
    cleanup_tmp || true
    exit "$status"
  }
  finish_persist() {
    local status="$1"
    trap - EXIT TERM INT
    cleanup_nested_tmp || true
    cleanup_tmp || true
    return "$status"
  }
  trap cleanup_abort EXIT TERM INT

  [[ "$path" != -* ]] || { finish_persist 1; return 1; }
  [[ ! -d "$path" ]] || { finish_persist 1; return 1; }
  [[ ! -e "$path" && ! -L "$path" ]] || { finish_persist 1; return 1; }
  umask 077
  tmp=$(mktemp "${path}.tmp.XXXXXX") || { finish_persist 1; return 1; }
  guard="${tmp}.guard"
  if ! ln "$tmp" "$guard"; then
    finish_persist 1
    return 1
  fi
  guard_owned=1
  if ! exec {write_fd}<>"$tmp" ||
    [[ ! -e "/dev/fd/$write_fd" || ! "/dev/fd/$write_fd" -ef "$guard" ]] ||
    ! cat >&"$write_fd"; then
    finish_persist 1
    return 1
  fi
  eval "exec ${write_fd}>&-" || { write_fd=""; finish_persist 1; return 1; }
  write_fd=""
  if ! scan_checksum=$(cksum <"$tmp"); then
    finish_persist 1
    return 1
  fi
  if ! exec {read_fd}<"$tmp" ||
    [[ ! -e "/dev/fd/$read_fd" || ! "/dev/fd/$read_fd" -ef "$guard" ]] ||
    ! scan_clean_trace <&"$read_fd"; then
    finish_persist 1
    return 1
  fi
  if ! scan_checksum_after=$(cksum <"$tmp") ||
    [[ "$scan_checksum" != "$scan_checksum_after" ]]; then
    finish_persist 1
    return 1
  fi
  eval "exec ${read_fd}<&-" || { read_fd=""; finish_persist 1; return 1; }
  read_fd=""

  if ! mv -n -- "$tmp" "$path"; then
    if [[ -e "$tmp" || -L "$tmp" ]] &&
      [[ ! -e "$path" && ! -L "$path" ]] &&
      ln "$tmp" "$path" &&
      [[ -e "$path" && ! -L "$path" && "$path" -ef "$guard" ]]; then
      published=1
    fi
  elif [[ -e "$tmp" || -L "$tmp" ]]; then
    if [[ ! -e "$path" && ! -L "$path" ]] &&
      ln "$tmp" "$path" &&
      [[ -e "$path" && ! -L "$path" && "$path" -ef "$guard" ]]; then
      published=1
    fi
  elif [[ -e "$path" && ! -L "$path" && "$path" -ef "$guard" ]]; then
    published=1
  fi
  if (( !published )); then
    finish_persist 1
    return 1
  fi
  if ! exec {verify_fd}<"$path" ||
    [[ ! -e "/dev/fd/$verify_fd" || ! "/dev/fd/$verify_fd" -ef "$guard" ]] ||
    ! verify_checksum=$(cksum <&"$verify_fd") ||
    [[ "$verify_checksum" != "$scan_checksum" ]]; then
    discard_published
    finish_persist 1
    return 1
  fi
  finish_persist 0
}

# Set TRACE_FILE to persist a trace.  Persistence is intentionally downstream
# of redact + sanitize + scan; a failed scan never publishes the artifact.
TRACE_FILE="${TRACE_FILE:-}"
redact_scalar() {
  local value="$1" redacted
  if ! redacted=$(printf '%s\001' "$value" | redact | sanitize_trace); then
    return 1
  fi
  redacted=${redacted%$'\001'}
  printf '%s' "$redacted"
}


# --- edit below ---------------------------------------------------------
APP_INSTRUCTIONS="${APP_INSTRUCTIONS:-Open the application and reproduce the issue.}"

step "$APP_INSTRUCTIONS"

ERROR_QUESTION="${ERROR_QUESTION:-Did the operation under test fail? (y/n)}"
capture ERRORED "$ERROR_QUESTION"
capture_multiline ERROR_MSG "Paste the error message (or 'none'):" || exit 1

if ! redacted_errored=$(redact_scalar "$ERRORED"); then
  printf 'ERROR: ERRORED redaction failed.\n' >&2
  exit 1
fi
if ! printf '%s' "$redacted_errored" | scan_clean_trace; then
  printf 'ERROR: ERRORED scan failed; refusing to publish.\n' >&2
  exit 1
fi
printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$redacted_errored"
if ! redacted_trace=$(printf '%s\001' "$ERROR_MSG" | redact | sanitize_trace); then
  printf 'ERROR: redaction failed.\n' >&2
  exit 1
fi
redacted_trace=${redacted_trace%$'\001'}
if ! printf '%s' "$redacted_trace" | scan_clean_trace; then
  printf 'ERROR: final trace scan failed; refusing to publish.\n' >&2
  exit 1
fi
if [[ -n "$TRACE_FILE" ]] && ! printf '%s\n' "$redacted_trace" | persist_trace "$TRACE_FILE"; then
  printf 'ERROR: trace persistence failed; no artifact published.\n' >&2
  exit 1
fi

redacted_error=${redacted_trace//\\/\\\\}
redacted_error=${redacted_error//$'\r'/\\r}
redacted_error=${redacted_error//$'\n'/\\n}
printf 'ERROR_MSG=%s\n' "$redacted_error"
