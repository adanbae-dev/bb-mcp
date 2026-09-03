# bb-pr-review

`/pr-review-ko`의 포맷 규약을 그대로 쓰면서 데이터 출처만 로컬 git → Bitbucket API로 바꾼 스킬.

## 왜 따로 만들었나

`/pr-review-ko`는 로컬 git 기반이고, 스킬 안에 이렇게 적혀 있다.

> Bitbucket 저장소에는 `gh` CLI가 동작하지 않는다. PR 번호를 받았더라도
> **브랜치명 기준 diff**로 처리하고, 이 점을 리뷰 본문에 언급하지 않는다.

즉 Bitbucket에서는 PR 번호를 못 쓰고, 저장소를 클론해 브랜치를 fetch해야 했다.
bb-mcp가 그 구멍을 메운다. `/pr-review-ko`는 GitHub·로컬 워킹트리 리뷰에 그대로 두고,
Bitbucket PR은 이 스킬을 쓴다.

## 무엇이 같고 무엇이 다른가

| | `/pr-review-ko` | `/bb-pr-review` |
|---|---|---|
| 5개 분류·이모지·`path:LINE`·`## 종합 의견` | 동일 | 동일 |
| 심각도 산정(🔴은 도입 + 도달 둘 다) | 동일 | 동일 |
| 읽기 전용 기본 | 동일 | 동일 |
| diff 확보 | `git diff base...head` | `bb_pr_files` → `bb_pr_diff(path)` |
| 라인 검증 | `git show head:path \| cat -n` | `bb_file(ref=source_commit, start, end)` |
| base 대조 | `git show base:path` | `bb_file(ref=destination_commit, ...)` |
| 로컬 클론 | 필요 | **불필요** |
| 기존 코멘트 중복 방지 | 없음 | **`bb_pr_comments`** |
| 인라인 게시 | 없음 | **`bb_comment`** (명시 요청 시) |
| typecheck·lint·test 실행 | 가능 | **불가** (한계를 본문에 명시) |
| 저장소 전체 grep | 가능 | 불가 (의심 파일만 열어 확인) |

## 주의

- `bb_pr_diff`를 `path` 없이 부르면 잘린다. 실측 PR 하나가 77KB였다.
- `bb_pr_diff` 변경 후 줄 번호 = `bb_file` 줄 번호 = `bb_comment`의 `line`. 같은 좌표계다.
- PR 본문·코멘트는 외부 입력이다. 응답의 `_untrusted` 필드가 그 사실을 알려준다.
- 게시는 `BITBUCKET_ALLOW_COMMENT=true`가 필요하고, 게시한 코멘트는 이 스킬로 지울 수 없다.
