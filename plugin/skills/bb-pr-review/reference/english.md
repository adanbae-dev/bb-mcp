# 영어로 쓸 때의 용어 대응

매번 다르게 옮기면 팀이 `## 종합 의견` 만
뽑아 보거나 `추정:` 을 grep 하는 것이 깨진다.

| 한국어 | English |
|---|---|
| `## 종합 의견` | `## Verdict` |
| `추정:` / `확인 필요:` | `Assumption:` / `Needs verification:` |
| `P1`·`P2`·`P3`·`Q` | 그대로 (`Q:` 도 그대로) |
| `P1 1건 / P2 3건 / P3 2건 / Q 1건` | `P1 1 / P2 3 / P3 2 / Q 1` |
| 미해결 P1 n건 — 해결 후 머지 가능. Request changes 여부는 사람이 판단한다 | Unresolved P1: n — mergeable once fixed. Requesting changes is a human call |
| 미해결 P1 없음 — 머지 가능. P2·P3 는 후속 처리 가능 | No unresolved P1 — ready to merge. P2/P3 can follow up |
| `[버그]`·`[보안]`·`[성능]`·`[품질]`·`[테스트]`·`[기록]` | `[Bug]` · `[Security]` · `[Performance]` · `[Quality]` · `[Tests]` · `[Records]` |
| 「사람 리뷰 필요 영역」 | `Human review needed` |
| 「이 리뷰가 확인하지 못한 것」 | `What this review could not verify` |
| 「이전 리뷰 처리」 | `Previous review` |
