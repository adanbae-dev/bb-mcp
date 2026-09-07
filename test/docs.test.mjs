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
