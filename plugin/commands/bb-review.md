---
description: Bitbucket PR을 bb-mcp로 가져와 한국어 리뷰 코멘트를 작성한다
argument-hint: [workspace/repo] [PR번호] [경로]
---

`bb-pr-review` 스킬을 따라 Bitbucket PR을 리뷰한다.

인자: $ARGUMENTS

- 인자가 없으면 `bb_pr_inbox`로 열린 PR을 보여주고 어느 것을 리뷰할지 묻는다.
- `<workspace>/<repo> <번호>` 형태면 그 PR을 바로 리뷰한다.
- 세 번째 인자로 경로를 주면 그 파일만 본다.

스킬의 실행 순서(대상 확정 → 파일 단위 diff → 기존 코멘트 확인 → 규약 로드 →
배포 경로 → 라인 검증 → base 대조 → 재현 완주 → 도달 가능성)를 건너뛰지 않는다.
특히 `bb_pr_diff`는 `path` 없이 호출하지 않는다.

출력은 마크다운 본문만. **게시는 사용자가 명시적으로 요청할 때만** 한다.

툴이 안 붙거나 401/403이 나면 먼저 `bb_doctor`를 부른다.

저장소·번호를 안 받았으면 `bb_detect_repo()` 로 현재 폴더를 먼저 확인한다.
감지되면 그 저장소의 열린 PR 중에서 고르게 한다.

저장소를 정하지 못하면 `AskUserQuestion` 선택창으로 고르게 한다 —
평문으로 되묻지 않는다. 열린 PR이 있는 저장소를 앞에 둔다.
