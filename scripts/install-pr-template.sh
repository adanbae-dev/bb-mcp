#!/usr/bin/env bash
# Bitbucket PR 템플릿을 저장소 로컬 클론의 .bitbucket/ 에 복사한다.
#
#   scripts/install-pr-template.sh <저장소 경로> [<저장소 경로> ...]
#
# 커밋·푸시는 하지 않는다 — 남의 저장소에 쓰는 일이라 사람이 확인하고 올린다.
# Bitbucket 은 PR 의 source 브랜치에 있는 템플릿을 쓰므로, main 에 머지된 뒤에
# 딴 브랜치부터 나타난다.
#
# 이미 다른 내용의 템플릿이 있으면 묻는다. 대화형이 아니면 덮어쓰지 않는다.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$DIR/plugin/skills/bb-pr-create/pull_request_template.md"
REL=".bitbucket/pull_request_template.md"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; }

[ -f "$SRC" ] || { fail "템플릿 원본이 없습니다: $SRC"; exit 1; }
[ "$#" -gt 0 ] || { echo "사용법: $0 <저장소 경로> [...]" >&2; exit 2; }

N_COPY=0; N_SAME=0; N_SKIP=0; N_FAIL=0
COPIED=()

for arg in "$@"; do
  # 경로가 저장소 안 하위 폴더여도 저장소 루트에 둔다
  if ! top="$(git -C "$arg" rev-parse --show-toplevel 2>/dev/null)"; then
    fail "$arg — git 저장소가 아닙니다"; N_FAIL=$((N_FAIL + 1)); continue
  fi
  # remote 이름이 origin 이라고 가정하지 않는다 — 실측 저장소에 remote 가 4개 있었다
  if ! git -C "$top" remote -v | grep -q 'bitbucket\.org'; then
    warn "$top — bitbucket.org remote 가 없어 건너뜁니다 (Bitbucket 이 아니면 이 파일을 읽지 않는다)"
    N_SKIP=$((N_SKIP + 1)); continue
  fi

  dst="$top/$REL"
  # 링크를 따라가면 저장소 밖 파일을 덮어쓴다 — 남의 저장소라 내용을 믿지 않는다
  if [ -L "$top/.bitbucket" ] || [ -L "$dst" ]; then
    fail "$top — .bitbucket 또는 템플릿이 심볼릭 링크라 쓰지 않습니다"; N_FAIL=$((N_FAIL + 1)); continue
  fi
  if [ -f "$dst" ]; then
    if cmp -s "$SRC" "$dst"; then
      ok "$top — 이미 같은 템플릿입니다"; N_SAME=$((N_SAME + 1)); continue
    fi
    warn "$top — 다른 내용의 템플릿이 이미 있습니다"
    diff -u "$dst" "$SRC" | sed -n '1,40p' | sed 's/^/      /' || true
    if [ ! -t 0 ]; then
      warn "대화형이 아니라 덮어쓰지 않습니다"; N_SKIP=$((N_SKIP + 1)); continue
    fi
    R=""; read -rp "  덮어쓸까요? (저장소 쪽 템플릿이 사라집니다) [y/N] " R || true
    case "$R" in
      y|Y) ;;
      *) warn "그대로 둡니다"; N_SKIP=$((N_SKIP + 1)); continue ;;
    esac
  fi

  if mkdir -p "$top/.bitbucket" && cp "$SRC" "$dst"; then
    ok "$dst"; N_COPY=$((N_COPY + 1)); COPIED+=("$top")
  else
    fail "$top — 복사 실패"; N_FAIL=$((N_FAIL + 1))
  fi
done

echo "  복사 ${N_COPY} · 이미 같음 ${N_SAME} · 건너뜀 ${N_SKIP} · 실패 ${N_FAIL}"

if [ "${#COPIED[@]}" -gt 0 ]; then
  echo
  echo "  커밋·푸시는 하지 않았습니다. 확인 후 저장소마다:"
  for top in "${COPIED[@]}"; do
    echo "    git -C \"$top\" add $REL && git -C \"$top\" commit -m 'chore: PR 템플릿 추가'"
  done
  echo "  Bitbucket 은 PR 의 source 브랜치에 있는 템플릿을 씁니다 —"
  echo "  기본 브랜치에 머지된 뒤에 딴 브랜치부터 나타납니다."
fi

# 조용한 실패를 남기지 않는다 — 하나라도 실패하면 0 이 아니다
[ "$N_FAIL" -eq 0 ]
