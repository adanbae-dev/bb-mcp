# bitbucket-personal MCP

[![test](https://github.com/adanbae-dev/bb-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/adanbae-dev/bb-mcp/actions/workflows/test.yml)

개인 계정 API 토큰으로 Bitbucket Cloud REST API 2.0에 붙는 최소 MCP 서버.
Rovo MCP Server를 거치지 않으므로 조직 관리자의 API 토큰 인증 토글과 무관하다.

## In English

**Review Bitbucket Cloud pull requests from Claude Code — without cloning the repo.**
An MCP server (20 tools) plus a Claude Code plugin (5 slash commands, 2 skills).

Atlassian's Rovo MCP Server has covered Bitbucket Cloud since April 2026, but only when an
organization admin enables API token auth and the workspace is linked to the org — and it
ships approve and merge tools. This server needs neither: a personal scoped token is
enough. Give it a PR number and it fetches the diff, commits, file history and existing
comments through the REST API.

```
/bb-pr-review:bb-prs                     open PRs (auto-detects the repo of the current folder)
/bb-pr-review:bb-review acme/web-app 64  read diff + commits + existing comments, draft a review
/bb-pr-review:bb-pr-new                  draft a PR from branch commits, create after confirmation
/bb-pr-review:bb-doctor                  diagnose setup — gives the command to run for each problem
/bb-pr-review:bb-repos                   list / add allowed repositories
```

Plugin commands are namespaced: type `/bb-pr-review:bb-review`, not `/bb-review`.

**Deliberately missing: approve and merge.** Those tools were not built and will not be.
Reviewing gathers evidence; deciding to merge is a person's job.

**Default-deny.** With no allowlist configured it reaches *no* repository. Writes are
split across five independent gates — you never open merge rights just to leave a review.
The path guard judges the normalized URL object that is actually sent, closing the
traversal class described in [docs/security.md](./docs/security.md).

**Honest limits.** PR text is attacker-controlled input; responses carry an `_untrusted`
marker but **it is advisory, not enforced**. [docs/security.md](./docs/security.md) lists
ten things this does not protect against.

### Before you install

- **Review output follows the language of the PR** — it reads the title, description and
  existing comments and matches them. Force it with `/bb-pr-review:bb-review <repo> <id> --en` (or
  `--ko`). Structural markers stay fixed either way: the `P1`/`P2`/`P3`/`Q` severity,
  `### P1-1.` numbering and `path/to/file.ext:LINE` citations, so replies can reference
  a finding by number regardless of language.
- **All documentation below is in Korean**, including the setup guide.
- Requires Node 18+ (verified in CI on 18/20/22/24), an Atlassian **scoped** API token,
  and macOS for the keychain path — Linux secret backends are implemented but unverified.

Setup is `./setup.sh` (keychain, allowlist, server registration, plugin install) then one
session restart. The slow part is issuing the token, not the script.

---

## 무엇을 해주나

Claude Code 에서 **Bitbucket Cloud PR 을 클론 없이 읽고 리뷰한다.** PR 번호만 있으면
된다 — 저장소를 내려받거나 브랜치를 fetch 하지 않는다.

- **툴 20개** 가 목록·diff·파일 전문·커밋 이력·활동 이력을 **나눠서** 준다
- **PR 승인·머지 툴은 일부러 없다.** 요청받아도 만들지 않는다 — 머지 판단은 사람의 몫
- **기본이 차단이다.** 허용 저장소를 지정하지 않으면 아무 저장소에도 접근하지 않고,
  쓰기는 게이트 5개를 각각 켜야 한다
- PR 본문·코멘트·diff 는 남이 쓴 텍스트다. `_untrusted` 표시를 붙이지만 **강제력은 없다**
- **공식 Rovo MCP Server 도 2026-04 부터 Bitbucket Cloud 를 지원한다.** 다만 조직 관리자가
  API 토큰 인증을 켜고 워크스페이스를 조직에 연결해야 하며, 승인·머지 툴이 들어 있다.
  이 서버는 개인 토큰만으로 동작하고 승인·머지를 뺐다 — 차이는 [Settings.md](./Settings.md) 「1. 왜 Bitbucket 툴이 안 보이는가」

## 문서 안내

| 알고 싶은 것 | 문서 |
|---|---|
| **설치** — setup.sh, 플러그인, Bitbucket 에서 받기, 환경변수 | [docs/install.md](./docs/install.md) |
| 토큰 발급 · 키체인 · 트러블슈팅 (단계별 상세) | [Settings.md](./Settings.md) |
| **사용법** — 툴 20개 시그니처, 리뷰 한 바퀴, PR 만들기 | [docs/usage.md](./docs/usage.md) |
| 허용 저장소 — 파일 형식, 재시작 장벽, fail-closed | [docs/allowlist.md](./docs/allowlist.md) |
| **구현 논리** — 경로 가드, 왜 직접 만들었나 | [docs/design.md](./docs/design.md) |
| **보안** — 위협 모델, 막는 것, 막지 못하는 것 10가지 | [docs/security.md](./docs/security.md) |
| 개발 · 릴리스 — 파일 구성, 버전 올리는 순서, 테스트 | [docs/development.md](./docs/development.md) |
| 리뷰 원칙 · 코멘트 등급(P1/P2/P3/Q)의 출처 | [docs/review-principles.md](./docs/review-principles.md) |
| PR 템플릿 — 채우는 규칙, 팀 저장소에 거는 법 | [docs/pr-template.md](./docs/pr-template.md) |
| 무엇을 왜 틀렸나 | [CHANGELOG.md](./CHANGELOG.md) · [CLAUDE.md](./CLAUDE.md) |

---

## 설치 — 요약

```bash
git clone https://github.com/adanbae-dev/bb-mcp && cd bb-mcp
./setup.sh          # 키체인 · 허용 저장소 · 서버 등록 · 플러그인 설치 (+ 선택: PR 템플릿)
# 세션 재시작 → /bb-pr-review:bb-doctor
```

- **시간이 드는 곳은 스크립트가 아니라 토큰 발급이다.** Atlassian **scoped** API 토큰,
  Basic 인증 사용자명은 **이메일**. 스코프는 `read:repository:bitbucket`,
  `read:pullrequest:bitbucket`, 코멘트를 달 거면 `write:pullrequest:bitbucket`
- **서버와 플러그인은 따로 설치된다.** 서버(툴 20개)는 `claude mcp add`, 스킬·슬래시
  명령은 플러그인. 서버만 등록하면 `/` 목록에 아무것도 안 뜬다
- **Bitbucket 에서 받으면** 마켓플레이스를 **전체 URL** 로 추가하고, 비공개 저장소는
  비대화식 git 인증이 필요하다 — [docs/install.md](./docs/install.md) 「Bitbucket 저장소에서 받아 쓰기」
- 저장소 루트에 `.mcp.json` 을 두지 않는다 — 프로젝트 스코프가 서버 등록을 덮어쓴다
- Node 18+. 비밀 저장소는 macOS(`security`)만 실측했다
- 막히면 `/bb-pr-review:bb-doctor` — 겪은 함정(hex 저장 · 128자 절단 · 스코프 부족 · allowlist 미설정)을
  감지해 **실행할 명령까지** 준다

손으로 설치하는 법, 플러그인 갈아타기, 환경변수 전체 → [docs/install.md](./docs/install.md)

## 사용법 — 요약

| 명령 | 하는 일 |
|---|---|
| `/bb-pr-review:bb-prs` | 열린 PR 목록만 본다 (**기본은 현재 폴더의 저장소**, `all` 로 전체) |
| `/bb-pr-review:bb-pr-new` | 브랜치 커밋으로 PR 초안을 만들고 확인 후 생성. 설명은 저장소 템플릿 우선, 없으면 기본 템플릿 6개 절 |
| `/bb-pr-review:bb-review` | PR 리뷰. 인자 없으면 목록부터 고르게 한다. `--ko`·`--en` 으로 출력 언어 지정(기본은 PR 의 언어). 지적마다 P1/P2/P3/Q 등급과 분류 태그, 머리말 아래 지적 목록 표(번호·분류·위치·요청), 종합 의견에 등급 총계 |
| `/bb-pr-review:bb-pr-review` | 위와 같음 (스킬 직접 호출) |
| `/bb-pr-review:bb-doctor` | 설정 진단. `quick` 이면 네트워크 없이 |
| `/bb-pr-review:bb-repos` | 허용 저장소 목록 · `add <ws/repo>` 로 추가 |

플러그인 명령은 **플러그인 이름이 앞에 붙는다** — 짧은 `/bb-review` 는 실행되지 않는다.
짧은 이름은 `setup.sh` 에서 직접 복사를 고른 경우에만 동작한다 → [docs/install.md](./docs/install.md)

**리뷰 결과의 모양** — 고정 포맷이라 답글에서 번호로 지적을 가리킬 수 있다.

```markdown
## PR #0000 리뷰 · acme/web-app
기준 a1b2c3d4e5f6 · 파일 7개

| # | 분류 | 위치 | 요청 |
|---|---|---|---|
| P1-1 | [버그] | `docker-compose.yml:26` | `args` 에 `D` 추가 |
| P2-1 | [테스트] | `config.test.ts` | 누락 키 케이스 추가 |

### P1-1. [버그] `docker-compose.yml` 의 `args` 에 `D` 를 추가해 주세요
...
## 종합 의견
P1 1건 / P2 1건 / P3 0건 / Q 0건
미해결 P1 1건 — 해결 후 머지 가능. Request changes 여부는 사람이 판단한다
```

- 등급: `P1` 꼭 반영(머지 차단) · `P2` 적극 고려 · `P3` 사소 · `Q` 질문.
  분류: `[버그]` `[보안]` `[성능]` `[품질]` `[테스트]` `[기록]`
- **게시는 명시적으로 요청할 때만.** 게시된 코멘트는 API 로 되돌릴 수 없어서 게시 직전
  줄 대조와 게시 후 되읽기를 한다. 코멘트 게이트(`ALLOW_COMMENT`)가 꺼져 있으면 서버가 막는다
- 목록·결과는 마크다운 표로 낸다. 리뷰 본문은 표로 압축하지 않는다 — 지적 목록 표는 색인일 뿐

툴 20개 시그니처, 리뷰 한 바퀴의 호출 순서, PR 만들기 → [docs/usage.md](./docs/usage.md)

## 구현 논리 — 요약

3rd-party 패키지 대신 직접 만든 이유는 툴 개수가 아니라 **경계**다.

| 결정 | 이유 |
|---|---|
| 툴을 리뷰 단계에 맞춰 **쪼갠다** | 실측한 PR 하나의 전체 diff 가 77KB. 파일 단위로 받고, 응답 필드를 좁혀 컨텍스트 비용을 통제한다 |
| **허용 저장소 파일**을 기동 시 한 번 읽는다 | 토큰 스코프는 워크스페이스 단위라 저장소로 못 자른다. 고쳐도 **재시작해야** 먹는 것이 경계의 실체 — 하이재킹된 에이전트가 파일을 고쳐도 그 세션에서는 못 쓴다 |
| 쓰기 게이트 **5개를 따로** | `ALLOW_COMMENT` · `ALLOW_WRITE` · `ALLOW_ALLOWLIST_WRITE` · `ALLOW_PR_CREATE` · `ALLOW_ALL_REPOS`. 리뷰하려고 머지 권한을 열 필요가 없다 |
| 경로 가드는 **실제로 전송할 URL** 을 판정 | URL 파서가 `%2e%2e`·백슬래시를 `..`·`/` 로 접어서, 원본 문자열 검사는 실제로 우회됐다. 판정은 default-deny 라 새 엔드포인트가 조용히 열리지 않는다 |
| 전용 툴이 body 스키마를 고정 | `bb_comment` 는 `.../comments` POST 외의 경로를 만들 수 없다 |
| 플러그인은 **서버를 담지 않는다** | 자격증명이 서버 env 로 주입되지 않고, 루트 `.mcp.json` 은 프로젝트 스코프를 하이재킹한다 |

경로 가드의 판정 대상, 설계 의도 전문 → [docs/design.md](./docs/design.md) ·
허용 저장소의 동작 → [docs/allowlist.md](./docs/allowlist.md)

## 보안 — 요약

**이 경계는 단단하지 않다.** 막는 것과 함께 **막지 못하는 것 10가지**를 적어 두었다 —
프롬프트 인젝션으로 코멘트가 유출 채널이 되는 것, 에이전트가 허용 저장소 파일을 고칠 수
있는 것, `ALLOW_WRITE=true` 가 경계를 사실상 없애는 것, 감사 추적이 없는 것 등.
→ [docs/security.md](./docs/security.md)

---

## 기록

CHANGELOG 는 **무엇을 틀렸고 어떻게 고쳤는지**로 쓴다. 그중 이 저장소 밖에서도
해당하는 것을 따로 정리해 뒀다.

- [**기본값이 직관과 어긋나면, 틀린 건 직관이 아니다**](./docs/posts/기본값이-직관과-어긋나면.md)
  — 설정이 없으면 전역이 열리는 fail-open 기본값이었다. 사용자가 한 번에 반대로
  추측했다는 것은 취향이 아니라 사양이 틀렸다는 증거다. 기본값을 뒤집으면 **전에는
  도달 불가능하던 상태**가 생기고, 그 경로는 아무도 밟아본 적이 없다.

- [**의존을 없앤 게 아니라 옮겼다**](./docs/posts/의존을-없앤-게-아니라-옮겼다.md)
  — 하드코딩된 테스트 목록을 글롭으로 고치며 "셸에 의존하지 않는다" 고 적었다.
  그 문장은 참이고, 동시에 버그를 만들었다. 네이티브 글롭이 Node 22+ 라 셸 의존을
  **버전 의존으로 옮긴** 것이었고 내 머신(Node 24)에서는 보이지 않았다. CI 첫 실행이
  잡았다.
