---
description: 브랜치의 커밋으로 PR 제목·설명 초안을 만들고 확인 후 생성한다
argument-hint: [workspace/repo] [branch] [destination]
---

`bb-pr-create` 스킬을 따라 PR을 만든다.

인자: $ARGUMENTS

인자가 없으면 로컬 git 에서 현재 브랜치와 원격을 추론한다. 원격이 bitbucket.org 가
아니면 이 스킬을 쓰지 않는다.

건너뛰지 말 것:
- 중복 PR 검사 (같은 브랜치로 열린 PR이 있으면 만들지 않는다)
- `bb_branch_commits` 에 `exclude` 지정 (없으면 브랜치 전체 역사가 온다)
- 푸시되지 않은 커밋 확인
- **초안을 보여주고 확인받기** — 확인 없이 생성하지 않는다

`bb_pr_create` 는 `BITBUCKET_ALLOW_PR_CREATE=true` 일 때만 동작한다.
막히면 초안까지 만들어 보여주고 켜는 방법을 알린다.

**승인·머지는 하지 않는다.** 생성 후 리뷰는 `/bb-review <ws>/<repo> <번호>`.

인자가 없으면 `bb_detect_repo()` 로 저장소·브랜치·푸시 상태를 한 번에 얻는다.
`git remote get-url origin` 을 직접 부르지 않는다 — remote 이름이 `origin` 이
아닐 수 있다(실측 저장소에 remote 4개, GitHub 3 + Bitbucket 1).

감지 실패 시 `AskUserQuestion` 선택창으로 저장소를 고르게 한다.

## 초안을 보여주는 형식

확인받을 때 원본 JSON이나 커밋 목록 덤프를 붙이지 않는다.
**무엇이 어디로 가는지**가 한눈에 보여야 한다.

```markdown
## PR 초안 · acme/web-app

| | |
|---|---|
| 제목 | fix: 투표 마감 시각이 KST로 표시되지 않던 문제 |
| 반영 | `feature/PROJ-14404` → `dev` |
| 커밋 | 3개 (전부 푸시됨) |

### 설명

- 마감 시각을 UTC로 렌더링해 9시간 빠르게 보였다
- `formatDeadline()` 에 타임존을 명시

---
이대로 생성할까요? 제목·설명을 고치려면 말씀해 주세요.
```

- **푸시되지 않은 커밋이 있으면 표에 그대로 적는다** — `커밋 | 3개 (1개 미푸시 🟠)`.
  Bitbucket 은 푸시된 것만 본다. 조용히 넘기면 PR에 빠진 커밋이 생긴다
- 같은 브랜치로 열린 PR이 있으면 **초안을 만들지 않고** 그 PR 번호와 URL만 준다
- 커밋 제목을 그대로 PR 제목으로 쓰지 않는다. `Feature/BRANCH-NAME` 류는 제목이 아니다
- 설명에 없는 내용을 채우지 않는다. 근거가 커밋에만 있으면 거기까지만 쓴다
