import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 문서와 코드가 갈리는 것은 조용한 실패다 — 틀려도 아무 데서도 안 터진다.
// 세 릴리스(0.18.1·0.18.2·0.18.3) 연속으로 "확인했다" 뒤에 누락이 더 나왔다.
// 사람이 훑는 것으로는 안 되므로 대조를 테스트로 옮긴다.
//
// 이름과 파라미터 **존재**만 본다. 설명 문장의 정확성은 기계로 못 보므로
// 여기서 다루지 않는다(그 한계를 알고 쓴다).

const server = readFileSync("server.mjs", "utf8");
const readme = readFileSync("README.md", "utf8");

/** server.mjs 의 registerTool 블록에서 [툴 이름, inputSchema 키 목록] 을 뽑는다 */
function toolsFromCode() {
  const out = [];
  for (const block of server.split("server.registerTool(").slice(1)) {
    const name = block.match(/^\s*"(bb_[a-z_]+)"/)?.[1];
    if (!name) continue;
    const schema = block.match(/inputSchema:\s*\{(.*?)\n {4}\},/s)?.[1] ?? "";
    const keys = [...schema.matchAll(/^ {6}([a-z_]+):/gm)].map((m) => m[1]);
    out.push([name, keys]);
  }
  return out;
}

test("모든 툴이 README 에 시그니처를 갖는다", () => {
  const missing = toolsFromCode()
    .map(([name]) => name)
    .filter((name) => !new RegExp("`" + name + "\\(").test(readme));
  assert.deepEqual(missing, [], "README §3 툴 표에 위 툴의 `이름(...)` 이 없다");
});

test("툴의 모든 파라미터가 README 시그니처에 적혀 있다", () => {
  const gaps = [];
  for (const [name, keys] of toolsFromCode()) {
    const sig = readme.match(new RegExp("`" + name + "\\(([^)]*)\\)`"))?.[1];
    if (sig === undefined) continue; // 위 테스트가 잡는다
    for (const k of keys) {
      if (!sig.includes(k)) gaps.push(`${name}: ${k}`);
    }
  }
  // 선택 파라미터도 적는다 — 안 적으면 그 기능이 없는 것처럼 보인다.
  // 실제로 bb_pr_create 의 reviewers 가 `...` 뒤에 숨어 있어, 리뷰어 지정이
  // 가능한지 알려면 코드를 열어야 했다.
  assert.deepEqual(gaps, [], "위 파라미터가 README 시그니처에 빠져 있다");
});

test("툴 개수가 문서와 맞는다", () => {
  const n = toolsFromCode().length;
  assert.ok(
    new RegExp(`툴 ${n}개`).test(readme),
    `코드에는 툴이 ${n}개인데 README 가 그 수를 말하지 않는다`,
  );
});

// ── 원칙·템플릿이 단일 소스와 갈렸는지 ──────────────────────────
// 같은 규칙이 문서와 스킬 양쪽에 있으면 한쪽만 고쳐진다(CLAUDE.md §4).
// "고정되게 처리" 를 사람 기억이 아니라 여기서 지킨다.

const read = (f) => readFileSync(f, "utf8");

test("PR 템플릿의 절이 생성 스킬·명령과 일치한다", () => {
  const tpl = read("docs/pr-template.md");
  // 템플릿 코드블록 안의 `## ` 제목이 실제 절이다
  const sections = [...tpl.matchAll(/^## (수정 목적|수정 범위와 제약|범위 외의 내용|동작 확인 절차)$/gm)]
    .map((m) => m[1]);
  assert.equal(sections.length, 4, `템플릿 절이 4개가 아니다: ${sections.join(", ")}`);

  const skill = read("plugin/skills/bb-pr-create/SKILL.md");
  const cmd = read("plugin/commands/bb-pr-new.md");
  for (const sec of sections) {
    assert.ok(skill.includes(sec), `bb-pr-create 스킬에 「${sec}」 이 없다`);
    assert.ok(cmd.includes(sec), `bb-pr-new 명령에 「${sec}」 이 없다`);
  }
});

test("스킬이 단일 소스 문서를 가리킨다", () => {
  // 복제가 아니라 참조여야 한다 — 복제하면 갈린다
  assert.ok(
    read("plugin/skills/bb-pr-create/SKILL.md").includes("pr-template.md"),
    "bb-pr-create 스킬이 pr-template.md 를 가리키지 않는다",
  );
  assert.ok(
    read("plugin/commands/bb-pr-new.md").includes("pr-template.md"),
    "bb-pr-new 명령이 pr-template.md 를 가리키지 않는다",
  );
  assert.ok(
    read("plugin/skills/bb-pr-review/SKILL.md").includes("review-principles.md"),
    "bb-pr-review 스킬이 review-principles.md 를 가리키지 않는다",
  );
});

test("리뷰 원칙이 5개이고, 스킬이 구현하는 것은 본문에 있다", () => {
  const doc = read("docs/review-principles.md");
  const n = [...doc.matchAll(/^## \d\. /gm)].length;
  assert.equal(n, 5, `원칙이 5개가 아니다: ${n}개`);

  // 1·2·4 는 기존 절차·포맷이 담당하므로 참조만 한다.
  // 3·5 는 스킬에 새로 들어간 것이라 본문에 있어야 한다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  assert.ok(skill.includes("전제를 일치시킨다"), "원칙 3 이 리뷰 스킬에 없다");
  assert.ok(skill.includes("사람이 아니라 코드에"), "원칙 5 가 리뷰 스킬에 없다");
});
