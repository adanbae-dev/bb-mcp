# 변경 이력

버전은 `package.json` 기준이다. `git log` 의 커밋 수와 항목 수가 다른데,
0.1.0~0.5.0 은 저장소를 만들기 전 개발 중에 지나간 버전이라 최초 커밋에
함께 들어갔다.

## 0.15.2 — /bb-prs 도 현재 폴더 기준으로

0.15.0 에서 "현재 폴더의 저장소를 자동으로 쓴다" 를 넣으면서 `/bb-prs` 만
예외로 두고 전체 목록을 기본으로 했다. "목록을 보는 목적은 보통 어디에 뭐가
있나이므로" 라는 내 판단이었는데, 요청은 폴더 기준이었다. 일관성이 깨졌고
프로젝트 폴더에서 부르는 `prs` 라면 그 프로젝트가 자연스러운 범위다.

- 인자 없음 + 감지 성공 → **그 저장소만** (`bb_pr_list`)
- 인자 없음 + 감지 실패 → 전체로 폴백하고 **그 이유를 밝힌다**
  (목록 명령이므로 선택창을 띄우기보다 전체를 보여주는 편이 쓸모 있다)
- `all` → 명시적 전체
- `allowed: false` → 멈추고 allowlist 추가를 안내
- 어느 범위로 봤는지 항상 한 줄로 밝힌다. 한 저장소로 좁혀 0건이면
  전체를 볼지 묻는다 — 사용자가 범위가 좁혀진 줄 모를 수 있다

이제 세 명령이 같은 규칙을 쓴다. 예외 없음.

## 0.15.1 — 저장소를 물어야 할 때 선택창

감지에 실패했을 때 평문으로 "어느 저장소인가요?" 라고 되묻던 것을
`AskUserQuestion` 선택창으로 바꿨다. 사용자가 저장소 이름을 기억해
타이핑하지 않아도 된다.

- **옵션은 2~4개 제약**이 있다. allowlist 가 13개이므로 순위를 정해 상위 4개만
  보여주고 나머지는 자동으로 붙는 "Other" 로 받는다
- 순위는 **열린 PR이 있는 저장소 우선**, 그다음 최근 갱신순.
  리뷰가 목적이니 당장 할 일이 있는 것이 위로 와야 한다(`bb_pr_inbox` + `bb_repos`)
- 각 옵션에 고를 근거를 붙인다 — `열린 PR 1건 · 방금 갱신` 처럼.
  이름만 나열하면 선택에 도움이 안 된다
- allowlist 가 1개면 **묻지 않는다.** 4개 이하면 전부 옵션으로 넣는다
- `allowed: false` 일 때는 선택창을 띄우지 않는다 — 쓰려던 저장소가 정해져 있으므로
  allowlist 추가가 필요하다는 사실을 알리는 게 맞다

스킬 2개 + 명령 3개에 반영했다. 코드 변경은 없다(스킬 지침).

## 0.15.0 — 현재 폴더의 저장소 자동 감지

`repo` 를 매번 인자로 받는 대신 현재 폴더에서 찾는다.

### 근거
MCP 서버의 cwd 가 Claude Code 가 띄운 프로젝트 디렉터리라는 것을 실측으로 확인했다 —
서버 인스턴스 3개가 각자 다른 프로젝트(`peterpanz-web`, `brawser`, `bb-mcp`)에
붙어 있었다. 그래서 서버에서 git 을 읽으면 "지금 어느 저장소인가" 를 알 수 있다.

에이전트의 Bash 로 감지하는 방법도 있지만, 에이전트의 cwd 는 세션 중에 `cd` 로
바뀔 수 있고 스킬마다 파싱을 반복해야 한다. 서버 cwd 는 기동 시 고정이라 더 안정적이다.

### 추가
- **`bb_detect_repo`** — `repo`·`remote`·`branch`·`upstream`·`unpushed`·`allowed` 를
  한 번에 준다. 읽기 전용이고 네트워크를 쓰지 않는다. git 인자는 전부 고정이라
  사용자 입력이 명령에 들어가지 않는다.
- 스킬·명령 5개가 `repo` 없이 불리면 이걸 먼저 부른다

### remote 이름을 가정하지 않는다
`git remote get-url origin` 만 보면 틀린다. 실측한 저장소에 remote 가 **4개** 있었고
GitHub 3개 + Bitbucket 1개였다. 전부 훑어 bitbucket 을 고르고, 여러 개면 `origin` 을
우선한다. SSH·HTTPS·`ssh://`·`user@` 네 형태를 받는다.

조사 중에 `git remote -v | head -2` 로 잘라 봐서 그 저장소를 GitHub 전용이라고
오판했다. 툴이 전체를 훑어 올바르게 `aptner/mono-peter-web` 을 찾아냈다.

### 실패 이유를 구분한다
`is_git: false` / `repo: null` + `other_remote_host` / `allowed: false` 를
각각 다른 `note` 로 알린다. 스킬은 감지된 저장소를 **말없이 쓰지 않고** 한 줄로 밝힌다.

툴 20개, 테스트 176개.

## 0.14.1 — bb_doctor 가 쓰기 게이트를 전부 보고

`ALLOW_PR_CREATE` 를 켜고 재등록했는데 `bb_doctor` 출력에 나오지 않았다.
게이트가 4개인데 `bb_comment` 와 `bb_write` 둘만 보고하고 있었다 —
설정 진단 툴이 무엇이 열렸는지 일부만 보여주면 쓸모가 없다.

- `bb_pr_create`, `bb_allowlist_add` 게이트를 추가로 보고한다
- `PR 승인·머지: 툴 없음 — 사람이 직접 합니다` 를 한 줄 추가해 정책이 보이게 한다
- 게이트 4개가 전부 보고되는지 테스트로 지킨다

## 0.14.0 — PR 생성

### 추가
- **`bb_pr_create`** — 새 PR을 만든다. `BITBUCKET_ALLOW_PR_CREATE` 게이트가 필요하고
  **`ALLOW_COMMENT` 로는 열리지 않는다.** 생성은 검토를 요청하는 일이고 되돌릴 수 있어
  승인·머지와 성질이 다르지만, 팀에 알림이 가므로 별도 게이트를 둔다.
  - **중복 검사를 먼저 한다.** 같은 source 브랜치로 열린 PR이 있으면 만들지 않고
    그 PR의 번호·URL을 돌려준다. 푸시만으로 반영되므로 새로 만들 필요가 없다
  - `close_source_branch` 기본 `false`. 문자열 `"true"` 를 참으로 보지 않는다
  - `reviewers` 는 UUID 만 받는다(Bitbucket 제약). 이름으로는 지정할 수 없다
  - source 와 destination 이 같으면 거부
- **`bb_branch_commits`** — 브랜치가 대상 브랜치보다 앞선 커밋. PR 초안의 근거다.
  `exclude` 를 주지 않으면 브랜치 전체 역사가 온다
- **`bb-pr-create` 스킬 / `/bb-pr-new`** — 커밋을 읽어 제목·설명 초안을 만들고
  **확인을 받은 뒤** 생성한다. 커밋에 없는 내용을 추론해 넣지 않고,
  `Feature/BRANCH-NAME` 같은 무정보 제목을 만들지 않는다

### 실측으로 잡은 API 함정
**PR 검색에서 `state` 를 별도 파라미터로 주면 무시된다.** `q` 안에 넣어야 한다.

```
?state=OPEN&q=source.branch.name="X"          → 10건 (머지·거절 포함)
?q=state="OPEN" AND source.branch.name="X"    → 1건  (맞다)
```

전자로 중복 검사를 했다면 머지된 옛 PR 때문에 새 PR을 만들 수 없게 된다.
`openPrByBranchQuery()` 로 고정하고 테스트로 지킨다.

### 승인은 그대로 사람이 한다
`bb_pr_create` 를 추가했지만 승인·머지 툴은 여전히 없다. 새 스킬에도
"승인·머지는 하지 않는다 — 예외 없음" 절을 뒀다.

툴 19개, 테스트 168개.

## 0.13.0 — 리뷰 근거를 더 모을 수 있게

스킬이 "못 한다" 고 명시한 것 중 API 로 메울 수 있는 것을 찾았다.
후보 6개를 실제로 찔러보고 3개만 채택했다.

### 추가
- **`bb_pr_commits`** — PR을 이루는 커밋. 커밋이 잘 쪼개졌는지(포맷과 기능이 섞였는지)를
  리뷰하는 근거가 없었다. 스킬 규약에는 그 항목이 있는데 데이터가 없던 상태였다.
  **기본은 제목 줄만** — 실측한 커밋 메시지가 하나에 수백 줄이라 전체를 받으면
  컨텍스트를 크게 태운다(커밋 5개 → 1,060자로 축약). `parents` 로 머지 커밋을 센다.
- **`bb_pr_activity`** — 승인·변경요청·업데이트 이력. `bb_pr_get` 은 현재 승인 상태만
  보여줘서 경위를 알 수 없었다. `summary.pushed_after_approval` 이 핵심 —
  승인 뒤에 푸시가 있었다면 **그 승인은 옛 코드에 대한 것이다.**
- **`bb_file_history`** — 파일을 건드린 커밋 이력. 사전 존재 이슈로 판정했을 때
  "언제 들어왔나" 를 답한다. Bitbucket 이 이력에 해시만 주므로(실측) `enrich` 로
  커밋을 하나씩 더 읽어 제목·작성자·날짜를 채운다.

### 기각한 후보 3개
- **빌드 상태**(`/commit/{sha}/statuses`) — 접근되지만 **빈 배열**이고
  `bitbucket-pipelines.yml` 이 없다(404). CI 가 상태를 보고하지 않으므로 읽을 데이터가 없다
- **파이프라인**(`/pipelines/`) — `read:pipeline:bitbucket` 스코프 없음(403).
  스코프를 늘려도 위와 같은 이유로 값이 없다
- **코드 검색**(`/workspaces/{ws}/search/code`) — 경로가 워크스페이스 단위다.
  가드가 default-deny 로 막고 있고, 뚫으면 **allowlist 밖 저장소의 코드까지 검색된다.**
  allowlist 가 이 서버의 핵심 경계이므로 넣지 않는다

### 승인은 사람이 한다
`bb_pr_approve` 를 만들지 않는다. 스킬에 "승인은 사람이 한다 — 예외 없음" 절을 두고
`bb_write` 로 우회하지 말라고 명시했다. 승인·머지 이름의 툴이 생기면 테스트가 깨진다.

### 스킬
실행 순서에 3단계(커밋 위생)·4단계(리뷰 이력)를 넣고 이후를 재정렬했다.
9단계(base 대조)에 `bb_file_history` 로 시점을 확인하는 절차를 붙였다.
12단계 "못 하는 것" 에서 커밋 히스토리를 빼고 "줄 단위 blame" 만 남겼다.

테스트 157개.

## 0.12.0 — /bb-prs

- **`/bb-prs`** — 열린 PR 목록만 본다. `bb_pr_inbox` 를 불러 허용 저장소 전체를
  최근 갱신순으로 보여주고 **거기서 끝낸다.** `/bb-review` 는 인자 없이 부르면
  목록을 보여준 뒤 리뷰로 이어가는데, "지금 뭐가 열려 있나"만 알고 싶을 때가
  따로 있다.
  - 저장소를 지정하면 `bb_pr_list` 로 그 저장소만 (inbox 는 저장소당 10개 상한)
  - 원본 JSON 대신 표로 정리하고, 최근 갱신순을 임의로 바꾸지 않는다
  - `comment_count` 가 있으면 `💬N` — 이미 논의가 있다는 신호
  - 열린 PR이 없으면 그것만 말하고 끝낸다. 억지로 `MERGED` 를 뒤지지 않는다
  - `bb_pr_inbox` 의 `errors` 를 조용히 빼먹지 않고 어느 저장소가 왜 실패했는지 알린다
- 문서의 낡은 수치 정리: 툴 12개 → 14개, 테스트 121개 → 144개,
  테스트 파일별 개수(lib 66 / integration 74 / manifest 4)
- `bb_allowlist_list` 가 `denied`·파싱 실패에서도 상태를 돌려주는 동작을 README 에 적었다

## 0.11.1 — 0.11.0 이 만든 회귀 수정

`/pr-review-ko` 로 0.11.0 을 리뷰하다 찾았다.

- **`bb_allowlist_list` 가 `denied` 모드에서 아예 실패했다.** `guard()` 가 진입 시
  allowlist를 해석하므로 설정이 없으면 툴 자체가 못 떴다. 상태를 설명해야 할
  바로 그 상황이다. 0.11.0 이전에는 설정 없음 = `open` 이라 이 경로가 없었으므로
  0.11.0 이 만든 회귀다. `bb_doctor` 에 이미 같은 처방을 해뒀는데(코드에 이유가
  주석으로 남아 있다) 이 툴에는 적용하지 않았다.
  → `guard()` 를 쓰지 않고 직접 해석한다. `denied` 와 파싱 실패를 `mode`·`warning`·
    `error`·`fix` 로 돌려준다
- `bb_doctor` 가 미설정과 파일 손상을 같은 문구("allowlist가 깨져")로 안내했다.
  첫 실행 사용자에게 "깨졌다"고 말하는 셈이었다 → 두 상황을 구분
- `pending_remove`(재시작하면 닫힐 저장소)가 통합 테스트에 없었다 → 추가

테스트 144개.

## 0.11.0 — 설정이 없으면 차단 (breaking)

"레포를 지정 안 하면 접근 안 하는 거지?" 라는 물음에 아니라고 답해야 했다.
그 되물음 자체가 기본값이 직관과 어긋난다는 증거였다.

이전에는 아무 설정이 없으면 `open` 으로 떠서 **토큰 스코프 전체가 열렸다.**
stderr 경고를 남겼지만 MCP 로그를 안 보면 놓친다. `BITBUCKET_ALLOWED_REPOS=""`
(빈 문자열)도 "아무것도 허용 안 함" 이 아니라 "전부 허용" 이었다.

- 아무 설정이 없으면 `denied` — **전부 차단**. 서버는 뜨고 여는 방법을 알려준다
- 전체 개방은 `BITBUCKET_ALLOW_ALL_REPOS=true` 로 **명시해야** 한다
- `bb_doctor` 가 미설정을 문제로 보고하고 조치를 준다
- `bb_allowlist_list` 의 open 경고 문구를 명시적 opt-in 기준으로 바꿨다

**Breaking**: `open` 모드에 의존하던 설정은 `BITBUCKET_ALLOW_ALL_REPOS=true` 를
추가해야 한다. `_FILE` 이나 `ALLOWED_REPOS` 를 쓰던 설정은 영향 없다.

## 0.9.0 — 플러그인 배포와 이식성

### 추가
- **`bb-pr-review` 스킬** — Bitbucket PR을 `bb_*` 툴로 직접 읽어 한국어 리뷰
  코멘트를 쓴다. 기존 `pr-review-ko`의 규약(5개 분류·이모지, `path:LINE`,
  `### 🔴 1-1.` 번호, ①무엇 ②재현 ③수정, `추정:`/`확인 필요:`,
  `## 종합 의견`, 읽기 전용)을 그대로 승계하고 데이터 출처만 로컬 git →
  Bitbucket API로 바꿨다. `pr-review-ko`는 "Bitbucket에는 `gh`가 안 되니
  브랜치명 기준으로 처리한다"고 적혀 있어 클론과 fetch가 필요했다.
- **`/bb-review`** 짧은 진입점
- **마켓플레이스 배포** — `.claude-plugin/marketplace.json` + `plugin/` 하위.
  `claude plugin marketplace add ./` → `claude plugin install bb-pr-review@bb-mcp`
- **플랫폼별 비밀 저장소 감지** — macOS `security`, Linux `secret-tool`/`pass`.
  macOS만 실측했고 나머지는 명령 존재만 확인해 미검증으로 표기한다.

### 변경
- **allowlist 기본 위치를 저장소 밖(`~/.config/bb-mcp/`)으로.** 저장소 안에
  두면 옮길 때 깨지고, 사내 저장소 이름이 git 트리 옆에 놓인다.
- 스킬에 **선행조건 절** 추가 — MCP 서버가 없으면 아무것도 못 한다는 사실과
  증상별 조치. 플러그인은 서버를 설치하지 않는다.

### 고침
- **루트 `.mcp.json`이 프로젝트 MCP 설정을 하이재킹했다.** 이 저장소가 그 자체로
  Claude Code 프로젝트라서, 플러그인용으로 둔 루트 `.mcp.json`이 프로젝트 스코프
  설정으로 읽혀 user 스코프 등록을 덮어썼다. `${CLAUDE_PLUGIN_ROOT}`는 설치된
  플러그인으로 로드될 때만 치환되므로 경로가 문자열 그대로 남아
  `CONNECTION_CLOSED`로 죽었다. 루트에서 제거하고 `.gitignore`로 막았다.
- allowlist 추가 시 개행 함정 — 파일 마지막 줄에 개행이 없으면
  `echo 'repo' >>`가 이전 항목에 붙는다. `printf '\nrepo\n' >>`를 안내한다.

### 검증한 것
- `.mcp.json` 치환은 **셸 환경변수**를 읽는다. `userConfig`는 플러그인 자기 코드가
  읽는 별개 메커니즘이다(postman은 `${POSTMAN_MCP_MODE}`를 쓰지만 `userConfig`가
  없고, ecc의 `userConfig` 키는 자기 `tests/`·`scripts/`에서만 참조된다).
  그래서 MCP 서버는 플러그인으로 배포하지 않는다 — 자격증명을 셸 env로
  요구하게 되어 `claude mcp add --env`보다 나쁘다.

## 0.8.0 — 파일 모드 기본을 기동 시 스냅샷으로 (breaking)

경계의 실체를 잘못 짚고 있었다. env 모드가 사주는 것은 "설정을 고치기 어렵다"가
아니라 **"고쳐도 재시작해야 먹는다"**다. 세션 중간에 하이재킹된 에이전트가 경계를
넓혀 그 세션에서 써먹는 것을 막는 게 핵심이고, 편집 난이도는 무관하다.

- 파일 모드가 매 호출 파일을 다시 읽던 것을 **기동 시 한 번**으로 바꿨다.
  파일 편집은 한 줄로 쉽고, 반영에는 재시작이 필요하다.
- `BITBUCKET_ALLOWLIST_RELOAD=true`로 옛 동작을 켤 수 있다(권장하지 않음).
- 기동 시 읽기에 실패해도 서버는 뜬다 — 죽으면 `bb_doctor`로 원인을 못 본다.
  대신 모든 호출이 그 오류로 차단된다.

**Breaking**: allowlist 파일을 고친 뒤 세션 재시작이 필요해졌다.

## 0.7.2 — 외부 입력 표시 + 파일 권한

- PR 제목·본문·코멘트·diff가 표시 없이 모델 컨텍스트로 들어왔다.
  `bb_pr_list`/`bb_pr_get`/`bb_pr_comments`/`bb_pr_inbox`에 `_untrusted` 필드,
  `bb_pr_diff` 앞에 `[외부 입력]` 헤더를 붙인다. **내용은 걸러내지 않는다** —
  리뷰 대상 텍스트에 "이전 지시를 무시하라"가 정당하게 등장할 수 있다.
  강제력이 없다는 점도 문서에 명시했다.
- allowlist 파일 권한을 600으로. 사내 저장소 이름이 담긴다.

## 0.7.1 — 진단·설정 도구의 출력 유출 3건

- `bb_doctor`가 계정 이메일 전문을 출력했다 → 도메인만 남기고 마스킹
- `BITBUCKET_API_BASE` 원문을 출력했다(`bb_doctor` + 기동 경고).
  URL에 `user:pass@`가 박히면 그대로 찍힌다 → `userinfo` 제거
- `setup.sh`가 평문 토큰을 화면에 출력했다 → 출력용 복사본에서 가림

## 0.7.0 — bb_doctor 자기 진단 + setup.sh

설정 오류가 평범한 401로만 보여서 원인을 찾는 데 hex 접두사 분석까지 필요했다.

- **`bb_doctor`** — 토큰 형태(hex·128자 절단 감지), 인증(401/403 구분),
  스코프(`/user` 403 본문의 `granted`에서 추출), allowlist, 게이트를 점검하고
  **문제마다 실행할 명령**을 준다. 토큰 값은 어떤 형태로도 출력하지 않는다.
  allowlist가 깨져 있어도 동작한다.
- **`setup.sh`** — 키체인 저장(128자 절단·개행→hex 회피), allowlist 생성,
  `claude mcp add` 명령 조립

## 0.6.0 — 경로 탈출로 allowlist 전면 우회 (심각)

가드는 원본 문자열의 literal `..`만 검사했는데, `fetch`의 WHATWG URL 파서는
`%2e%2e`·`.%2e`·`%2E%2E`·백슬래시를 `..`/`/`로 접는다. **판정 대상과 전송 대상이
다른 문자열이었다.**

```
입력:      /repositories/ws/allowed/%2e%2e/%2e%2e/%2e%2e/user/permissions/repositories
실제 전송:  /2.0/user/permissions/repositories        ← 일부러 막았던 경로
```

`bb_get`·`bb_file`·`bb_write` 모두 영향받아 임의 저장소 접근이 가능했다.
`resolveApiUrl()`이 URL을 먼저 만들고 **정규화된 `pathname`으로 판정한 뒤 그 URL
객체를 그대로 `fetch`에 넘긴다.** 문자열을 재조립하지 않는다.

함께: `bb_file` 경로 세그먼트 인코딩, 동시성 상한 6, 목록 크기 상한 120KB,
`BITBUCKET_API_BASE` 기동 경고.

## 0.5.0 — 실사용 다듬기

- **재시도·백오프** — 429는 전 메서드, 5xx·네트워크 오류는 **GET만**.
  5xx에서 코멘트 POST를 재시도하면 중복이 달린다. `Retry-After` 준수.
- **`bb_pr_inbox`** — allowlist 전 저장소의 PR을 최근 갱신순으로 한 번에
- **`bb_file`** — 커밋·브랜치의 파일 전문을 줄 번호와 함께
- PR 목록 최신순 정렬, 진단 로그(`BITBUCKET_DEBUG`), 기동 실패 메시지, `.gitignore`

## 0.4.0 — 파일 기반 allowlist

env 또는 파일에서 읽는다. 모드는 기동 시 고정, 목록은 호출마다 재읽기
(0.8.0에서 스냅샷으로 바뀜). fail-closed — 파일이 없거나 비면 전체 차단.

## 0.3.0 — PR 리뷰 전용 툴

`bb_get`/`bb_write` 둘뿐이던 것을 워크플로에 맞춰 쪼갰다.
`bb_repos`, `bb_pr_list`, `bb_pr_get`, `bb_pr_files`, `bb_pr_diff`,
`bb_pr_comments`, `bb_comment`. **코멘트 게이트와 범용 쓰기 게이트를 분리** —
리뷰하려고 머지 권한을 열 필요가 없다.

## 0.2.0 — 초기 지적사항 수정

- allowlist 우회: `/repositories/{ws}`·`/workspaces/*`·`/user/permissions/repositories`가
  무검사 통과했다 → default-deny로 전환
- `pick()`이 diff 같은 비 JSON 응답에서 예외를 던졌다
- `TOKEN_CMD` 파싱이 `split(" ")`이라 공백 인자가 깨졌다 → 따옴표 지원
- fetch 타임아웃 없음 → `AbortSignal.timeout`, 기본 30초
- `package.json`의 `main`이 존재하지 않는 파일, `test`가 가짜였다

## 0.1.0 — 최초

개인 Atlassian API 토큰으로 Bitbucket Cloud REST API 2.0에 직접 붙는
최소 MCP 서버. `bb_get`, `bb_write` 2개 툴.
