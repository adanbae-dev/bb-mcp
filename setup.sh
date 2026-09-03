#!/usr/bin/env bash
# bb-mcp 설정 도우미.
# 손으로 하면 걸리는 함정들을 대신 처리한다:
#   - security 대화형 프롬프트의 128자 절단
#   - 토큰에 개행이 섞여 hex로 저장되는 문제
#   - claude mcp add 의 `--` 위치 / --env 뒤 이름 / node 절대경로
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="bb-api-token"
ALLOWLIST="${BB_MCP_ALLOWLIST:-$HOME/.config/bb-mcp/allowed-repos}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. 사전 확인 ──────────────────────────────────────────────────────
say "1/5  사전 확인"

command -v node >/dev/null || die "node 를 찾을 수 없습니다"
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 18+ 가 필요합니다 (현재 $(node -v))"
ok "node $(node -v) — $NODE_BIN"

command -v claude >/dev/null || warn "claude CLI 가 없습니다. 4단계에서 명령만 출력합니다"

HAVE_KEYCHAIN=0
if command -v security >/dev/null && [ "$(uname -s)" = "Darwin" ]; then
  HAVE_KEYCHAIN=1
  ok "macOS 키체인 사용 가능"
else
  warn "키체인이 없습니다. 토큰을 BITBUCKET_API_TOKEN 환경변수로 직접 넣어야 합니다"
fi

say "2/5  의존성"
(cd "$DIR" && npm install --silent) && ok "설치 완료"
(cd "$DIR" && npm test >/dev/null 2>&1) && ok "테스트 통과" || die "테스트 실패 — npm test 로 확인하세요"

# ── 3. 토큰 ──────────────────────────────────────────────────────────
say "3/5  토큰"
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

if [ "$HAVE_KEYCHAIN" = 1 ]; then
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
else
  warn "이 경로는 토큰이 ~/.claude.json 에 평문으로 저장됩니다."
  warn "설정 파일 접근 권한이 있는 주체는 토큰을 그대로 읽을 수 있습니다."
  TOKEN=""; read -rs -p "  토큰 (평문 저장됩니다): " TOKEN || true; echo
  [ -n "$TOKEN" ] || die "토큰이 비어 있습니다"
  TOKEN_ENV=(--env "BITBUCKET_API_TOKEN=$TOKEN")
  unset TOKEN
fi

# ── 4. 허용 저장소 ────────────────────────────────────────────────────
say "4/5  허용 저장소"
if [ -s "$ALLOWLIST" ] && grep -qvE '^\s*(#|$)' "$ALLOWLIST"; then
  ok "$ALLOWLIST 에 $(grep -cvE '^\s*(#|$)' "$ALLOWLIST")개 있음"
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
  ok "$ALLOWLIST (${N}개)"
fi

# ── 5. 등록 ──────────────────────────────────────────────────────────
say "5/5  등록"
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

say "다음"
cat <<'NEXT'
  1. Claude Code 세션을 재시작합니다 (설정은 기동 시 읽힙니다)
  2. 세션에서 bb_doctor 를 부릅니다 — 토큰·스코프·allowlist·게이트를 한 번에 점검합니다
  3. 문제가 있으면 bb_doctor 가 실행할 명령까지 알려줍니다

  저장소를 추가·삭제할 때는 allowlist 파일만 고치면 됩니다 (재시작 불필요).
NEXT
