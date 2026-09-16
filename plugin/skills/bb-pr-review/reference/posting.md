# 게시 절차

기본은 **출력까지**다. `BITBUCKET_ALLOW_COMMENT=true` 가 아니면 서버가 차단한다.

```
bb_comment(repo, id, body="<전체 리뷰>")                          PR 전체 코멘트
bb_comment(repo, id, body="<지적 하나>", path="<파일>", line=N)   인라인
bb_comment(repo, id, body="<답글>", parent_id=<코멘트 id>)        답글
```

- 게시한 코멘트는 이 스킬로 **지울 수 없다**(`bb_write` 필요, 기본 차단). UI 를 쓴다
- 변경 전 파일의 줄을 지목할 때만 `side="old"`

**게시 직전에 그 줄을 한 번 더 읽는다 (필수).** 「라인 번호 검증」은 리뷰를 *쓰는*
시점이고 게시는 그 뒤다. 옮겨 적으며 어긋날 수 있다.

```
bb_file(repo, ref=source_commit, path="<파일>", start=N, end=N)
```

- 그 줄의 내용이 **코멘트가 인용한 코드와 같아야** 한다. 다르면 게시하지 않는다
- **본문에 적은 번호와 `line` 인자가 같아야** 한다. 다르면 본문은 맞고 앵커만 틀린
  코멘트가 되고, 아무도 그 사실을 모른다
- 지목할 줄이 **이 PR 이 바꾼 줄인지** 확인한다(`bb_pr_diff` 의 `+`). 아니면 인라인
  대신 전체 코멘트에 `path:LINE` 으로 적는다 — Bitbucket 이 앵커를 옮길 수 있다
  (`추정:` 실측하지 않았다)

**게시 후 되읽기 (필수)** — `bb_pr_comments(repo, id, inline_only=true)` 로
`inline.to` 가 의도한 번호인지 본다. 다르면 **사용자에게 알린다.** 지울 수 없으므로
정정 답글을 달거나 UI 에서 옮겨야 한다. 조용히 넘기지 않는다.
