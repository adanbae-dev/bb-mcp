# 개발과 릴리스

[← README](../README.md) · 파일 구성, 버전 올리는 순서, 동작 확인

## 파일


| 파일 | 역할 |
|---|---|
| `server.mjs` | MCP 툴 등록, HTTP, 설정 |
| `lib.mjs` | 가드·파서·응답 축약 등 순수 로직 (테스트 대상) |
| `test/lib.test.mjs` | 단위 테스트 |
| `test/integration.test.mjs` | 가짜 Bitbucket API + 실제 MCP 클라이언트 |
| `test/forbidden.test.mjs` | 사내 이름·실명·티켓 키가 새는지 검사 (해시 대조) |
| `test/docs.test.mjs` | 문서가 코드·스킬과 갈렸는지 검사 (툴 시그니처·개수, 템플릿 절, 리뷰 등급·태그 등) |
| `test/manifest.test.mjs` | 버전 세 곳 일치, 마켓플레이스·플러그인 매니페스트 |
| `test/template-install.test.mjs` | `scripts/install-pr-template.sh` — 실제 git 저장소로 복사·건너뜀·덮어쓰기 거부 |
| `setup.sh` | 대화형 설정 도우미 (키체인·allowlist·서버 등록·플러그인 설치) |
| `.github/workflows/test.yml` | CI — Node 18·20·22·24 에서 테스트 (GitHub 전용. Bitbucket 은 「1-2. Bitbucket 저장소에서 받아 쓰기」) |
| `.claude-plugin/marketplace.json` | 마켓플레이스 매니페스트 (`source: "./plugin"`) |
| `plugin/` | 플러그인 루트 — 매니페스트·스킬·명령 |
| `plugin/skills/bb-pr-review/` | 한국어 PR 리뷰 스킬 |
| `plugin/skills/bb-pr-create/` | PR 생성 스킬 (초안 작성 + 중복 검사) |
| `plugin/commands/` | `/bb-review`, `/bb-prs`, `/bb-pr-new`, `/bb-doctor`, `/bb-repos` |
| `scripts/install-pr-template.sh` | PR 템플릿을 저장소 로컬 클론의 `.bitbucket/` 에 복사 (커밋·푸시 안 함) |
| [`CLAUDE.md`](../CLAUDE.md) | 이 저장소에서 반복해 대가를 치른 작업 규칙 7개 |
| [`LICENSE`](../LICENSE) | MIT |
| [`CHANGELOG.md`](../CHANGELOG.md) | 버전별 변경 이력 |
| [`docs/review-principles.md`](./review-principles.md) | 리뷰 5대 원칙 + 코멘트 등급(P1/P2/P3/Q)의 출처와 사람이 지키는 운영 규칙 |
| [`docs/pr-template.md`](./pr-template.md) | PR 템플릿 채우는 규칙 · 팀 저장소에 거는 법(`.bitbucket/pull_request_template.md`) |
| [`plugin/skills/bb-pr-create/pull_request_template.md`](../plugin/skills/bb-pr-create/pull_request_template.md) | PR 템플릿 단일 소스 — 6개 절 + 리뷰 규칙(P1/P2/P3/Q). 팀 저장소에 그대로 복사 |
| [`docs/posts/`](./posts) | 만들며 틀린 것을 정리한 글 ([README](../README.md) 「기록」) |
| `.mcp.json.example` | project 스코프 설정 예시 |
| [`Settings.md`](../Settings.md) | **설정 절차와 트러블슈팅** |

`.config/`는 `.gitignore`에 들어 있다. 허용 저장소 목록에 사내 저장소 이름이 담긴다.


## 플러그인 릴리스

### 플러그인을 고쳤을 때 — 버전 올리는 순서

**버전이 세 곳에 있고 전부 맞아야 한다.** 어긋나면
`claude plugin update` 가 `already at the latest version` 으로 **조용히 스킵**해서
새 코드가 설치본에 반영되지 않는다.

| 파일 | 필드 |
|---|---|
| `package.json` | `version` |
| `plugin/.claude-plugin/plugin.json` | `version` |
| `.claude-plugin/marketplace.json` | `plugins[].version` |

`npm test` 가 세 곳의 일치를 검사한다(`test/manifest.test.mjs`). 잊으면 테스트가 깨진다.

순서:

```bash
# 1. 세 곳을 같은 값으로
npm pkg set version=0.11.0
#    plugin/.claude-plugin/plugin.json  → "version": "0.11.0"
#    .claude-plugin/marketplace.json    → plugins[0].version: "0.11.0"

# 2. 검증
npm test                          # 버전 일치 + 나머지 전부
claude plugin validate ./plugin
claude plugin validate .

# 3. 원격에 올린다 — 마켓플레이스가 git 을 읽으므로 푸시가 먼저다
git commit -am "..." && git push

# 4. 마켓플레이스 캐시부터 갱신. 이걸 빼면 옛 매니페스트를 본다
claude plugin marketplace update bb-mcp

# 5. 플러그인 갱신
claude plugin update bb-pr-review@bb-mcp
#    ✔ updated from 0.10.0 to 0.11.0. Restart to apply changes.

# 6. 세션 재시작
```

**3번(푸시)이 4번보다 먼저**여야 한다. GitHub 소스 마켓플레이스는 원격 git 을
읽으므로, 푸시하지 않은 커밋은 보이지 않는다. 로컬 경로(`add ./`)로 등록했으면
푸시 없이도 되지만, 그때도 `marketplace update` 는 필요하다.

`claude plugin tag` 는 `{name}--v{version}` git 태그를 만들면서
`plugin.json` 과 마켓플레이스 항목이 일치하는지 검증한다(`package.json` 은 안 본다).

## 동작 확인

```bash
npm test    # 213개 (2026-10-15) — 파일별 개수는 아래
```

`test` 스크립트는 `node --test test/*.test.mjs` 다. **파일을 나열하지 않는다** —
전에 3개를 하드코딩해서 새 테스트 파일이 조용히 실행되지 않았다(0.18.0).

따옴표 글롭(`"test/**/*.test.mjs"`)을 먼저 썼다가 되돌렸다. **Node 가 직접 확장하므로
셸에 의존하지 않는다**고 판단했는데, 그 네이티브 글롭이 Node 22 부터라서 **셸 의존을
없애는 대신 Node 버전 의존을 만들었다.** CI 매트릭스가 18·20 에서
`Could not find 'test/**/*.test.mjs'` 로 잡았다. 셸 글롭은 전 버전에서 돈다.


- `test/lib.test.mjs` (90) — 경로 가드, **URL 정규화 판정(경로 탈출 회귀)**,
  필드 추출, 토큰 명령 파싱, 토큰 위생 검사, allowlist 파일 파서, 코멘트 페이로드,
  diff 잘라내기, 재시도 판정, 줄 번호, 동시성·크기 상한, **진단 로직·토큰 미노출**
- `test/forbidden.test.mjs` (2) — 추적 파일에 사내 저장소 이름·실명·티켓 키가
  있는지. **원문이 아니라 SHA-256 만 저장한다** — 평문 목록을 두면 그 파일이 곧
  유출원이 되어 검사를 추가하려다 검사 대상을 만드는 셈이다. 걸리면 위치만 알린다
  (CI 로그가 또 하나의 유출 경로다). 토큰 경계에서만 잡는 denylist 라는 한계가 있다
- `test/docs.test.mjs` (20) — 코드의 툴 이름·파라미터가 docs/usage.md 와, 개수가 README 와 갈렸는지.
  PR 템플릿 절이 스킬·명령·README 와 같은지, 리뷰 등급(P1/P2/P3/Q)·분류 태그·지적 목록 표·
  옛 이모지 잔존, 스킬 규격(name·description·500줄), 참조 파일 연결, 게이트 환경변수 실재.
  문서 드리프트는 **틀려도 아무 데서도 안 터지는** 종류라 세 릴리스 연속으로
  "확인했다" 뒤에 누락이 더 나왔다. 이름과 파라미터 **존재**만 본다 —
  설명 문장의 정확성은 기계로 볼 수 없다
- `test/manifest.test.mjs` (4) — 버전 세 곳 일치, 마켓플레이스 경로,
  플러그인이 MCP 서버를 선언하지 않음, 스킬·명령 경로
- `test/template-install.test.mjs` (5) — PR 템플릿 설치 스크립트를 실제 `git init` 저장소로.
  하위 폴더 → 루트, remote 이름 무관, Bitbucket 아니면 건너뜀, 비대화형이면 기존 템플릿을
  덮어쓰지 않음, git 저장소가 아니면 실패 코드, setup.sh 가 묻고 나서만 설치
- `test/integration.test.mjs` (92) — 로컬 가짜 Bitbucket API에 실제 MCP 클라이언트를
  붙여 툴 등록, 페이지네이션 추적, 게이트 동작, 저장소 차단, allowlist 파일의
  스냅샷/재읽기·fail-closed, 인박스 오류 격리, 429/5xx 재시도와 **쓰기 비재시도**,
  **퍼센트 인코딩 경로 탈출 차단**, **토큰 유출 방어**, 동시성 상한,
  **bb_doctor(정상/hex/빈 allowlist/probe=false/읽기 전용/출력 위생)**,
  **외부 입력 표시** 를 확인

### 라이브 API 검증 상태

응답 필드 매핑은 실제 Bitbucket Cloud 응답으로 확인했다(2026-09-03, 비공개 저장소 12개).

| 항목 | 상태 |
|---|---|
| `bb_repos` 메타데이터 (`mainbranch.name` → `main_branch` 등) | 확인 |
| `bb_pr_list` / `bb_pr_get` 필드 축약 | 확인 |
| `participants[].approved` → `approved_by` | 확인 |
| `bb_pr_files` diffstat (rename의 `old_path` 포함) | 확인 |
| `bb_pr_diff` 의 `?path=` 필터 | 확인 |
| `sort=-updated_on` (PR 최근 갱신순) | 확인 |
| `/src/{ref}/{path}` 파일 본문 (괄호 포함 경로도) | 확인 |
| diff 잘라내기 (77KB → 지정 바이트, 줄 경계) | 확인 |
| `bb_pr_comments` 본문·작성자·URL | 확인 |
| 재시도·백오프·디버그 로그 (토큰 미노출) | 확인 (가짜 API) |
| 경로 탈출 차단 (수정 전 우회 재현 → 수정 후 차단) | 확인 (가짜 API) |
| `bb_comment` 인라인 게시와 `inline.to` 해석 | 확인 |

**`inline.to` = 변경 후 파일의 줄 번호**가 실측으로 확인됐다.

`+1`줄만 바뀐 파일을 골라 교차 검증했다. diff hunk `@@ -422,4 +422,5 @@` 로
추가된 줄이 변경 후 424줄임을 계산하고, `bb_file` 로 같은 커밋의 424줄이
그 줄임을 확인한 뒤, `bb_comment(line: 424)` 로 게시하고 다시 읽어
`inline: { from: null, to: 424 }` 로 저장된 것을 확인했다.

즉 **`bb_pr_diff` 의 변경 후 줄 번호 = `bb_file` 의 줄 번호 = `bb_comment` 의 `line`**
세 개가 같은 좌표계다. `bb_file` 이 보여주는 번호를 그대로 넘기면 된다.
변경 전 파일의 줄을 지목할 때만 `side: "old"` 를 쓴다.

### 직접 붙여보기

```bash
BITBUCKET_EMAIL=you@company.com BITBUCKET_API_TOKEN=xxx \
  BITBUCKET_ALLOWED_REPOS=ws/repo BITBUCKET_DEBUG=true \
  npx @modelcontextprotocol/inspector node server.mjs
```

세션 안에서는 인자 없이 `bb_repos`를 부르는 게 가장 빠른 확인이다.
allowlist 소스와 파일 경로, 각 저장소 메타데이터를 한 번에 돌려준다.

설정이 틀리면 서버는 stderr에 원인을 남기고 종료한다(exit 1).
MCP 클라이언트에는 "연결 실패"로만 보이므로, 로그를 봐야 원인이 나온다.

증상별 원인은 [Settings.md §9](../Settings.md)에 정리돼 있다.
