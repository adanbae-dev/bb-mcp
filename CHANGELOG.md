# 변경 이력

버전은 `package.json` 기준이다. `git log` 의 커밋 수와 항목 수가 다른데,
0.1.0~0.5.0 은 저장소를 만들기 전 개발 중에 지나간 버전이라 최초 커밋에
함께 들어갔다.

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
