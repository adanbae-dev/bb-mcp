import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
  // 규칙 문장보다 예시가 세다(CLAUDE.md §4) — 완성된 지적 하나가 실제 상한을 정한다.
  // ❌ 쪽은 「제일 먼저 지우는 것」 목록과 같은 말이라 지웠다.
  const example = skill.match(/^````markdown\n([\s\S]*?)^````$/m)?.[1] ?? "";
  assert.match(example, /^### 🔴 1-1\. /m, "분량 절에 완성된 지적 예시가 없다");
  assert.ok(example.split("\n").length <= 16, `예시가 ${example.split("\n").length}줄 — 상한보다 길다`);

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

test("재리뷰 규약이 참조 파일에 있고 스킬·명령이 가리킨다", () => {
  // 실물 재리뷰에서 「이전 리뷰 처리」 표를 즉석에서 만들었다. 고정 포맷이
  // 값인데 즉흥이 들어간 것이라 규약으로 옮겼다.
  const ref = read("plugin/skills/bb-pr-review/reference/re-review.md");
  for (const state of ["닫힘", "남음", "되돌림"]) {
    assert.ok(ref.includes(`| ${state} |`), `재리뷰 상태 '${state}' 가 표에 없다`);
  }
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  assert.ok(skill.includes("reference/re-review.md"), "스킬이 재리뷰 참조를 가리키지 않는다");
  assert.ok(
    read("plugin/commands/bb-review.md").includes("재리뷰"),
    "bb-review 명령이 재리뷰 규약을 가리키지 않는다",
  );
});

test("참조 파일이 SKILL.md 에서 한 단계로 전부 연결된다", () => {
  // 공식 권고: 참조는 SKILL.md 에서 한 단계 깊이까지. 중첩되면 Claude 가
  // 일부만 읽는다. 링크 없는 파일은 영영 안 읽히므로 그것도 실패로 본다.
  const dir = "plugin/skills/bb-pr-review/reference";
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length > 0, "참조 파일이 없다");

  for (const f of files) {
    assert.ok(skill.includes(`reference/${f}`), `${f} 가 SKILL.md 에서 링크되지 않는다`);
    // 참조 파일이 또 다른 참조 파일을 가리키면 두 단계가 된다
    for (const other of files) {
      if (other === f) continue;
      assert.ok(
        !read(`${dir}/${f}`).includes(`reference/${other}`),
        `${f} 가 ${other} 를 가리킨다 — 참조가 두 단계 깊어진다`,
      );
    }
  }
  for (const m of skill.matchAll(/\(reference\/([\w.-]+)\)/g)) {
    assert.ok(files.includes(m[1]), `SKILL.md 가 없는 파일 reference/${m[1]} 를 가리킨다`);
  }
});
test("스킬이 Anthropic SKILL.md 규격을 지킨다", () => {
  // 공식 규격: name 은 소문자·숫자·하이픈 64자, description 은 1024자,
  // 본문은 500줄 이하(그 위는 성능 권고 위반). frontmatter 의 미지정 키는
  // Claude Code 가 조용히 무시하므로 — 조용한 실패다(CLAUDE.md §5) —
  // 스펙과 Claude Code 가 함께 아는 키만 허용한다.
  const ALLOWED = new Set([
    "name", "description", "license", "compatibility", "metadata", // Agent Skills 스펙
    "allowed-tools", "disallowed-tools", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "model", "effort",
    "context", "agent", "background", "paths", "shell", "hooks",
  ]);
  const skills = readdirSync("plugin/skills");
  assert.ok(skills.length > 0, "스킬이 없다");

  for (const dir of skills) {
    const path = `plugin/skills/${dir}/SKILL.md`;
    const [, front, ...rest] = read(path).split(/^---$/m);
    const body = rest.join("---");

    for (const key of [...front.matchAll(/^([A-Za-z_-]+):/gm)].map((m) => m[1])) {
      assert.ok(ALLOWED.has(key), `${path} frontmatter 에 규격 밖 키 '${key}'`);
    }

    const name = front.match(/^name:\s*(.+)$/m)?.[1].trim();
    assert.equal(name, dir, `${path} 의 name 이 디렉터리와 다르다`);
    assert.match(name, /^[a-z0-9-]{1,64}$/, `${path} 의 name 이 규격 밖이다`);

    const desc = front.match(/^description:\s*(.+)$/m)?.[1].trim();
    assert.ok(desc && desc.length <= 1024, `${path} description 이 비었거나 1024자 초과`);

    const lines = body.split("\n").length;
    assert.ok(lines <= 500, `${path} 본문이 ${lines}줄 — 500줄 상한 초과`);
  }
});

test("문서가 존재하지 않는 frontmatter 필드를 설명하지 않는다", () => {
  // README 가 "`trigger:` 프론트매터가 슬래시 명령을 만든다" 고 적고 있었다.
  // 그런 필드는 Agent Skills 스펙에도 Claude Code 확장 키에도 없어 조용히
  // 무시된다 — 문서가 없는 기능을 설명하면 읽는 쪽이 그걸 믿는다.
  for (const f of ["README.md", "plugin/skills/bb-pr-review/README.md"]) {
    const claim = read(f).match(/`trigger:`[^\n]*(만든다|생성한다|결정한다)/);
    assert.equal(claim, null, `${f} 가 없는 필드 trigger 의 효과를 주장한다: ${claim?.[0]}`);
  }
});

test("리뷰 출력의 고정 절이 표 밖에서도 지시된다", () => {
  // 「이 리뷰가 확인하지 못한 것」이 용어 대응표와 분량 표에만 있었다. 즉 **쓰라는
  // 말이 어디에도 없었다.** 표는 '어떻게 쓰나' 이지 '쓴다' 가 아니다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  for (const sec of ["이 리뷰가 확인하지 못한 것", "종합 의견"]) {
    const outsideTables = read("plugin/skills/bb-pr-review/SKILL.md")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("|") && l.includes(sec));
    assert.ok(outsideTables.length > 0, `「${sec}」 이 표 안에만 있다 — 쓰라는 지시가 없다`);
  }
  assert.ok(skill.includes("절을 생략한다"), "빈 절을 붙이지 말라는 규칙이 없다");
});

test("스킬이 서버에 미루는 안내를 서버가 실제로 한다", () => {
  // 선행조건 절에서 "그 밖의 실패는 서버 응답이 조치까지 준다" 고 표를 지웠다.
  // 서버 문구가 얇아지면 스킬은 없는 안내를 믿고 아무 말도 안 하게 된다.
  const server = read("server.mjs");
  assert.match(server, /세션을? 재시작/, "allowlist 오류에 재시작 안내가 없다");
  assert.match(server, /fix/, "bb_doctor 가 조치(fix)를 주지 않는다");
  assert.ok(
    read("plugin/skills/bb-pr-review/SKILL.md").includes("서버 응답이 조치까지 준다"),
    "스킬이 서버 안내에 미루는 문장을 잃었다",
  );
});

test("문서가 말하는 게이트 환경변수가 서버에 실재한다", () => {
  // 게이트 이름이 스킬·명령·README 에 흩어져 있다. 서버에서 이름을 바꾸면
  // 문서 쪽은 아무 데서도 안 터지고, 사용자는 없는 변수를 켜게 된다.
  const server = read("server.mjs");
  const docs = [
    "plugin/skills/bb-pr-review/SKILL.md", "plugin/skills/bb-pr-create/SKILL.md",
    "plugin/skills/bb-pr-review/reference/posting.md",
    ...readdirSync("plugin/commands").map((f) => `plugin/commands/${f}`),
  ];
  const seen = new Set();
  for (const d of docs) {
    for (const m of read(d).matchAll(/BITBUCKET_[A-Z_]+/g)) seen.add(m[1] ?? m[0]);
  }
  assert.ok(seen.size > 0, "문서에서 게이트 이름을 하나도 못 찾았다");
  for (const name of seen) {
    assert.ok(server.includes(name), `문서가 말하는 ${name} 가 server.mjs 에 없다`);
  }
});

test("참조 파일을 '읽으라'고 지시한다 — 가리키기만 하지 않는다", () => {
  // 공식 문서의 경고: 링크가 약하면 Claude 가 번들 파일에 접근하지 않는다.
  // 게시 절차가 안 읽히면 인라인 앵커 검증·되읽기가 통째로 빠진다.
  const skill = read("plugin/skills/bb-pr-review/SKILL.md");
  for (const f of readdirSync("plugin/skills/bb-pr-review/reference")) {
    const around = skill.split("\n").filter((l) => l.includes(`reference/${f}`)).join(" ");
    const ctx = skill.slice(Math.max(0, skill.indexOf(`reference/${f}`) - 200),
                            skill.indexOf(`reference/${f}`) + 200);
    assert.ok(/읽는다|읽고/.test(ctx), `reference/${f} 를 '읽으라'는 지시가 없다: ${around.slice(0, 60)}`);
  }
});
