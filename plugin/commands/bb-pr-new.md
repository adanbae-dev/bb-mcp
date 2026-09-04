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
