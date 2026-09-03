---
description: 허용 저장소 목록을 보거나 저장소를 추가한다
argument-hint: [add <workspace/repo>]
---

인자: $ARGUMENTS

- 인자가 없으면 `bb_allowlist_list` 로 지금 적용 중인 목록과 출처를 보여준다.
  파일이 기동 시점과 다르면(`in_sync: false`) 재시작하면 열릴/닫힐 저장소를 함께 알린다.
- `add <workspace/repo>` 면 `bb_allowlist_add` 로 파일에 추가한다.

`bb_allowlist_add` 는 기본 차단이다. 막히면 두 경로를 알려준다.

1. 파일을 직접 고친다 (기본 경로)
   ```bash
   printf '\nworkspace/repo\n' >> ~/.config/bb-mcp/allowed-repos
   ```
   앞의 `\n` 은 파일 마지막 줄에 개행이 없을 때 이전 항목에 붙는 것을 막는다.
2. `BITBUCKET_ALLOW_ALLOWLIST_WRITE=true` 로 재등록한다.

**추가는 그 세션에 반영되지 않는다.** 서버가 기동 시 스냅샷을 쓰기 때문이다.
반영에는 세션 재시작이 필요하다는 점을 반드시 알린다.
