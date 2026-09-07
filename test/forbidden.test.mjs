import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// 사내 저장소 이름·실명·Jira 키가 공개 저장소로 새는 것을 막는다.
// 두 번 실제로 일어났고, 두 번째는 이전 커밋에 남아 있던 것이었다 —
// "한 번 정리했다" 가 유지되지 않는다. 새 예시를 쓸 때 손에 잡히는 데이터는
// 늘 실제 데이터이기 때문이다. 그래서 사람 기억이 아니라 테스트로 막는다.
//
// **원문이 아니라 SHA-256 만 둔다.** 금지 목록을 평문으로 적으면 이 파일이
// 곧 유출원이 되어, 검사를 추가하려다 검사 대상을 만드는 셈이 된다.
//
// 추가하려면 (셸 히스토리에만 남고 저장소에는 안 들어간다):
//   node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1].toLowerCase()).digest('hex'))" '<문자열>'
const FORBIDDEN = new Set([
  "0fa2d8f19bb7603db5017fa01898c18a1656630cb92fea7f6d9b5a8514bc3467",
  "15fa0f8e85e21344b548a8e8023f6fbea8be05eaa8101c18ee77af253234901d",
  "3f29443e887e501020600683bd776fa3962d3ea5c144628c76634004c0d72c2c",
  "539ad767d424210d1fc219e8508de0d682e555b403c7a6f35504a7d1a8a29c8c",
  "5cd0347bb12a81df6b77d891425b3cf698487c69673c7dd64c04077417723045",
  "63579e8ee39b799c9b207ec1f422368a4c6d0d4a35dbb915bfa4003ab55e8e8e",
  "94139dc186e2d8010fce9e96e2c421b53327f1c32dc63b41c42371740647e2a1",
  "9fdea0e286202d51b3c0394c9f76fe6fbc1809385c095d59a635849445d287b4",
  "b2560c726c9a2c51898fe8af88f9c8e73ab156471cb12ab78a70319598126d51",
  "b4cb07bb516f58cf24b097cc9d10e8bdbd06c2d0b3a34d295737c524b074efab",
  "bf8786db261bc90a4ea304342051c38c6e1440c00815adaa69fcd0917c3a48e4",
  "c5898d235a6e5c68b72acff7f538012d2f405986cbc38bcf1a6336819b44b5a5",
  "cbc505339ea88c67869c5f8cff7442c515c7a5cc07bd300e24e23ec04333ac93",
  "e9bab72600b9184d4d9bbf9d3f8d385fe2dbf336a1fe624826df883b476d4d0d",
  "fb4f3531893f2900e7cd5b8fc3a3952694db46195e7dd3ca598219eafc486132",
]);

const sha = (s) => createHash("sha256").update(s).digest("hex");

// 토큰 경계에서만 잡는다. 하이픈으로 이어진 것은 통째로도, 조각으로도 본다 —
// 통째로만 보면 `KEY-1234` 가 안 잡히고, 조각만 보면 `a-b-c` 형태가 안 잡힌다.
function candidates(token) {
  const t = token.toLowerCase();
  return t.includes("-") ? [t, ...t.split("-")] : [t];
}

test("추적 파일에 금지 문자열이 없다", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

  const hits = new Set();
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue; // 읽을 수 없으면(바이너리 등) 넘어간다
    }
    if (text.includes("\u0000")) continue;

    text.split("\n").forEach((line, i) => {
      for (const token of line.split(/[^A-Za-z0-9가-힣_-]+/)) {
        if (!token) continue;
        for (const c of candidates(token)) {
          // 3자 미만은 오탐이 많아 보지 않는다
          if (c.length >= 3 && FORBIDDEN.has(sha(c))) hits.add(`${f}:${i + 1}`);
        }
      }
    });
  }

  // 걸린 문자열 자체는 출력하지 않는다 — CI 로그가 또 하나의 유출 경로다.
  // 위치만 알려주고 사람이 그 줄을 열어 보게 한다.
  assert.deepEqual(
    [...hits].sort(),
    [],
    "위 위치에 금지 문자열이 있습니다. 플레이스홀더로 바꾸세요 " +
      "(저장소는 acme/*, 사람은 홍길동·김철수·이영희, 티켓은 PROJ-0000)",
  );
});

test("금지 목록이 비어 있지 않다", () => {
  // 목록이 실수로 비면 위 테스트가 언제나 통과해 조용히 무력해진다.
  assert.ok(FORBIDDEN.size >= 10, `금지 항목 ${FORBIDDEN.size}개 — 너무 적다`);
});
