# 사용법과 툴 레퍼런스

[← README](../README.md)

## 툴

PR을 가져와 분석하고 리뷰 코멘트를 다는 흐름에 맞춰 전용 툴로 쪼개뒀다.
`repo`는 전부 `workspace/repo` 형식이다.

### 읽기

| 툴 | 하는 일 |
|---|---|
| `bb_detect_repo()` | **현재 폴더의 저장소 자동 감지** (git remote 기반) |
| `bb_repos(workspace?)` | 리뷰 대상 저장소 목록. allowlist 가 있으면 **그 목록만** 조회한다 — 워크스페이스 전체 목록은 노출하지 않는다. `workspace` 는 allowlist 가 없을 때만 쓴다 |
| `bb_pr_inbox(state?, per_repo?)` | **allowlist 전 저장소**의 PR을 최근 갱신순으로 |
| `bb_pr_list(repo, state?, limit?)` | 한 저장소의 PR 목록. 기본 `OPEN`, 20개, 최근 갱신순 |
| `bb_pr_get(repo, id)` | PR 상세 — 제목·설명·브랜치·커밋 해시·리뷰어·승인 |
| `bb_pr_files(repo, id, path_prefix?)` | 변경 파일 + 추가/삭제 줄 수 (diffstat). `path_prefix` 로 좁혀도 `file_count`·총계는 전체 기준 |
| `bb_pr_commits(repo, id, full?, limit?)` | PR을 이루는 커밋. **기본은 제목 줄만** |
| `bb_pr_activity(repo, id, limit?)` | 승인·변경요청·업데이트 이력. `pushed_after_approval` 과 `pushed_after_review`(승인 없이 코멘트로만 리뷰하는 팀용). 판정은 소스 커밋 해시 변화 |
| `bb_file_history(repo, ref, path, limit?, enrich?)` | 파일을 건드린 커밋 이력 |
| `bb_branch_commits(repo, branch, exclude?, full?, limit?)` | 브랜치가 대상보다 앞선 커밋 (PR 초안용) |
| `bb_pr_diff(repo, id, path?, context?, max_bytes?)` | unified diff 원문 |
| `bb_pr_comments(repo, id, inline_only?)` | 이미 달린 코멘트 |
| `bb_file(repo, ref, path, start?, end?, max_bytes?)` | 커밋·브랜치의 파일 전문, **줄 번호 포함** |
| `bb_get(path, fields?)` | 위로 안 되는 경로용 범용 GET. `fields` 는 목록 응답에서 `values[]` 각 원소 기준(`update.date`). 아무 값도 못 뽑으면 오류 |
| `bb_doctor(probe?)` | **설정 진단** — 토큰·인증·스코프·allowlist·게이트 |
| `bb_allowlist_list()` | 적용 중인 허용 저장소 + 파일과의 차이 |

`bb_repos`는 allowlist가 설정돼 있으면 **그 목록만** 조회한다.
워크스페이스 전체 목록은 노출하지 않는다. allowlist가 없을 때만
`workspace` 인자를 받아 실제로 나열한다.

`bb_pr_inbox`는 allowlist의 모든 저장소를 병렬로 훑어 한 번에 돌려준다.
저장소 하나가 실패해도 나머지는 그대로 오고, 실패는 `errors`에 모인다.
저장소가 여럿일 때 리뷰의 출발점이다.

목록만 볼 때는 `/bb-pr-review:bb-prs`, 리뷰까지 갈 때는 `/bb-pr-review:bb-review` 를 쓴다 (플러그인 — [설치](./install.md) 「슬래시 명령으로 쓰기 — 플러그인」).
`/bb-pr-review:bb-prs` 는 **현재 폴더의 저장소**를 기본으로 보고 거기서 끝낸다 — 리뷰를 시작하지 않는다.
전체를 보려면 `/bb-pr-review:bb-prs all`. 폴더가 Bitbucket 클론이 아니면 전체로 폴백하고 그 사실을 밝힌다.
`bb_pr_inbox` → `bb_pr_get` → `bb_pr_files` → `bb_pr_diff(path)` → `bb_pr_comments`
순서를 `bb-pr-review` 스킬이 안내한다.

`bb_doctor`는 401·403이 나거나 툴이 안 먹을 때 **가장 먼저 부른다.**
겪은 함정(스코프 없는 토큰, 키체인 128자 절단, 개행→hex, 빈 allowlist)을
전부 감지하고 실행할 명령까지 알려준다. 읽기 전용이고 **토큰 값은 어떤 형태로도
출력하지 않는다** — 접두사조차 담지 않고 boolean으로만 판정한다.
allowlist가 깨져 있어도 동작한다(정작 진단이 필요한 상황이므로).

`bb_file`은 diff의 hunk만으로 판단이 안 설 때 파일 전문을 본다.
줄 번호가 붙어 나오므로 `bb_comment`의 `line`을 여기서 그대로 읽는다.
PR 리뷰 중이라면 `ref`에 `bb_pr_get`의 `source_commit`을 넣는다.

### 쓰기

| 툴 | 게이트 | 하는 일 |
|---|---|---|
| `bb_comment(repo, id, body, path?, line?, side?, parent_id?)` | `ALLOW_COMMENT` | PR 코멘트 |
| `bb_pr_create(repo, title, source_branch, destination_branch?, description?, reviewers?, close_source_branch?)` | `ALLOW_PR_CREATE` | PR 생성. 중복이면 안 만든다. `reviewers` 는 **UUID 배열**(display name 불가) — 저장소 설정의 default reviewers 나 과거 PR 의 `participants.user.uuid` 에서 얻는다 |
| `bb_allowlist_add(repo)` | `ALLOW_ALLOWLIST_WRITE` | 허용 저장소 파일에 한 줄 추가 |
| `bb_write(method, path, body?)` | `ALLOW_WRITE` | 범용 POST/PUT/DELETE |

`bb_comment`:
- `path` + `line` → 해당 파일 줄에 **인라인** 코멘트
- 둘 다 없으면 → PR **전체** 코멘트
- `side`: `new`(기본, 변경 후 파일 줄) / `old`(변경 전 파일 줄)
  — `new` 의 줄 번호는 `bb_pr_diff` 와 `bb_file` 의 번호와 같다 (실측 확인)
- `parent_id` → 그 코멘트의 **답글**. `path`/`line`과 같이 쓸 수 없다

### 저장소를 안 물어본다

`bb_detect_repo()` 가 **서버의 cwd** 에서 git 을 읽어 `workspace/repo` 를 찾는다.
MCP 서버는 Claude Code 가 프로젝트마다 따로 띄우므로 그 cwd 가 곧 작업 중인
프로젝트다(실측 확인 — 서버 3개가 각자 다른 프로젝트에 붙어 있었다).

```json
{ "repo": "acme/web-app", "remote": "origin", "branch": "feature/x",
  "upstream": "origin/feature/x", "unpushed": 0, "allowed": true,
  "note": "acme/web-app 를 자동으로 쓸 수 있습니다." }
```

**remote 이름이 `origin` 이라고 가정하지 않는다.** 전부 훑어 bitbucket 인 것을 고르고,
여러 개면 `origin` 을 우선한다. 실측한 저장소에 remote 가 4개 있었고 GitHub 3 + Bitbucket 1,
그중 Bitbucket 쪽이 `origin` 이었다 — `git remote get-url origin` 만 봤다면 맞췄겠지만
`github-origin` 하나만 보고 GitHub 저장소라고 오판할 수도 있었다.

실패 이유를 구분해 알려준다.

| 결과 | 뜻 |
|---|---|
| `is_git: false` | git 저장소가 아니다 |
| `repo: null` + `other_remote_host` | Bitbucket 이 아니다. GitHub 이면 `gh` 를 쓴다 |
| `allowed: false` | allowlist 밖이다. 추가 후 세션 재시작 |

`unpushed` 는 PR을 만들기 전에 중요하다 — 로컬에만 있는 커밋은 PR에 포함되지 않는다.

스킬·명령은 `repo` 인자가 없으면 **전부** 이걸 먼저 부르고, 어느 저장소를 쓰는지
한 줄로 밝힌 뒤 진행한다. 말없이 쓰지 않는다.

| 명령 | 감지 성공 | 감지 실패 |
|---|---|---|
| `/bb-pr-review:bb-prs` | 그 저장소의 PR | 전체 목록으로 폴백 (이유를 밝힌다) |
| `/bb-pr-review:bb-review` | 그 저장소의 PR에서 고르게 | 선택창 |
| `/bb-pr-review:bb-pr-new` | 그 저장소·브랜치로 초안 | 선택창 |

**예외를 두지 않는다.** 프로젝트 폴더에서 부르면 그 프로젝트가 범위다.
전체를 원하면 `all` 이나 저장소를 명시한다.

### 그래도 물어야 하면 선택창으로

감지에 실패했고 인자도 없으면 `AskUserQuestion` 으로 선택창을 띄운다.
평문으로 "어느 저장소인가요?" 라고 되묻지 않는다 — 사용자가 이름을 기억해
타이핑해야 한다.

**옵션은 2~4개까지다.** allowlist 가 그보다 많으면 순위를 정해 상위 4개를 보여주고
나머지는 "Other" 로 직접 입력받는다. 순위는 **열린 PR이 있는 저장소 우선**,
그다음 최근 갱신순 — 리뷰가 목적이니 당장 할 일이 있는 것이 위로 와야 한다.

```
저장소를 고르세요

1) acme/web-app        열린 PR 1건 · 방금
2) acme/admin-web      09-03 갱신
3) acme/api            09-02 갱신
4) acme/mobile         09-02 갱신
   Other (직접 입력)
```

각 옵션에 **고를 근거**를 붙인다. 이름만 나열하면 선택에 도움이 안 된다.

- allowlist 가 4개 이하면 전부 넣는다
- **1개면 묻지 않는다** — 그것을 쓰고 한 줄로 밝힌다
- `allowed: false` 일 때는 선택창을 띄우지 않는다. 그 저장소를 쓰려던 것이므로
  allowlist 추가가 필요하다는 사실을 알리는 게 맞다

### 결과는 마크다운 표로 낸다

툴은 JSON을 돌려준다 — 기계가 읽는 형식이고, 모델이 정렬·필터하고 인라인 코멘트
줄번호를 다루려면 구조가 필요하다. **사용자에게 보이는 것은 표다.** 명령과 스킬이
변환을 맡는다.

```markdown
## 열린 PR · acme/web-app

| # | 제목 | 작성자 | 갱신 |
|---|---|---|---|
| 64 | fix: 투표 마감 시각 KST 표시 💬4 | 김철수 | 09-07 04:39 |

`feature/PROJ-14404` → `dev`

→ 리뷰: /bb-pr-review:bb-review acme/web-app 64
```

코드블록 안에서 공백으로 폭을 맞추지 않는다. 터미널이 GFM 을 렌더링하므로 실제
마크다운 표가 낫다 — 한글과 이모지의 표시 폭이 문자 수와 달라서, 직접 맞추면
열이 밀린다.

| 규칙 | 이유 |
|---|---|
| 범위를 `## ` 제목에 | 표와 붙어 있어 어느 범위를 봤는지 놓치지 않는다 |
| 열 순서 고정 (저장소·`#`·제목·작성자·갱신) | 매번 다르면 눈이 다시 찾아야 한다 |
| 오늘은 `MM-DD HH:MM`, 그 외 `MM-DD` | 상대시간(`N시간 전`)은 쓰지 않는다 — 현재 시각을 모르면 계산이 곧 추측이다 |
| 제목은 티켓 접두사 **뒤부터** 40자 | 앞에서부터 세면 `PROJ-17206: fix: ` 가 절반을 먹어 내용이 잘린다 |
| 행은 15개까지 | 실측 101건. 상한이 없으면 아무도 읽지 않는 표가 나온다 |
| 넘치면 제목에 `최근 15건 / 전체 N건` | 몇 건을 안 보여줬는지 밝힌다 |
| `\|` 이스케이프 | PR 제목은 외부 입력이다. 표를 깨뜨릴 수 있다 |

**승인 상태(🟢/🔴)는 목록에 넣지 않는다.** `bb_pr_list`·`bb_pr_inbox` 응답에 승인
정보가 없다 — `approved_by` 는 `bb_pr_get` 에만 있다. 목록에 넣으려면 PR마다 호출이
하나씩 더 붙는다. 물어보면 대상 5건 이하만 조회하고 몇 건을 봤는지 밝힌다.

표를 쓰지 않는 곳도 있다.

- **3건 이하** — 머리글이 내용보다 길어진다
- **허용 저장소 목록** — 열이 하나뿐이라 나열이 읽기 좋다
- **빈 결과** — 머리글만 있는 표를 만들지 않는다. 한 줄로 말한다
- **리뷰 본문** — ①요청 ②무엇 ③재현이 들어갈 자리가 없어진다.
  `bb-pr-review` 스킬의 고정 포맷을 그대로 쓴다. 머리말 아래 「지적 목록」 표는
  분류를 한눈에 보는 **색인**이고 본문을 대신하지 않는다

### 리뷰 한 바퀴

```
bb_pr_inbox()                           어디에 뭐가 열려 있나 (저장소 전체)
bb_pr_get(repo, id)                     의도·범위 파악 → source/destination_commit
bb_pr_files(repo, id)                   어디를 볼지 정하기
bb_pr_commits(repo, id)                 커밋 위생 — 포맷과 기능이 섞였나
bb_pr_activity(repo, id)                승인·리뷰 후 푸시가 있었나 (그 판단이 아직 유효한가)
bb_pr_diff(repo, id, path=...)          파일 단위로 변경분 읽기
bb_file(repo, source_commit, path)      맥락이 필요하면 파일 전문 + 줄 번호
bb_file(repo, destination_commit, ...)  이 PR의 회귀인지 base 대조
bb_file_history(repo, ref, path)        사전 존재라면 언제 들어왔나
bb_pr_comments(repo, id)                이미 지적된 것 확인 (중복 방지)
bb_comment(repo, id, body, path, line)  줄 단위로 코멘트
```

**승인·거부는 없다.** 툴을 만들지 않았고 만들 계획도 없다 — [보안](./security.md) 참고.

**게시는 즉시 공개된다.** Bitbucket 의 배치 리뷰(`Start review` → `pending` →
`Finish review`)는 UI 전용이고 API 에 생성 경로가 없다. 응답에 `pending` 필드는
있지만(실측) 쓰기가 안 되고, 읽기도 리뷰 세션 소유자로 제한된다. 두 가지가 따라온다.

- 게시 전 확인과 **게시 후 되읽기**가 필수다 — 되돌릴 수단이 없으므로
- 중복 검사에 사각지대가 있다. **다른 사람이 UI 에서 리뷰 중이면 그 `pending`
  코멘트가 `bb_pr_comments` 에 보이지 않는다** — 같은 줄을 이미 지적했는지 알 수 없다

### PR 만들기

```
bb_branch_commits(repo, branch, exclude=<대상>)   무엇이 올라가는지
bb_pr_create(repo, title, source_branch, ...)     확인받은 뒤 생성
```

`/bb-pr-review:bb-pr-new` 로 부르면 커밋을 읽어 **제목·설명 초안을 만들고 확인을 받은 뒤** 생성한다.
`bb_pr_create` 는 같은 source 브랜치로 열린 PR이 이미 있으면 만들지 않고 그 PR을 알려준다 —
푸시만으로 반영되므로 새로 만들 필요가 없다.

`BITBUCKET_ALLOW_PR_CREATE` 게이트가 필요하고 **`ALLOW_COMMENT` 로는 열리지 않는다.**
생성은 검토를 요청하는 일이라 승인·머지와 성질이 다르지만, 팀에 알림이 가므로 별도 게이트를 둔다.

`close_source_branch` 는 기본 `false` 다. 요청 없이 브랜치를 지우지 않는다.

`bb_pr_diff`는 큰 PR에서 `max_bytes`(기본 60000)에 걸려 줄 경계로 잘린다.
실측한 PR 하나의 전체 diff가 77KB였다. **`path` 없이 부르지 않는 걸 기본으로 삼는다.**

전체 API 레퍼런스: https://developer.atlassian.com/cloud/bitbucket/rest/
