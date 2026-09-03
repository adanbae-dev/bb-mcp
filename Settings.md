# Bitbucket을 Claude MCP로 붙이기

Atlassian 커넥터에 Jira·Confluence만 보이고 Bitbucket 툴이 없는 이유부터,
개인이 직접 MCP 서버를 만들어 등록하고 PR 리뷰에 쓰기까지의 전체 정리.

서버 자체의 툴 레퍼런스와 경계 설계는 [README.md](./README.md)에 있다.
이 문서는 **설정 절차와 트러블슈팅**을 다룬다.

## 0. 빠른 길

```bash
./setup.sh
```

6단계로 3~7장과 스킬 설치를 대신한다. 비밀 저장소 감지, 토큰 저장(128자 절단·
개행→hex 회피), allowlist 파일 생성, `claude mcp add` 명령 조립,
`~/.claude/skills/` 에 리뷰 스킬 설치까지 처리한다.
끝나면 세션을 재시작하고 `bb_doctor` 를 부른다.

무엇이 어떻게 설정되는지 알고 싶거나, 스크립트가 실패했거나, macOS가 아니면
아래를 손으로 따라간다.

---

## 1. 왜 Bitbucket 툴이 안 보이는가

설정 누락이 아니라 **인증 방식 제약**이다.

Rovo MCP Server의 Bitbucket Cloud 툴은 스코프가 지정된 API 토큰 인증에서만
제공되고, OAuth 2.1에서는 제공되지 않는다. claude.ai의 커넥터 연결은 OAuth
플로우이므로 그 경로로는 Bitbucket 툴이 목록에 나오지 않는다.

Rovo 경로로 Bitbucket을 쓰려면 세 가지가 모두 필요하다.

1. Bitbucket 워크스페이스가 Atlassian 조직에 연결(org-linked)되어 있을 것
2. 조직 관리자가 Rovo MCP Server에서 API 토큰 인증을 활성화할 것
3. 커스텀 MCP 클라이언트에서 API 토큰 헤더로 `https://mcp.atlassian.com/v1/mcp`에 붙을 것

1번과 2번은 개인이 할 수 없다. 관리자가 꺼둔 상태라면 유효한 개인 토큰으로
붙어도 Jira·Confluence만 돌아온다.

OAuth로 Bitbucket을 지원하는 작업은 로드맵에 있다고 안내되어 있다.

**참고 문서**

- Configuring authentication via API token — https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/
- Authentication and authorization (Rovo MCP) — https://developer.atlassian.com/cloud/rovo-mcp/guides/authentication-and-authorization/
- Rovo MCP Server now supports Bitbucket Cloud — https://www.atlassian.com/blog/bitbucket/the-atlassian-rovo-mcp-server-now-supports-bitbucket-cloud
- atlassian/atlassian-mcp-server — https://github.com/atlassian/atlassian-mcp-server

---

## 2. 두 갈래

| | Rovo 경로 | 직접 만드는 경로 |
|---|---|---|
| 붙는 대상 | Rovo MCP Server | Bitbucket REST API 2.0 직접 |
| 조직 관리자 | 필요 (토글 + org-link) | 불필요 |
| 권한 범위 | 조직이 정한 툴셋 | 본인 저장소 권한 |
| 감사 추적 | Atlassian 쪽에 남음 | 남지 않음 |
| 시작까지 | 관리자 대기 | 30분 |

관리자 협조가 어렵거나 오래 걸리면 아래 3장부터 진행한다.

감사 추적이 필요한 상황이라면 이 서버는 흔적을 남기지 않으므로,
관리자에게 Rovo 쪽 토글을 요청하는 편이 맞다.

---

## 2-1. 다른 환경에 설치할 때

이 문서의 명령은 **macOS에서 실측한 것**이다. 다른 환경에서 달라지는 지점을 모아둔다.

### 비밀 저장소

`setup.sh` 가 감지해서 적절한 `BITBUCKET_TOKEN_CMD` 를 만든다.

| OS | 백엔드 | `TOKEN_CMD` | 검증 |
|---|---|---|---|
| macOS | 키체인 | `security find-generic-password -s bb-api-token -w` | **실측** |
| Linux (GNOME) | Secret Service | `secret-tool lookup service bb-api-token account $USER` | **미검증** |
| Linux | pass | `pass bb-mcp/api-token` | **미검증** |
| 그 외 | 없음 | `BITBUCKET_API_TOKEN` 평문 | — |

미검증 경로는 `setup.sh` 가 경고를 띄운다. 설치 후 `bb_doctor` 로
토큰 형태(길이·hex 여부)를 반드시 확인한다.

**평문 경로는 토큰이 `~/.claude.json` 에 상주한다.** 설정 파일을 읽을 수 있는
주체는 토큰을 그대로 얻는다(README §7 ⑨).

### Node

Node 18+ 가 필요하다(전역 `fetch`, `AbortSignal.timeout`).
검증 환경은 Node 24.18 / sdk 1.30 / zod 3.

`claude mcp add` 의 `command` 에 `node` 를 그대로 쓰면 PATH에 의존한다.
GUI 실행이나 다른 노드 매니저에서 `spawn node ENOENT` 가 날 수 있다.
`$(which node)` 로 절대 경로를 넣으면 안정적이지만, nvm 을 쓰면
버전을 올릴 때 그 경로가 죽는다. `setup.sh` 가 nvm 경로를 감지해 경고한다.

### `setup.sh` 실행 환경

bash 스크립트다. Windows 에서는 WSL 이나 Git Bash 가 필요하다.
`chmod 600` 은 POSIX 권한을 전제한다.

수동으로 하려면 3~7장을 따라간다.

### 경로

allowlist 는 **저장소 밖**(`~/.config/bb-mcp/allowed-repos`)에 둔다.
저장소 안에 두면 저장소를 옮길 때 깨지고, 사내 저장소 이름이 git 트리 옆에 놓인다.
서버는 `~/` 를 확장하므로 `BITBUCKET_ALLOWED_REPOS_FILE=~/.config/...` 도 동작한다.

### 첫 실행

새 설치는 allowlist 가 비어 있어 **모든 저장소가 차단된다**(fail-closed).
정상이다. `bb_doctor` 가 그 사실과 조치를 알려준다.
저장소를 넣고 세션을 재시작하면 열린다.

### Bitbucket 종류

**Bitbucket Cloud 전용**이다. Server/Data Center 는 API 가 달라 동작하지 않는다.

---

## 3. 토큰 발급

### 3.1 두 종류가 있고, 하나만 동작한다

Atlassian API 토큰 발급 화면에는 버튼이 둘 있다.

| 버튼 | 스코프 | Bitbucket |
|---|---|---|
| Create API token | 없음 (계정 전체 권한) | **동작하지 않음** |
| **Create API token with scopes** | 앱·스코프 선택 | 동작 |

**반드시 아래쪽(with scopes)을 눌러야 한다.** 위쪽으로 만든 토큰은
Jira·Confluence에는 쓰이지만 Bitbucket 스코프가 0개라, 모든 호출이 이렇게 실패한다.

```json
{"type": "error", "error": {"message": "API Token provided has no Bitbucket scopes."}}
```

HTTP 401이고 **본문에 이 메시지가 담겨 온다.** 본문 없는 401과는 원인이 다르다(§9).

### 3.2 절차

1. https://id.atlassian.com/manage-profile/security/api-tokens 로 간다
   (계정 설정 → Security → Create and manage API tokens 와 같은 곳)
2. **Create API token with scopes** 클릭
3. 이름을 적는다 — 나중에 어느 토큰인지 구분해야 하므로 용도로 짓는다
   (예: `bb-mcp-pr-review`)
4. 앱 선택에서 **Bitbucket** 선택
   - 여기서 Jira나 Confluence를 고르면 Bitbucket 스코프가 안 붙는다
5. 스코프 선택 (3.3 참고)
6. 만료일 선택 — 짧게(30~90일)
7. **Create** → 토큰이 한 번만 표시된다. 이 화면을 닫으면 다시 볼 수 없다
8. 곧바로 키체인에 넣는다 (§5). 클립보드에 오래 두지 않는다

> UI 문구와 단계 배치는 Atlassian이 바꿀 수 있다. 핵심은 **"with scopes"로
> 만들고 앱을 Bitbucket으로 고르는 것** 하나다.

### 3.3 토큰 스코프

PR 리뷰 워크플로에 필요한 것은 셋이다.

| 스코프 | 쓰이는 곳 |
|---|---|
| `read:repository:bitbucket` | `bb_repos`, `bb_pr_diff` |
| `read:pullrequest:bitbucket` | `bb_pr_list`, `bb_pr_get`, `bb_pr_files`, `bb_pr_comments` |
| `write:pullrequest:bitbucket` | `bb_comment` (코멘트를 안 달면 생략) |

읽기만 할 거면 앞의 둘로 충분하다. `write:pullrequest`는 코멘트 작성 권한이지
머지 권한이 아니다.

**`read:user:bitbucket`은 넣지 않아도 된다.** 이 셋만 있으면 `/user`가 403을
돌려주는데 정상이다. PR 리뷰에 계정 정보는 필요 없다.

스코프 이름은 `동작:대상:bitbucket` 꼴이다. 위 셋 외에 무엇이 있는지는
발급 화면의 목록이나 Atlassian 스코프 문서에서 확인한다.
필요 이상으로 고르지 않는다 — 토큰 하나가 새면 그 범위가 그대로 노출된다.

### 3.4 어떤 스코프가 부족한지 알아내는 법

권한이 모자라면 Bitbucket이 **403과 함께 필요한 스코프를 알려준다.**

```json
{"type": "error", "error": {
  "message": "Your credentials lack one or more required privilege scopes.",
  "detail": {
    "required": ["read:user:bitbucket"],
    "granted": ["read:pullrequest:bitbucket", "write:pullrequest:bitbucket",
                "read:repository:bitbucket"]
  }}}
```

`required`가 추가로 필요한 스코프, `granted`가 지금 토큰이 가진 스코프다.
새 엔드포인트를 쓰다 403이 나면 이 본문부터 본다.

### 3.5 발급 직후 확인

토큰을 키체인에 넣은 뒤(§5) 바로 확인한다.

```bash
security find-generic-password -s bb-api-token -w | cut -c1-5   # ATATT
security find-generic-password -s bb-api-token -w | tr -d '\n' | wc -c
```

- 접두사는 `ATATT`. `41544...`가 나오면 hex로 저장된 것이다(§5)
- 길이는 190자 남짓. 128자면 대화형 프롬프트에서 잘린 것이다(§5)

등록까지 마쳤으면 세션에서 `bb_repos`를 인자 없이 부른다.
저장소 메타데이터가 돌아오면 스코프까지 정상이다.

### 3.6 만료와 교체

만료일을 짧게 잡았으므로 주기적으로 갈아야 한다. 교체는 키체인만 덮어쓰면 된다.

```bash
security add-generic-password -U -s bb-api-token -a "$USER" -w '<새-토큰>'
```

서버는 토큰을 60초만 캐시하므로(`BITBUCKET_TOKEN_TTL_MS`) **세션 재시작이
필요 없다.** 최대 1분 안에 새 토큰으로 넘어간다.

만료된 토큰은 Atlassian 발급 화면에서 폐기(revoke)한다.

### 3.7 인증 방식

인증은 **계정 이메일 + 토큰**의 HTTP Basic이다. 사용자명(username)이 아니라
이메일이다. 서버가 `BITBUCKET_EMAIL:토큰`을 base64로 인코딩해 보낸다.

app password는 쓰지 않는다. 2026-06-09 브라운아웃, 2026-07-28 완전 제거되었다.

---

## 4. 서버 설치

```bash
mkdir -p ~/tools/bb-mcp && cd ~/tools/bb-mcp
npm init -y && npm pkg set type=module
npm i @modelcontextprotocol/sdk@1 zod@3
# server.mjs, lib.mjs, test/ 를 이 폴더에 저장
npm test   # 121개 통과 확인
```

Node 18+ 필요(전역 `fetch`, `AbortSignal.timeout`).
검증 환경은 Node 24.18 / sdk 1.30 / zod 3.

`@modelcontextprotocol/server` 2.0.0이 나와 있으나 import 경로가 달라진
새 버전이라, 클라이언트 호환이 검증된 1.x를 쓴다.

---

## 5. 토큰을 비밀 저장소에 넣기 (macOS 기준)

```bash
security add-generic-password -U -s bb-api-token -a "$USER" -w '<TOKEN>'
```

서버는 `BITBUCKET_TOKEN_CMD`에 지정된 명령의 stdout을 토큰으로 읽는다.
키체인을 안 쓰면 `BITBUCKET_API_TOKEN`에 직접 넣어도 되지만, 설정 파일이
저장소에 커밋되면 그대로 유출된다.

### 여기서 반드시 지킬 것 두 가지

**① `-w` 뒤에 값을 직접 넣는다.**
`-w`를 값 없이 맨 끝에 두면 `security`가 대화형으로 물어보는데,
**그 경로는 128자에서 조용히 잘린다.** Atlassian API 토큰은 190자가 넘으므로
잘린 채 저장되고, 나중에 원인을 알기 어려운 401만 남는다.

| 저장 방식 | 200자 입력 → 조회 결과 |
|---|---|
| `-w` 값 없이 맨 끝 (대화형) | **128자** |
| `-w '<VALUE>'` 인자 | 200자 |

**② 값에 개행을 넣지 않는다.**
개행이 섞이면 `security -w`가 평문 대신 **hex 문자열**을 출력한다.
서버는 그걸 그대로 비밀번호로 보내고, Bitbucket은 **본문 없는 401**을 돌려준다.
(서버가 이 경우를 감지해 설명이 붙은 오류를 내지만, 애초에 안 만드는 게 낫다.)

`-U`는 기존 항목을 덮어쓴다. `delete` 후 `add` 하면 항목의 ACL이 새로 생겨
"security가 기밀 정보를 사용하려 합니다" 프롬프트를 다시 받게 되므로 `-U`가 낫다.

### 저장 확인

```bash
security find-generic-password -s bb-api-token -w | tr -d '\n' | wc -c      # 190~200 근처
security find-generic-password -s bb-api-token -w | cut -c1-5               # ATATT
```

`ATATT`가 아니라 `41544...`가 나오면 hex로 저장된 것이다. 다시 저장한다.

---

## 6. 허용 저장소 파일

서버는 `workspace/repo` allowlist 밖의 경로를 전부 막는다.
파일로 두면 **서버 재시작 없이** 목록을 고칠 수 있다.

```bash
mkdir -p ~/.config/bb-mcp
cat > ~/.config/bb-mcp/allowed-repos <<'LIST'
# 리뷰 대상 저장소. 한 줄에 workspace/repo 하나. `#` 이후는 주석.
acme/web-app      # 서비스 프론트
acme/admin-web    # 어드민
LIST
```

`workspace/repo`는 브라우저에서 `bitbucket.org/` 다음에 오는 두 조각 그대로다.

- **주석만 있고 실제 항목이 없으면 전체 차단이다.** 열리는 게 아니라 막힌다
- 형식이 틀린 줄(`/acme/repo`처럼 앞 슬래시 등)은 줄 번호와 함께 거부된다
- `BITBUCKET_ALLOWED_REPOS`(env)를 같이 설정하면 **env가 이긴다.** 파일을 쓸 거면 env는 빼둔다

자세한 동작은 [README.md §4](./README.md)에.

**목록은 기동 시 한 번 읽는다.** 저장소를 추가하려면 파일에 한 줄 넣고
세션을 재시작한다.

```bash
printf '\nacme/new-repo\n' >> ~/.config/bb-mcp/allowed-repos
```

앞의 `\n` 은 파일 마지막 줄에 개행이 없을 때 이전 항목에 붙어버리는 것을 막는다.
빈 줄은 무시되므로 항상 붙여도 무해하다. 편집은 쉽고 반영에는 재시작이 필요한 이 조합이
경계의 실체다 — 에이전트가 파일을 고쳐도 그 세션에서는 쓸 수 없다.

`BITBUCKET_ALLOWLIST_RELOAD=true` 로 켜면 재시작 없이 반영되지만
그 장벽이 사라진다. [README.md §7 ②](./README.md) 참고.

---

## 7. 등록

전역 = **user scope**. `~/.claude.json`에 저장되고 모든 프로젝트에서 로드된다.

```bash
claude mcp add \
  --scope user \
  --env BITBUCKET_EMAIL=you@company.com \
  --env BITBUCKET_TOKEN_CMD="security find-generic-password -s bb-api-token -w" \
  --env BITBUCKET_ALLOWED_REPOS_FILE="$HOME/.config/bb-mcp/allowed-repos" \
  --env BITBUCKET_ALLOW_COMMENT=true \
  --transport stdio \
  bitbucket \
  -- $(which node) ~/tools/bb-mcp/server.mjs
```

env가 많아 JSON이 편하면:

```bash
claude mcp add-json bitbucket --scope user \
  '{"type":"stdio","command":"/usr/local/bin/node","args":["/Users/you/tools/bb-mcp/server.mjs"],"env":{"BITBUCKET_EMAIL":"you@company.com","BITBUCKET_TOKEN_CMD":"security find-generic-password -s bb-api-token -w","BITBUCKET_ALLOWED_REPOS_FILE":"/Users/you/.config/bb-mcp/allowed-repos","BITBUCKET_ALLOW_COMMENT":"true"}}'
```

### 게이트 두 개는 별개다

| 변수 | 여는 것 |
|---|---|
| `BITBUCKET_ALLOW_COMMENT=true` | `bb_comment` — PR 코멘트만 |
| `BITBUCKET_ALLOW_WRITE=true` | `bb_write` — PR 머지·승인·브랜치 삭제까지 |

리뷰가 목적이면 `ALLOW_COMMENT`만 켠다. `ALLOW_WRITE`는 켤 이유가 없다.

### 경로는 절대 경로로

`BITBUCKET_ALLOWED_REPOS_FILE`에 상대 경로를 쓰면 안 된다.
MCP 서버가 어느 cwd에서 뜰지 보장되지 않는다. (`~/`는 서버가 확장해 준다.)

### 문법에서 틀리기 쉬운 지점

- **`--` 뒤가 실행 명령**이다. 빼면 Claude Code가 서버 인자를 자기 옵션으로 파싱한다
- **`--env` 바로 뒤에 서버 이름을 두면 안 된다.** CLI가 이름을 또 다른
  `KEY=value`로 읽고 거부한다. 사이에 `--transport`를 끼운다
- **node는 절대 경로로.** nvm을 쓰면 spawn 시 PATH에 `node`가 없어
  `spawn node ENOENT`가 난다

### 스킬도 같이

MCP 툴은 슬래시 명령이 아니다. `/bb-pr-review` 를 쓰려면 스킬을 설치한다.

```bash
claude plugin marketplace add ./
claude plugin install bb-pr-review@bb-mcp --scope user
```

`setup.sh` 6단계가 대신한다. 자세한 것은 [README.md §1-1](./README.md).

**저장소 루트에 `.mcp.json` 을 만들지 않는다.** 프로젝트 스코프 MCP 설정으로
읽혀서 user 스코프 등록을 덮어쓰고, 서버가 `CONNECTION_CLOSED` 로 죽는다.

### 등록 스코프 (local / project / user)

토큰 스코프(§3.3)와는 다른 개념이다. 설정을 어느 범위에 저장할지의 문제다.

| 스코프 | 로드 범위 | 저장 위치 |
|---|---|---|
| local (기본) | 현재 프로젝트만 | `~/.claude.json` |
| project | 현재 프로젝트, 팀 공유 | `.mcp.json` |
| user | 모든 프로젝트 | `~/.claude.json` |

우선순위는 local > project > user. 같은 이름이 여러 스코프에 있으면
높은 쪽 항목이 **통째로** 쓰인다. 필드 병합이 아니다.

claude.ai 웹/앱 커넥터에는 등록할 수 없다. 로컬 프로세스를 띄우는 stdio는
Claude Code나 Desktop만 가능하다.

---

## 8. 확인

```bash
claude mcp list          # ✔ Connected 확인
claude mcp get bitbucket # 실패 시 Issue: 줄에 HTTP 상태
```

세션 안에서는 `/mcp`로 상태와 툴 개수를 본다. 툴이 **12개** 보여야 한다.

`claude mcp add`는 설정만 쓰고 자격증명을 검증하지 않는다. 자격증명이 틀려도
`add`는 성공하고 `list`에서 실패로 뜬다.

세션에서 첫 확인은 **`bb_doctor`** 다. 토큰 형태·인증·스코프·allowlist·게이트를
한 번에 점검하고, 문제가 있으면 실행할 명령까지 알려준다.

```
bb_doctor()
→ ok: false, 문제 1건
  ✖ write:pullrequest:bitbucket: 없음 → bb_comment 사용 불가
     fix: 토큰을 이 스코프를 포함해 재발급하세요
```

토큰 값은 어떤 형태로도 출력되지 않는다(접두사조차 담지 않는다).
allowlist가 깨져 있어도 동작하므로, 그 상황에서도 원인을 알 수 있다.

이후 실제 데이터 확인은 `bb_repos`(인자 없이)로 한다.

---

## 9. 트러블슈팅

### 먼저 bb_doctor

증상별 표를 보기 전에 `bb_doctor` 를 부른다. 아래 대부분을 자동으로 판정하고
조치 명령까지 준다. 세션이 아예 안 붙어서 툴을 못 부르는 경우에만 표를 본다.

### 증상별

| 증상 | 원인 | 조치 |
|---|---|---|
| `spawn node ENOENT` | `command`가 상대 경로 | `which node` 결과로 교체 |
| 401 + `no Bitbucket scopes` | 토큰 생성 시 Bitbucket 앱 미선택 | 스코프 지정해 재발급 (§3) |
| **401 + 응답 본문 없음** | 토큰이 hex이거나 잘림 | §5 확인 명령으로 점검, 재저장 |
| 403 + `lack one or more required privilege scopes` | 스코프 부족 | 응답의 `required` 필드가 필요한 스코프를 알려준다 |
| `/user`만 403 | `read:user` 미부여 | **정상.** PR 리뷰에 불필요 |
| `허용되지 않은 저장소: X` | allowlist 밖 | 파일에 추가 (재시작 불필요) |
| `비어 있어 모든 저장소를 차단` | 파일에 주석만 있음 | 실제 저장소 줄 추가 |
| `N번째 줄이 'workspace/repo' 형식이 아닙니다` | 오타 (앞 슬래시 등) | 그 줄 수정 |
| `읽을 수 없어 모든 저장소를 차단` | 파일 경로 오타/삭제 | 경로 확인 |
| `hex로 인코딩돼 보입니다` | 키체인 값에 개행 | §5대로 재저장 |
| 툴이 2개만 보임 | 옛 버전이 떠 있음 | 세션 재시작 |
| 토큰을 바꿨는데 계속 401 | 토큰 캐시 | 최대 60초 대기 (`BITBUCKET_TOKEN_TTL_MS`) |
| 서버가 죽은 뒤 복구 안 됨 | stdio는 자동 재연결 없음 | `/mcp`에서 수동 reconnect |
| 429 Too Many Requests | Bitbucket rate limit | 자동 재시도(기본 2회). 계속 나면 `BITBUCKET_RETRY_MAX` 상향 |
| 원인을 모르겠다 | — | `bb_doctor` 먼저. 그다음 `BITBUCKET_DEBUG=true`로 재등록 후 MCP 로그 |
| MCP 연결만 실패하고 이유가 없음 | 설정 오류 | 서버가 stderr에 원인을 남기고 exit 1 한다. 로그를 본다 |
| `CONNECTION_CLOSED` | 프로젝트 `.mcp.json` 이 user 스코프를 덮어씀 | 저장소 루트의 `.mcp.json` 을 지운다 (§7) |
| `/bb-pr-review` 가 `/` 목록에 없음 | 스킬 미설치 | `claude plugin list` 확인. `~/.claude/skills/` 에 있어야 로드된다 |
| 툴은 다 되는데 슬래시 명령이 없음 | **정상** | MCP 툴은 슬래시 명령이 아니다. 스킬이 별개다 |

### 401과 403의 차이가 진단의 핵심

- **401** = 자격증명 자체가 거부됨. 이메일이 틀렸거나, 토큰이 잘렸거나 hex다
- **403** = 인증은 됐고 권한만 부족. **토큰은 정상**이라는 뜻이다

토큰을 바꾼 뒤 `bb_get /user`를 불러 403이 나오면 성공이다.
401이면 아직 옛 토큰을 쓰고 있거나 저장이 잘못된 것이다.

### 진단 로그

```bash
--env BITBUCKET_DEBUG=true
```

stderr(= Claude Code의 MCP 로그)에 요청·상태·소요시간·재시도가 남는다.
토큰은 절대 찍히지 않는다.

```
[bb-mcp] GET /repositories/ws/repo -> 429 (25ms)
[bb-mcp] GET /repositories/ws/repo -> 429, 0ms 후 재시도 (1/2)
[bb-mcp] GET /repositories/ws/repo -> 200 (2ms)
```

### 재시도 규칙

| 상황 | GET | POST/PUT/DELETE |
|---|---|---|
| 429 (rate limit) | 재시도 | **재시도** — 요청이 거부된 것이므로 안전 |
| 5xx | 재시도 | **안 함** — 이미 처리됐을 수 있어 중복 위험 |
| 네트워크 오류 | 재시도 | 안 함 |
| 4xx (429 제외) | 안 함 | 안 함 |

`Retry-After` 헤더가 있으면 그 값을 따른다(최대 30초).
없으면 지수 백오프 + 지터. 기본 2회, `BITBUCKET_RETRY_MAX`로 조정(0이면 끔).

### 재시작이 필요한 것 / 아닌 것

| 바꾼 것 | 재시작 |
|---|---|
| allowlist 파일 내용 | **필요** (`ALLOWLIST_RELOAD=true` 면 불필요) |
| 키체인 토큰 | 불필요 (최대 60초) |
| `server.mjs` / `lib.mjs` 코드 | **필요** |
| `~/.claude.json`의 env | **필요** |

---

## 10. 리뷰 한 바퀴

```
bb_doctor()                             설정 점검 (처음 한 번, 그리고 막힐 때)
bb_pr_inbox()                           어디에 뭐가 열려 있나 (allowlist 전체)
bb_pr_get(repo, id)                     의도·범위 파악 → source_commit 확보
bb_pr_files(repo, id)                   어디를 볼지 정하기
bb_pr_diff(repo, id, path=...)          파일 단위로 변경분 읽기
bb_file(repo, source_commit, path)      맥락이 필요하면 파일 전문 + 줄 번호
bb_pr_comments(repo, id)                이미 지적된 것 확인 (중복 방지)
bb_comment(repo, id, body, path, line)  줄 단위로 코멘트
```

저장소가 여럿이면 `bb_pr_inbox`가 출발점이다. 저장소별로 `bb_pr_list`를
12번 부르는 대신 한 번에 모아 최근 갱신순으로 돌려준다.

`bb_file`은 diff의 hunk만으로 판단이 안 설 때 쓴다. 줄 번호가 붙어 나오므로
`bb_comment`의 `line`을 여기서 그대로 읽는다.

`bb_pr_diff`의 변경 후 줄 번호, `bb_file`의 줄 번호, `bb_comment`의 `line`이
모두 같은 좌표계임을 실측으로 확인했다([README.md §6](./README.md)).
변경 전 파일의 줄을 지목할 때만 `side: "old"`를 쓴다.

**`bb_pr_diff`는 `path` 없이 부르지 않는 걸 기본으로 삼는다.**
실측한 PR 하나의 전체 diff가 77KB였다. 기본 상한 60,000바이트로도 잘린다.
`bb_pr_files`로 파일 목록을 먼저 보고 파일 단위로 받는다.

`/pr-review-ko` 스킬과 물려 쓰면 그 스킬이 요구하는 `path:LINE` 인용 포맷이
`bb_pr_files`의 `path` + `bb_comment`의 `line`과 그대로 대응한다.

---

## 11. 직접 만드는 이유

3rd-party MCP 패키지를 쓰면 저장소 접근 토큰이 남의 npm 패키지 프로세스로
들어간다. 사내 코드가 대상이면 이 경계를 통제할 수 있어야 한다.

- **저장소 allowlist.** Bitbucket 토큰 스코프는 워크스페이스 단위라
  "이 저장소만"이 안 된다. 서버 레이어에서 자른다. 경로 판정은 default-deny다
- **게이트 분리.** 코멘트를 달려고 머지 권한까지 열어줄 필요가 없다
- **전용 툴이 body 스키마를 고정.** `bb_comment`는 `.../comments` POST 외의
  어떤 경로도 만들 수 없다
- **allowlist를 넓히는 툴이 없다.** 파일은 사람이 편집하고 서버는 읽기만 한다.
  에이전트가 "저장소 목록 보고 추가해줘" 한 마디로 자기 경계를 넓힐 수 없다
- **쓰기는 재시도하지 않는다.** 5xx에서 코멘트 POST를 재시도하면 중복이 달린다.
  읽기만 재시도한다
- **판정 대상과 전송 대상이 같다.** 가드는 문자열이 아니라 `fetch`에 넘길
  `URL` 객체를 검사한다. 문자열 검사는 실제로 `%2e%2e` 로 우회됐다
  ([README.md §7](./README.md))
- **짧다.** `server.mjs` 690줄 + `lib.mjs` 390줄. 토큰이 어디로 나가는지 눈으로 확인된다
- **응답 필드 강제.** PR 원본 JSON은 수백 줄이지만 `bb_pr_get`은 20줄 이하로 줄인다
