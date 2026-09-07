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

## 출력

원본 JSON을 붙이지 않는다. **상태 한 줄 + 목록**이다.

정상이고 `in_sync` 면 짧게 끝낸다. 저장소 13개를 표로 그리지 않는다 —
열이 하나뿐인 표는 목록보다 읽기 나쁘다.

```markdown
허용 저장소 **13개** · 파일 모드 · `~/.config/bb-mcp/allowed-repos`

`acme/admin-web` · `acme/api` · `acme/web-app` …
```

- 10개를 넘으면 앞 5개만 쓰고 `… (외 8개)` 로 줄인다. 전체는 물어보면 준다
- 인라인 코드(`` ` ``)로 감싼다 — 저장소 이름과 문장이 섞이면 경계가 안 보인다

### 주의가 필요한 상태는 목록보다 위에

| 응답 필드 | 표시 |
|---|---|
| `warning` (denied) | 🔴 **전부 차단됨** — `fix` 를 명령으로 제시 |
| `warning` (open) | 🟠 **제한 없음** — 토큰 스코프 전체가 열려 있다는 뜻을 풀어 쓴다 |
| `error` · `file_error` | 🔴 파싱 실패 — 몇 번째 줄인지 그대로 인용 |
| `in_sync: false` | 🟠 재시작 대기 — 열릴 저장소와 닫힐 저장소를 따로 묶는다 |

`in_sync: false` 는 표로 내는 편이 낫다. 방향이 두 개라서다.

```markdown
🟠 파일이 기동 시점과 다릅니다. **세션을 재시작해야 반영됩니다.**

| 재시작하면 | 저장소 |
|---|---|
| 열림 | `acme/new-repo` |
| 닫힘 | `acme/old-repo` |
```

`mode` 가 `open` 일 때 "13개 허용" 처럼 개수를 말하지 않는다. 개수 제한이
없는 상태다 — 숫자를 보여주면 제한이 있다고 오해한다.
