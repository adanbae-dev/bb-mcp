# 설치와 설정

[← README](../README.md) · 토큰 발급과 트러블슈팅 상세는 [Settings.md](../Settings.md)

## 빠른 시작

```bash
./setup.sh
```

**이 하나로 끝난다.** 키체인 저장(128자 절단·개행→hex 회피), allowlist 파일 생성,
`claude mcp add` 조립, 그리고 **플러그인(스킬 2개·슬래시 명령 5개) 설치까지** 6단계로
한다. 7단계는 선택이다 — 묻고 나서만 팀 저장소에 Bitbucket PR 템플릿을 복사한다. 끝나면 **세션을 한 번** 재시작하고 `bb_doctor` 를 부른다.

> **실제로 시간이 걸리는 곳은 스크립트가 아니라 그 전에 토큰을 발급하는 일이다.**
> 비슷한 것이 두 종류인데 하나만 동작하고, Basic 인증의 사용자명이 username 이 아니라
> **이메일**이며, 스코프를 정확히 골라야 한다 — [Settings.md §3](../Settings.md) 에
> 절이 일곱 개 붙어 있는 이유다. 막히면 `bb_doctor` 가 겪은 함정(hex 저장·128자 절단·
> 스코프 부족·allowlist 미설정)을 감지해 **실행할 명령까지** 준다.
>
> 비밀 저장소는 **macOS(`security`)만 실측했다.** Linux(`secret-tool`·`pass`)는
> 명령 존재만 확인한 미검증 경로이고 `setup.sh` 가 경고를 띄운다.

<details>
<summary>손으로 하려면</summary>

```bash
npm i @modelcontextprotocol/sdk@1 zod@3
npm test                                              # 전부 통과해야 한다 (파일별 개수는 docs/development.md)

# 토큰 (-w 뒤에 값을 직접. 대화형 프롬프트는 128자에서 잘린다)
security add-generic-password -U -s bb-api-token -a "$USER" -w '<TOKEN>'

# 허용 저장소
mkdir -p ~/.config/bb-mcp
printf 'workspace/repo\n' > ~/.config/bb-mcp/allowed-repos
chmod 600 ~/.config/bb-mcp/allowed-repos

# 등록
claude mcp add --scope user \
  --env BITBUCKET_EMAIL=you@company.com \
  --env BITBUCKET_TOKEN_CMD="security find-generic-password -s bb-api-token -w" \
  --env BITBUCKET_ALLOWED_REPOS_FILE="$HOME/.config/bb-mcp/allowed-repos" \
  --env BITBUCKET_ALLOW_COMMENT=true \
  --transport stdio bitbucket -- $(which node) /absolute/path/bb-mcp/server.mjs
```

```bash
# 스킬·슬래시 명령 (서버 등록만으로는 / 목록에 안 뜬다 — 아래 「슬래시 명령으로 쓰기 — 플러그인」)
claude plugin marketplace add adanbae-dev/bb-mcp
claude plugin install bb-pr-review@bb-mcp --scope user
```

`npm link` 하면 절대경로 대신 `-- npx bb-mcp` 로 등록할 수 있다.
팀에 나눠줄 때는 `.mcp.json.example` 을 `.mcp.json` 으로 복사한다.

</details>

Node 18+ (전역 `fetch`, `AbortSignal.timeout`). 검증은 Node 24.18 / sdk 1.30 / zod 3.

필요한 토큰 스코프는 `read:repository:bitbucket`, `read:pullrequest:bitbucket`,
그리고 코멘트를 달 거면 `write:pullrequest:bitbucket`.
발급 절차와 키체인 저장 시 주의사항은 [Settings.md §3–5](../Settings.md).
## 슬래시 명령으로 쓰기 — 플러그인

MCP 서버만 등록하면 툴 20개가 생기지만, **툴은 슬래시 명령이 아니다.**
모델이 판단해서 호출하는 것이라 `/` 목록에 뜨지 않는다.
`/bb-pr-review:bb-pr-review`처럼 직접 치려면 **스킬**이 필요하다.

**플러그인 명령은 플러그인 이름이 앞에 붙는다** — `/bb-pr-review:bb-review`, `/bb-pr-review:bb-prs`.
짧은 `/bb-review` 를 그대로 치면 실행되지 않았다(실측). 짧은 이름이 동작하는 것은
`setup.sh` 6단계에서 **직접 복사**(`~/.claude/skills/`·`~/.claude/commands/`)를 고른 경우뿐이다.
문서와 명령 안내는 기본 설치 경로인 플러그인 기준의 전체 이름으로 적는다.

### 서버와 스킬은 별개다 — 순서는 무관

두 가지를 각각 설치한다. **순서는 상관없다**(스킬은 실행 시점에 툴이 있으면 된다).
둘 다 **세션 재시작 후** 적용된다.

| | 무엇 | 어디에 |
|---|---|---|
| MCP 서버 | 툴 20개 (`bb_pr_get`, `bb_file`, `bb_comment` …) | `~/.claude.json` (user 스코프) |
| 스킬·명령 | 플러그인: `/bb-pr-review:bb-review` 등 · 직접 복사(`~/.claude/skills/`): `/bb-review` 등 | 플러그인 캐시 **또는** `~/.claude/skills/` |

가장 짧은 길은 `setup.sh` 하나다. 서버 등록과 플러그인 설치를 6단계로 다 하므로
**재시작은 한 번이면 된다.** 6단계에서 `claude plugin` 설치와 직접 복사 중 고를 수 있고,
직접 복사를 고르면 스킬 2개와 명령 5개를 **전부** 옮긴다(개수를 보고한다).

```bash
git clone https://github.com/adanbae-dev/bb-mcp && cd bb-mcp
./setup.sh
```

Bitbucket 에서 받는다면 「1-2. Bitbucket 저장소에서 받아 쓰기」 — 마켓플레이스 URL 과 인증이 다르다.

**스킬은 한 경로로만 설치한다.** 플러그인과 `~/.claude/skills/` 양쪽에 두면
같은 이름이 두 벌 생긴다. `setup.sh` 는 플러그인이 이미 깔려 있으면 복사를
건너뛴다.

### 플러그인으로 설치 (권장)

```bash
claude plugin marketplace add adanbae-dev/bb-mcp
claude plugin install bb-pr-review@bb-mcp --scope user
claude plugin details bb-pr-review@bb-mcp   # Skills (2) 확인
```

세션 재시작 후 아래가 뜬다.
설치본은 `~/.claude/plugins/cache/bb-mcp/bb-pr-review/<버전>/` 에 놓인다.

| 명령 | 하는 일 |
|---|---|
| `/bb-pr-review:bb-prs` | 열린 PR 목록만 본다 (**기본은 현재 폴더의 저장소**, `all` 로 전체) |
| `/bb-pr-review:bb-pr-new` | 브랜치 커밋으로 PR 초안을 만들고 확인 후 생성. 설명은 저장소 템플릿 우선, 없으면 기본 템플릿 6개 절 |
| `/bb-pr-review:bb-review` | PR 리뷰. 인자 없으면 목록부터 고르게 한다. `--ko`·`--en` 으로 출력 언어 지정(기본은 PR 의 언어). 지적마다 P1/P2/P3/Q 등급과 분류 태그, 머리말 아래 지적 목록 표(번호·분류·위치·요청), 종합 의견에 등급 총계 |
| `/bb-pr-review:bb-pr-review` | 위와 같음 (스킬 직접 호출) |
| `/bb-pr-review:bb-doctor` | 설정 진단. `quick` 이면 네트워크 없이 |
| `/bb-pr-review:bb-repos` | 허용 저장소 목록 · `add <ws/repo>` 로 추가 |

로컬 저장소에서 개발 중이면 경로를 쓴다. **`.` 은 거부되고 `./` 만 받는다.**

```bash
claude plugin marketplace add ./
```

**한 마켓플레이스 이름에 소스는 하나다.** 이미 `bb-mcp` 가 다른 소스로
등록돼 있으면 `its network source differs from the one declared` 로 거부된다.
갈아탈 때는 먼저 걷어낸다.

```bash
claude plugin uninstall bb-pr-review@bb-mcp
claude plugin marketplace remove bb-mcp
claude plugin marketplace add adanbae-dev/bb-mcp    # 또는 ./
claude plugin install bb-pr-review@bb-mcp --scope user
```

갱신은 `claude plugin update bb-pr-review@bb-mcp` (재시작 필요).

### 스킬만 복사

```bash
mkdir -p ~/.claude/skills/bb-pr-review ~/.claude/commands
cp -R plugin/skills/bb-pr-review/. ~/.claude/skills/bb-pr-review/   # reference/ 포함
cp plugin/commands/bb-review.md ~/.claude/commands/
```

`setup.sh` 6단계가 이걸 대신한다 — 스킬·명령 목록을 디스크에서 만들므로 항목이
늘어도 따라온다.

**슬래시 명령 이름은 스킬 «디렉터리 이름»에서 나온다** — `~/.claude/skills/bb-pr-review/`
→ `/bb-pr-review`(직접 복사). 플러그인으로 설치하면 앞에 플러그인 이름이 붙어 `/bb-pr-review:bb-pr-review`. frontmatter 의 `name` 은 목록에 보이는 표시 이름일 뿐이다(플러그인
스킬에서는 `name` 이 명령의 마지막 마디가 된다). `trigger:` 같은 필드는 없다 —
Agent Skills 스펙에도 Claude Code 확장 키에도 없어서 **조용히 무시된다.**
발동은 `description` 이 결정한다.

**`~/.claude/skills/` 에 있어야 로드되고, 저장소의 `plugin/skills/` 는 설치 없이는
탐색되지 않는다.**

### 플러그인은 MCP 서버를 설치하지 않는다

스킬·명령만 담는다. 서버를 플러그인으로 배포하지 않는 이유는 셋이다.

| 이유 | 내용 |
|---|---|
| 자격증명 | `.mcp.json` 의 `${VAR}` 치환은 **셸 환경변수**를 읽는다. `userConfig` 는 플러그인 자기 코드가 읽는 별개 메커니즘이라 서버 env로 주입되지 않는다(§검증 근거는 CHANGELOG 0.9.0) |
| 의존성 | 설치된 플러그인 디렉터리에 `node_modules` 가 생기는지 보장이 없다 |
| 경로 | 루트 `.mcp.json` 은 이 저장소를 **프로젝트 스코프 MCP 설정으로 하이재킹한다**(아래) |

서버는 `setup.sh` 또는 `claude mcp add --scope user` 로 등록한다.

### 저장소 루트에 `.mcp.json` 을 두지 않는다 ⚠️

이 저장소는 그 자체로 Claude Code 프로젝트다. 루트 `.mcp.json` 은 프로젝트 스코프
MCP 설정으로 읽히고, 프로젝트 스코프는 user 스코프를 덮어쓴다.
`${CLAUDE_PLUGIN_ROOT}` 는 설치된 플러그인으로 로드될 때만 치환되므로 경로가
문자열 그대로 남아 서버가 `CONNECTION_CLOSED` 로 죽는다. 실제로 한 번 그렇게 깨졌다.

그래서 플러그인 루트를 `plugin/` **하위 디렉터리**로 두고,
마켓플레이스 매니페스트가 `source: "./plugin"` 으로 가리킨다.
`.gitignore` 에 `.mcp.json` 을 넣어 루트에 다시 들어오지 못하게 막았다.

## Bitbucket 저장소에서 받아 쓰기

이 저장소는 GitHub(`origin`)와 Bitbucket(`bb-origin`) 양쪽에 올라간다. 위 절들의
명령은 GitHub 기준이다. **Bitbucket 에서 받는 경우 다른 것만** 여기 모았다.
워크스페이스 이름은 `<workspace>` 로 적는다 — 이 문서는 공개 저장소에도 올라간다(CLAUDE.md §1).

### 동작은 같다

`setup.sh` 는 **clone 한 폴더 경로**로 서버와 마켓플레이스를 등록하고, 플러그인
source 가 상대경로(`./plugin`)라 호스트를 타지 않는다. Bitbucket origin 으로 받은
새 clone 에서 `npm ci` → `npm test` → `claude plugin validate` 까지 통과했다(0.22.1 기준).

```bash
git clone https://bitbucket.org/<workspace>/bb-mcp.git && cd bb-mcp
./setup.sh
```

### 다른 것

| | GitHub | Bitbucket |
|---|---|---|
| 마켓플레이스 추가 | `claude plugin marketplace add adanbae-dev/bb-mcp` | **전체 URL 필수** — 아래 |
| 비공개 저장소 자동 업데이트 | 공개라 인증 불필요 | 비대화식 git 인증 필요 — 아래 |
| CI | `.github/workflows/test.yml` (Node 18·20·22·24) | **없음.** Bitbucket 은 `.github/` 를 읽지 않는다 |
| 상단 test 배지 | GitHub Actions 결과 | Bitbucket 화면에서도 GitHub 쪽 결과다 |

**마켓플레이스는 전체 URL 로 추가한다.** `owner/repo` 축약형은 항상 github.com 으로
해석된다. 축약형을 쓰면 Bitbucket 이 아니라 GitHub 저장소가 등록된다.

```bash
claude plugin marketplace add https://bitbucket.org/<workspace>/bb-mcp.git
claude plugin install bb-pr-review@bb-mcp --scope user
```

이미 GitHub 소스로 `bb-mcp` 가 등록돼 있으면 거부된다(한 이름에 소스 하나 —
「플러그인으로 설치 (권장)」). `uninstall` → `marketplace remove` 후 다시 추가한다.
clone 해 둔 폴더가 있으면 `claude plugin marketplace add ./` 가 제일 단순하다 —
호스트와 인증을 타지 않는다.

**비공개 저장소는 git 이 묻지 못한다.** Claude Code 는 git 을 비대화식으로 부른다.
비밀번호를 물을 수 없어서, 자격증명이 미리 저장돼 있지 않으면 업데이트가 **조용히
실패**한다. 등록 전에 터미널에서 한 번 확인한다.

```bash
git ls-remote https://bitbucket.org/<workspace>/bb-mcp.git   # 프롬프트 없이 끝나야 한다
```

- SSH 키를 쓰면 `~/.gitconfig` 의 `url."git@bitbucket.org:".insteadOf` 로 HTTPS 를 SSH 로
  바꿔 쓸 수 있다. **그 설정이 있는 머신에서 된다고 다른 머신에서 되는 게 아니다**
- 확인 필요: 백그라운드 자동 업데이트용 토큰 환경변수(`BITBUCKET_TOKEN` 류)는 이 저장소에서
  실측하지 않았다. 안 되면 `claude plugin marketplace update bb-mcp` 를 손으로 부른다

### 릴리스 — 원격이 둘이다

[개발과 릴리스](./development.md) 「플러그인 릴리스」의 3단계(푸시)를 **양쪽에** 한다.
마켓플레이스는 **등록한 소스**의 git 을 읽는다 — Bitbucket 에서 받은 사람에게는
`bb-origin` 에 푸시해야 새 버전이 보인다.

```bash
git push origin main && git push bb-origin main
```

Bitbucket 에는 CI 가 없으므로 `npm test && claude plugin validate ./plugin && claude plugin validate .`
를 **푸시 전에 로컬에서** 반드시 돌린다 — 여기서 빠뜨리면 아무 데서도 안 걸린다.

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `BITBUCKET_EMAIL` | ○ | Atlassian 계정 이메일 |
| `BITBUCKET_API_TOKEN` | △ | 토큰 평문. `TOKEN_CMD`가 있으면 불필요 |
| `BITBUCKET_TOKEN_CMD` | △ | 토큰을 stdout으로 출력하는 명령 (키체인, 1Password CLI 등) |
| `BITBUCKET_ALLOWED_REPOS` | × | `workspace/repo` 쉼표 구분. 설정되면 파일보다 우선 |
| `BITBUCKET_ALLOWED_REPOS_FILE` | × | allowlist 파일 경로. 기본 `~/.config/bb-mcp/allowed-repos` |
| `BITBUCKET_ALLOWLIST_RELOAD` | × | `true`면 파일을 호출마다 재읽기. 기본은 기동 시 스냅샷 |
| `BITBUCKET_ALLOW_ALLOWLIST_WRITE` | × | `true`가 아니면 `bb_allowlist_add` 차단 |
| `BITBUCKET_ALLOW_PR_CREATE` | × | `true`가 아니면 `bb_pr_create` 차단. `ALLOW_COMMENT` 와 별개 |
| `BITBUCKET_ALLOW_ALL_REPOS` | × | `true`면 제한 없이 동작. 명시하지 않으면 전부 차단 |
| `BITBUCKET_ALLOW_COMMENT` | × | `true`가 아니면 `bb_comment` 차단. PR 코멘트만 열린다 |
| `BITBUCKET_ALLOW_WRITE` | × | `true`가 아니면 `bb_write` 전면 차단. 머지·삭제까지 열린다 |
| `BITBUCKET_TIMEOUT_MS` | × | 요청 타임아웃. 기본 30000. 양의 정수가 아니면 기동 실패 |
| `BITBUCKET_TOKEN_TTL_MS` | × | 토큰 캐시 수명. 기본 60000. 토큰을 갈아끼우면 이 시간 안에 반영된다 |
| `BITBUCKET_MAX_PAGES` | × | 페이지네이션 추적 상한. 기본 10 |
| `BITBUCKET_RETRY_MAX` | × | 429·5xx 재시도 횟수. 기본 2. `0`이면 재시도 안 함 |
| `BITBUCKET_DEBUG` | × | `true`면 요청·상태·소요시간·재시도를 stderr에 남긴다 |
| `BITBUCKET_CONCURRENCY` | × | `bb_pr_inbox` 동시 요청 수. 기본 6 |
| `BITBUCKET_LIST_MAX_BYTES` | × | 목록 응답 크기 상한. 기본 40000 — MCP 툴 응답 한도 안에 들어가야 한다 |
| `BITBUCKET_API_BASE` | × | API 베이스 주입. **테스트 전용** — [보안](./security.md) 참고 |

**`ALLOW_COMMENT` 와 `ALLOW_WRITE` 는 별개다.** 리뷰 코멘트만 달 거면
`ALLOW_COMMENT`만 켠다. `ALLOW_WRITE`는 PR 머지·승인·브랜치 삭제까지 열리므로
리뷰 용도로는 켤 이유가 없다.

토큰은 `BITBUCKET_TOKEN_TTL_MS`(기본 60초) 동안만 캐시된다. 토큰을 교체해도
세션 재시작 없이 1분 안에 반영된다.

**재시도 규칙.** 429는 요청이 거부된 것이므로 모든 메서드에서 재시도한다.
5xx와 네트워크 오류는 **GET만** 재시도한다 — 서버가 이미 처리했을 수 있어서,
코멘트 POST를 재시도하면 같은 코멘트가 두 번 달릴 수 있다.
`Retry-After` 헤더가 있으면 그 값을 따르고(최대 30초), 없으면 지수 백오프 + 지터.

`BITBUCKET_DEBUG=true`는 stderr(= Claude Code의 MCP 로그)에 이렇게 남긴다.
토큰은 절대 찍지 않는다.

```
[bb-mcp] GET /repositories/ws/repo -> 429 (25ms)
[bb-mcp] GET /repositories/ws/repo -> 429, 0ms 후 재시도 (1/2)
[bb-mcp] GET /repositories/ws/repo -> 200 (2ms)
```

`BITBUCKET_TOKEN_CMD`는 셸이 아니라 `execFileSync`로 직접 실행된다.
공백 구분에 `"..."` / `'...'` 묶음만 지원하고, 파이프·변수 확장·이스케이프는 없다.
그런 게 필요하면 래퍼 스크립트를 만들어 그 경로를 지정한다.
