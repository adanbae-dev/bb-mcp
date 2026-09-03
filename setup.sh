#!/usr/bin/env bash
# bb-mcp 설정 도우미.
# 손으로 하면 걸리는 함정들을 대신 처리한다:
#   - security 대화형 프롬프트의 128자 절단
#   - 토큰에 개행이 섞여 hex로 저장되는 문제
#   - claude mcp add 의 `--` 위치 / --env 뒤 이름 / node 절대경로
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="bb-api-token"
# 저장소 밖에 둔다. 저장소를 옮겨도 살아남고, 사내 저장소 이름이 git 트리 옆에 놓이지 않는다.
ALLOWLIST="${BB_MCP_ALLOWLIST:-$HOME/.config/bb-mcp/allowed-repos}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. 사전 확인 ──────────────────────────────────────────────────────
say "1/6  사전 확인"

command -v node >/dev/null || die "node 를 찾을 수 없습니다"
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 18+ 가 필요합니다 (현재 $(node -v))"
ok "node $(node -v) — $NODE_BIN"

command -v claude >/dev/null || warn "claude CLI 가 없습니다. 4단계에서 명령만 출력합니다"

# 비밀 저장소는 OS마다 다르다. macOS 만 실측했고 나머지는 명령 존재만 확인한다.
SECRET_BACKEND=none
if [ "$(uname -s)" = "Darwin" ] && command -v security >/dev/null; then
  SECRET_BACKEND=keychain
  ok "macOS 키체인 사용 가능"
elif command -v secret-tool >/dev/null; then
  SECRET_BACKEND=secret-tool
  warn "secret-tool(GNOME Keyring) 을 찾았습니다 — 이 경로는 미검증입니다"
elif command -v pass >/dev/null; then
  SECRET_BACKEND=pass
  warn "pass 를 찾았습니다 — 이 경로는 미검증입니다"
else
  warn "비밀 저장소를 찾지 못했습니다 ($(uname -s))."
  warn "토큰이 ~/.claude.json 에 평문으로 저장됩니다."
fi

say "2/6  의존성"
(cd "$DIR" && npm install --silent) && ok "설치 완료"
(cd "$DIR" && npm test >/dev/null 2>&1) && ok "테스트 통과" || die "테스트 실패 — npm test 로 확인하세요"

# ── 3. 토큰 ──────────────────────────────────────────────────────────
say "3/6  토큰"
cat <<'HINT'
  Atlassian 계정 → Security → "Create API token with scopes" 로 발급합니다.
  (스코프 없는 "Create API token" 으로 만들면 Bitbucket 에서 동작하지 않습니다)

  필요한 스코프:
    read:repository:bitbucket
    read:pullrequest:bitbucket
    write:pullrequest:bitbucket   (코멘트를 달 경우)
HINT

EMAIL=""; read -rp "  Atlassian 계정 이메일: " EMAIL || true
[ -n "$EMAIL" ] || die "이메일이 필요합니다"

if [ "$SECRET_BACKEND" = keychain ]; then
  if security find-generic-password -s "$SERVICE" >/dev/null 2>&1; then
    R=""; read -rp "  키체인에 '$SERVICE' 가 이미 있습니다. 덮어쓸까요? [y/N] " R || true
    [ "${R:-N}" = "y" ] || { ok "기존 토큰 유지"; SKIP_TOKEN=1; }
  fi

  if [ "${SKIP_TOKEN:-0}" != 1 ]; then
    printf '  토큰 (입력은 표시되지 않습니다): '
    TOKEN=""; read -rs TOKEN || true; echo
    [ -n "$TOKEN" ] || die "토큰이 비어 있습니다"

    # 손으로 하면 놓치는 검증
    LEN=${#TOKEN}
    case "$TOKEN" in
      *$'\n'*) die "토큰에 개행이 들어 있습니다. 한 줄로 붙여넣으세요" ;;
    esac
    [ "$LEN" -ne 128 ] || warn "정확히 128자입니다 — 어딘가에서 잘렸을 수 있습니다"
    case "$TOKEN" in
      ATATT*) ok "형태 확인 (${LEN}자, ATATT)" ;;
      *) warn "ATATT 로 시작하지 않습니다 (${LEN}자). 그대로 진행합니다" ;;
    esac

    # -w 뒤에 값을 직접 준다. 대화형 프롬프트는 128자에서 자른다.
    # (값이 잠시 argv 에 노출된다 — 같은 머신의 다른 프로세스가 볼 수 있다)
    # -w 뒤에 값을 직접 준다. 대화형 프롬프트는 128자에서 자른다.
    # 값이 잠시 argv 에 노출된다 — 같은 머신의 다른 프로세스가 ps 로 볼 수 있다.
    security add-generic-password -U -s "$SERVICE" -a "$USER" -w "$TOKEN"

    BACK="$(security find-generic-password -s "$SERVICE" -w)"
    [ "${#BACK}" = "$LEN" ] || die "저장 후 길이가 다릅니다 (${#BACK} != $LEN). 잘렸습니다"
    case "$BACK" in
      *[!0-9a-fA-F]*) ok "평문으로 저장 확인" ;;
      *) die "hex 로 저장됐습니다. 토큰에 보이지 않는 문자가 있습니다" ;;
    esac
    unset TOKEN BACK
  fi
  TOKEN_ENV=(--env "BITBUCKET_TOKEN_CMD=security find-generic-password -s $SERVICE -w")
elif [ "$SECRET_BACKEND" = secret-tool ]; then
  TOKEN=""; read -rs -p "  토큰: " TOKEN || true; echo
  [ -n "$TOKEN" ] || die "토큰이 비어 있습니다"
  printf '%s' "$TOKEN" | secret-tool store --label="$SERVICE" service "$SERVICE" account "$USER"
  unset TOKEN
  TOKEN_ENV=(--env "BITBUCKET_TOKEN_CMD=secret-tool lookup service $SERVICE account $USER")
  warn "미검증 경로입니다. 등록 후 bb_doctor 로 토큰 형태를 확인하세요"
elif [ "$SECRET_BACKEND" = pass ]; then
  warn "pass 는 대화형 편집기를 띄웁니다. 아래 명령을 직접 실행한 뒤 다시 오세요:"
  echo "    pass insert bb-mcp/api-token"
  TOKEN_ENV=(--env "BITBUCKET_TOKEN_CMD=pass bb-mcp/api-token")
  warn "미검증 경로입니다. 등록 후 bb_doctor 로 토큰 형태를 확인하세요"
else
  warn "이 경로는 토큰이 ~/.claude.json 에 평문으로 저장됩니다."
  warn "설정 파일 접근 권한이 있는 주체는 토큰을 그대로 읽을 수 있습니다."
  TOKEN=""; read -rs -p "  토큰 (평문 저장됩니다): " TOKEN || true; echo
  [ -n "$TOKEN" ] || die "토큰이 비어 있습니다"
  TOKEN_ENV=(--env "BITBUCKET_API_TOKEN=$TOKEN")
  unset TOKEN
fi

# ── 4. 허용 저장소 ────────────────────────────────────────────────────
say "4/6  허용 저장소"
if [ -s "$ALLOWLIST" ] && grep -qvE '^\s*(#|$)' "$ALLOWLIST"; then
  chmod 600 "$ALLOWLIST" 2>/dev/null || true
  ok "$ALLOWLIST 에 $(grep -cvE '^\s*(#|$)' "$ALLOWLIST")개 있음 (권한 600)"
else
  echo "  리뷰할 저장소를 workspace/repo 형식으로 한 줄씩. 빈 줄로 종료."
  mkdir -p "$(dirname "$ALLOWLIST")"
  printf '# 리뷰 대상 저장소. 한 줄에 하나. `#` 이후는 주석.\n' > "$ALLOWLIST"
  N=0
  while true; do
    REPO=""; read -rp "  > " REPO || break
    [ -n "$REPO" ] || break
    case "$REPO" in
      */*/*|/*|*" "*) warn "형식이 아닙니다: $REPO" ; continue ;;
      */*) printf '%s\n' "$REPO" >> "$ALLOWLIST"; N=$((N+1)) ;;
      *) warn "workspace/repo 형식이어야 합니다: $REPO" ;;
    esac
  done
  [ "$N" -gt 0 ] || warn "비어 있습니다 — 모든 저장소가 차단됩니다(fail-closed)"
  chmod 600 "$ALLOWLIST"
  ok "$ALLOWLIST (${N}개, 권한 600)"
fi

# ── 5. 등록 ──────────────────────────────────────────────────────────
say "5/6  등록"
C=""; read -rp "  bb_comment(PR 코멘트 작성)를 허용할까요? [y/N] " C || true
ALLOW_COMMENT=$([ "${C:-N}" = "y" ] && echo true || echo false)

CMD=(claude mcp add --scope user
  --env "BITBUCKET_EMAIL=$EMAIL"
  "${TOKEN_ENV[@]}"
  --env "BITBUCKET_ALLOWED_REPOS_FILE=$ALLOWLIST"
  --env "BITBUCKET_ALLOW_COMMENT=$ALLOW_COMMENT"
  --transport stdio bitbucket -- "$NODE_BIN" "$DIR/server.mjs")

echo
# 화면·스크롤백에 토큰이 남지 않게 출력용 복사본에서 가린다
SHOWN=()
for A in "${CMD[@]}"; do
  case "$A" in
    BITBUCKET_API_TOKEN=*) SHOWN+=("BITBUCKET_API_TOKEN=<가림>") ;;
    *) SHOWN+=("$A") ;;
  esac
done
printf '  '; printf '%q ' "${SHOWN[@]}"; echo; echo

if command -v claude >/dev/null; then
  R=""; read -rp "  실행할까요? (기존 'bitbucket' 등록은 교체됩니다) [y/N] " R || true
  if [ "${R:-N}" = "y" ]; then
    claude mcp remove bitbucket >/dev/null 2>&1 || true
    "${CMD[@]}" && ok "등록 완료"
  else
    ok "위 명령을 직접 실행하세요"
  fi
fi

# ── 6. 스킬 ──────────────────────────────────────────────────────────
# 스킬은 두 경로 중 하나로만 설치한다. 둘 다 하면 같은 이름이 두 벌 생긴다.
#   (a) claude plugin  — ~/.claude/plugins/cache/... 에 놓인다. 갱신·제거가 쉽다
#   (b) 직접 복사       — ~/.claude/skills/ 에 놓인다. claude CLI 가 없어도 된다
say "6/6  리뷰 스킬"
SKILL_SRC="$DIR/plugin/skills/bb-pr-review"
SKILL_DST="$HOME/.claude/skills/bb-pr-review"
CMD_SRC="$DIR/plugin/commands/bb-review.md"
CMD_DST="$HOME/.claude/commands/bb-review.md"

if [ ! -d "$SKILL_SRC" ]; then
  die "$SKILL_SRC 를 찾을 수 없습니다. 저장소가 온전한지 확인하세요"
fi

# 플러그인으로 이미 깔려 있으면 복사하지 않는다 — 중복 방지
PLUGIN_INSTALLED=0
if command -v claude >/dev/null && claude plugin list 2>/dev/null | grep -q "bb-pr-review@"; then
  PLUGIN_INSTALLED=1
fi

if [ "$PLUGIN_INSTALLED" = 1 ]; then
  ok "플러그인으로 이미 설치돼 있습니다 — 복사하지 않습니다"
  echo "    갱신: claude plugin update bb-pr-review@bb-mcp"
elif command -v claude >/dev/null; then
  echo "  설치 방법을 고르세요."
  echo "    1) claude plugin  (권장 — 갱신·제거가 쉽다)"
  echo "    2) 직접 복사       ($SKILL_DST)"
  echo "    3) 건너뛰기"
  CH=""; read -rp "  [1/2/3] " CH || true
  case "${CH:-1}" in
    1)
      claude plugin marketplace add "$DIR" >/dev/null 2>&1         || claude plugin marketplace add ./ >/dev/null 2>&1 || true
      if claude plugin install bb-pr-review@bb-mcp --scope user -y; then
        ok "플러그인 설치 완료"
      else
        warn "플러그인 설치 실패. 2번(직접 복사)으로 다시 시도하세요"
        warn "같은 이름의 마켓플레이스가 다른 소스로 등록돼 있으면 거부됩니다:"
        echo "    claude plugin marketplace remove bb-mcp"
      fi
      ;;
    2) COPY_SKILL=1 ;;
    *) ok "건너뜀" ;;
  esac
else
  warn "claude CLI 가 없어 직접 복사합니다"
  COPY_SKILL=1
fi

if [ "${COPY_SKILL:-0}" = 1 ]; then
  if [ -e "$SKILL_DST" ]; then
    R=""; read -rp "  $SKILL_DST 가 이미 있습니다. 덮어쓸까요? [y/N] " R || true
    [ "${R:-N}" = "y" ] && { cp -R "$SKILL_SRC/." "$SKILL_DST/" && ok "갱신"; } || ok "기존 유지"
  else
    mkdir -p "$SKILL_DST"
    cp -R "$SKILL_SRC/." "$SKILL_DST/" && ok "$SKILL_DST"
  fi
  if [ -f "$CMD_SRC" ]; then
    mkdir -p "$(dirname "$CMD_DST")"
    cp "$CMD_SRC" "$CMD_DST" && ok "/bb-review 명령"
  fi
fi

echo "  → 다음 세션에서 /bb-pr-review 와 /bb-review 가 뜹니다"

say "다음"
cat <<'NEXT'
  1. Claude Code 세션을 재시작합니다 (설정·스킬은 기동 시 읽힙니다)
  2. 세션에서 bb_doctor 를 부릅니다 — 토큰·스코프·allowlist·게이트를 한 번에 점검합니다
  3. 문제가 있으면 bb_doctor 가 실행할 명령까지 알려줍니다

  저장소를 추가·삭제할 때는 allowlist 파일에 한 줄 넣고 세션을 재시작합니다.
NEXT
