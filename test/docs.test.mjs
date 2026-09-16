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

/** 파일의 첫 ```markdown 블록 안 `## 제목` 을 순서대로 뽑는다 */
function templateSections(path) {
  const block = read(path).match(/^```markdown\n([\s\S]*?)^```$/m)?.[1];
  assert.ok(block, `${path} 에 \`\`\`markdown 템플릿 블록이 없다`);
  return [...block.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

test("PR 템플릿의 절이 생성 스킬·명령과 일치한다", () => {
  // **양방향으로 센다.** 이전 판은 절 이름 4개를 정규식에 박아 두고 '있는가' 만
  // 봤다. 그래서 스킬 쪽 예시에만 `## 커밋` 이 늘어난 것을 놓쳤고, 스킬 본문은
  // "절을 늘리지 않는다" 라고 적은 채로 테스트가 통과했다 — CLAUDE.md §4 대로
  // 예시가 이기므로 실제 출력은 5절이 됐을 것이다.
  const tpl = templateSections("docs/pr-template.md");
  assert.ok(tpl.length >= 4, `템플릿 절이 너무 적다: ${tpl.join(", ")}`);

  const skill = templateSections("plugin/skills/bb-pr-create/SKILL.md");
  assert.deepEqual(skill, tpl, "bb-pr-create 스킬의 템플릿 절이 단일 소스와 다르다");

  // 명령의 초안 미리보기는 `**## 절이름**` 형태로 같은 절을 나열한다
  const cmd = read("plugin/commands/bb-pr-new.md");
  const shown = [...cmd.matchAll(/^\*\*## (.+?)\*\*$/gm)].map((m) => m[1].trim());
  assert.deepEqual(shown, tpl, "bb-pr-new 초안 미리보기의 절이 단일 소스와 다르다");

  // 절 개수를 글로 적어 둔 곳도 같이 센다 — 숫자는 조용히 낡는다
  for (const f of ["plugin/skills/bb-pr-create/SKILL.md", "plugin/commands/bb-pr-new.md"]) {
    const n = read(f).match(/(\d+)개 절/)?.[1];
    assert.equal(n, String(tpl.length), `${f} 가 '${n}개 절' 이라고 적었다 (실제 ${tpl.length})`);
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

test("리뷰 분량 상한이 스킬에 있고 명령이 그것을 가리킨다", () => {
  // 0.21.0 규약으로 쓴 첫 실물 리뷰가 70줄이었다. 규칙이 "짧게" 뿐이라
  // 넘겼는지 판정할 수 없었다. 상한과 예시가 사라지면 같은 일이 반복된다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  assert.ok(skill.includes("## 분량 — 세어서 지킨다"), "분량 절이 없다");
  for (const row of ["🔴 지적 1건", "🟠🟡🔵⚪ 지적 1건"]) {
    assert.ok(skill.includes(row), `분량 표에 '${row}' 행이 없다`);
  }
  // 규칙 문장보다 예시가 세다(CLAUDE.md §4) — ❌/✅ 쌍이 실제 상한을 정한다
  assert.ok(skill.includes("❌ 30줄") && skill.includes("✅ 9줄"), "분량 예시 쌍이 없다");

  assert.ok(
    read("plugin/commands/bb-review.md").includes("분량"),
    "bb-review 명령이 분량 상한을 가리키지 않는다",
  );
});

test("리뷰 분류 축의 개수·이모지가 네 파일에서 같다", () => {
  // 📄(기록·설명)를 6번째로 넣으면서 '5개 분류' 가 네 곳에 흩어져 있는 것을 발견했다.
  // 숫자와 이모지 묶음은 코드가 아니라 글이라 갈려도 아무 데서도 안 터진다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  const items = [
    ...skill.matchAll(/^\d+\. (\p{Emoji_Presentation}|📄) \*\*/gmu),
  ].map((m) => m[1]);
  assert.ok(items.length >= 5, `리뷰 항목을 못 읽었다: ${items.length}개`);

  // 「언어 무관」 절의 이모지 묶음에 전부 들어 있어야 한다
  const set = skill.match(/이모지 체계\(([^)]+)\)/)?.[1];
  for (const e of items) {
    assert.ok(set?.includes(e), `이모지 묶음에 ${e} 가 없다: ${set}`);
  }

  // 개수를 글로 적어 둔 세 곳
  const n = String(items.length);
  for (const f of [
    "plugin/skills/bb-pr-review/SKILL.md",
    "plugin/skills/bb-pr-review/README.md",
    "plugin/commands/bb-review.md",
  ]) {
    const said = read(f).match(/(\d+)개 분류/)?.[1];
    assert.equal(said, n, `${f} 가 '${said}개 분류' 라고 적었다 (실제 ${n})`);
  }
});

test("재리뷰 규약이 스킬에 있고 명령이 그것을 가리킨다", () => {
  // 실물 재리뷰에서 「이전 리뷰 처리」 표를 즉석에서 만들었다. 고정 포맷이
  // 값인데 즉흥이 들어간 것이라 규약으로 옮겼다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  assert.ok(skill.includes("## 재리뷰 — 이전 리뷰가 있을 때"), "재리뷰 절이 없다");
  for (const state of ["닫힘", "남음", "되돌림"]) {
    assert.ok(skill.includes(`| ${state} |`), `재리뷰 상태 '${state}' 가 표에 없다`);
  }
  assert.ok(
    read("plugin/commands/bb-review.md").includes("재리뷰"),
    "bb-review 명령이 재리뷰 규약을 가리키지 않는다",
  );
});
