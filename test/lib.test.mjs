import test from "node:test";
import assert from "node:assert/strict";
import { assertPathAllowed, pick, tokenizeCmd } from "../lib.mjs";

const ALLOW = ["acme/repo-a", "acme/repo-b"];
const denied = (path, allowed = ALLOW) => assert.throws(() => assertPathAllowed(path, allowed));
const passes = (path, allowed = ALLOW) => assert.doesNotThrow(() => assertPathAllowed(path, allowed));

test("allowlist가 비면 저장소 경로를 막지 않는다", () => {
  passes("/repositories/other/repo/pullrequests", []);
  passes("/workspaces/other", []);
});

test("허용 저장소 하위 경로는 통과한다", () => {
  passes("/repositories/acme/repo-a");
  passes("/repositories/acme/repo-a/pullrequests?state=OPEN");
  passes("/repositories/acme/repo-b/src/main/README.md");
  passes("/user");
});

test("허용되지 않은 저장소는 막힌다", () => {
  denied("/repositories/acme/repo-c/pullrequests");
  denied("/repositories/other/repo-a");
});

test("저장소 인벤토리를 노출하는 목록형 경로는 막힌다", () => {
  denied("/repositories");
  denied("/repositories/acme");
  denied("/workspaces/acme/permissions");
  denied("/user/permissions/repositories");
  denied("/pullrequests/someuser");
});

test("경로 조작은 막힌다", () => {
  denied("relative/path");
  denied("/repositories/acme/repo-a/../../other/repo");
  denied("//repositories/other/repo");
  // 인코딩된 구분자는 저장소 이름이 통째로 달라져 allowlist에서 걸린다
  denied("/repositories/acme/repo-a%2f..%2fother");
});

test("쿼리스트링의 .. 나 // 는 경로 판정에 영향을 주지 않는다", () => {
  passes("/repositories/acme/repo-a/commits?q=path~\"a//b\"");
  passes("/repositories/acme/repo-a/src?q=..");
});

test("pick은 JSON 응답에서 점 표기 필드를 뽑는다", () => {
  const res = {
    contentType: "application/json; charset=utf-8",
    text: JSON.stringify({
      values: [{ id: 1, title: "t", author: { display_name: "kim" }, extra: "x" }],
      next: "https://next",
    }),
  };
  assert.deepEqual(JSON.parse(pick(res, ["id", "author.display_name"])), {
    values: [{ id: 1, "author.display_name": "kim" }],
    next: "https://next",
  });
});

test("pick은 단일 객체도 처리한다", () => {
  const res = { contentType: "application/json", text: JSON.stringify({ id: 7, state: "OPEN" }) };
  assert.deepEqual(JSON.parse(pick(res, ["id"])), { id: 7 });
});

test("pick은 JSON이 아닌 응답의 원문을 그대로 돌려준다", () => {
  const diff = "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n";
  assert.equal(pick({ contentType: "text/plain", text: diff }, ["id"]), diff);
  // content-type이 json이라 해도 파싱에 실패하면 원문을 돌려준다
  assert.equal(pick({ contentType: "application/json", text: diff }, ["id"]), diff);
});

test("pick은 fields가 없으면 원문 그대로다", () => {
  assert.equal(pick({ contentType: "application/json", text: "{}" }), "{}");
});

test("tokenizeCmd는 따옴표로 묶인 인자를 보존한다", () => {
  assert.deepEqual(tokenizeCmd("security find-generic-password -s bb-api-token -w"), [
    "security", "find-generic-password", "-s", "bb-api-token", "-w",
  ]);
  assert.deepEqual(tokenizeCmd('op read "op://Private/My Item/token"'), [
    "op", "read", "op://Private/My Item/token",
  ]);
  assert.deepEqual(tokenizeCmd("security find-generic-password -a 'My User' -w"), [
    "security", "find-generic-password", "-a", "My User", "-w",
  ]);
});

// ── PR 워크플로 헬퍼 ──────────────────────────────────────────────────
import {
  buildCommentPayload,
  compactComment,
  compactDiffstat,
  compactPr,
  compactRepo,
  parseRepo,
  prId,
  truncateDiff,
} from "../lib.mjs";

test("parseRepo는 형식을 검증하고 allowlist를 대조한다", () => {
  assert.deepEqual(parseRepo("acme/repo-a", ALLOW), {
    workspace: "acme", slug: "repo-a", full: "acme/repo-a",
  });
  assert.deepEqual(parseRepo(" acme/repo-a ", ALLOW).full, "acme/repo-a");
  assert.throws(() => parseRepo("acme/repo-c", ALLOW), /허용되지 않은 저장소/);
  assert.throws(() => parseRepo("repo-a", ALLOW), /형식/);
  assert.throws(() => parseRepo("acme/repo-a/extra", ALLOW), /형식/);
  assert.throws(() => parseRepo("", ALLOW), /형식/);
  assert.throws(() => parseRepo(42, ALLOW), /문자열/);
  // allowlist가 비면 형식만 본다
  assert.equal(parseRepo("any/thing", []).full, "any/thing");
});

test("prId는 양의 정수만 통과시킨다", () => {
  assert.equal(prId(12), 12);
  assert.equal(prId("12"), 12);
  for (const bad of [0, -1, 1.5, "abc", null]) assert.throws(() => prId(bad));
});

test("compactPr은 승인자와 커밋 해시를 뽑는다", () => {
  const raw = {
    id: 7, title: "fix", state: "OPEN", description: "본문",
    author: { display_name: "kim" },
    source: { branch: { name: "feat/x" }, commit: { hash: "aaa111" } },
    destination: { branch: { name: "main" }, commit: { hash: "bbb222" } },
    reviewers: [{ display_name: "lee" }, { display_name: "park" }],
    participants: [
      { approved: true, user: { display_name: "lee" } },
      { approved: false, user: { display_name: "park" } },
    ],
    links: { html: { href: "https://bitbucket.org/pr/7" } },
    comment_count: 3, task_count: 0,
  };
  const c = compactPr(raw);
  assert.equal(c.id, 7);
  assert.equal(c.source, "feat/x");
  assert.equal(c.destination, "main");
  assert.equal(c.source_commit, "aaa111");
  assert.deepEqual(c.reviewers, ["lee", "park"]);
  assert.deepEqual(c.approved_by, ["lee"]);
  assert.equal(c.url, "https://bitbucket.org/pr/7");
});

test("compactPr은 필드가 없어도 죽지 않는다", () => {
  const c = compactPr({});
  assert.equal(c.id, null);
  assert.deepEqual(c.reviewers, []);
  assert.deepEqual(c.approved_by, []);
});

test("compactDiffstat은 rename에서 양쪽 경로를 남긴다", () => {
  assert.deepEqual(
    compactDiffstat({
      status: "renamed", lines_added: 2, lines_removed: 1,
      old: { path: "a/old.js" }, new: { path: "a/new.js" },
    }),
    { status: "renamed", path: "a/new.js", old_path: "a/old.js", lines_added: 2, lines_removed: 1 },
  );
  // 삭제된 파일은 new가 없다
  assert.equal(compactDiffstat({ status: "removed", old: { path: "gone.js" } }).path, "gone.js");
});

test("compactComment는 인라인 위치와 부모를 보존한다", () => {
  const c = compactComment({
    id: 99, content: { raw: "여기 널 체크" }, user: { display_name: "kim" },
    inline: { path: "src/a.js", from: null, to: 42 },
    parent: { id: 98 },
  });
  assert.deepEqual(c.inline, { path: "src/a.js", from: null, to: 42 });
  assert.equal(c.parent_id, 98);
  assert.equal(c.body, "여기 널 체크");
  // 일반 코멘트는 inline이 null
  assert.equal(compactComment({ id: 1, content: { raw: "x" } }).inline, null);
});

test("compactRepo는 리뷰에 필요한 필드만 남긴다", () => {
  assert.deepEqual(
    compactRepo({
      full_name: "acme/repo-a", name: "Repo A", is_private: true,
      mainbranch: { name: "main" }, updated_on: "2026-01-01T00:00:00Z",
      links: { html: { href: "https://bitbucket.org/acme/repo-a" } },
      scm: "git", size: 12345,
    }),
    {
      repo: "acme/repo-a", name: "Repo A", is_private: true, main_branch: "main",
      updated_on: "2026-01-01T00:00:00Z", url: "https://bitbucket.org/acme/repo-a",
    },
  );
});

test("buildCommentPayload: 일반 코멘트", () => {
  assert.deepEqual(buildCommentPayload({ body: "LGTM" }), { content: { raw: "LGTM" } });
});

test("buildCommentPayload: 인라인은 side에 따라 to/from을 쓴다", () => {
  assert.deepEqual(buildCommentPayload({ body: "b", path: "a.js", line: 10 }), {
    content: { raw: "b" }, inline: { path: "a.js", to: 10 },
  });
  assert.deepEqual(buildCommentPayload({ body: "b", path: "a.js", line: 10, side: "old" }), {
    content: { raw: "b" }, inline: { path: "a.js", from: 10 },
  });
});

test("buildCommentPayload: 답글", () => {
  assert.deepEqual(buildCommentPayload({ body: "답", parentId: 5 }), {
    content: { raw: "답" }, parent: { id: 5 },
  });
});

test("buildCommentPayload는 잘못된 조합을 거부한다", () => {
  assert.throws(() => buildCommentPayload({ body: "" }), /비어 있을 수 없습니다/);
  assert.throws(() => buildCommentPayload({ body: "   " }), /비어 있을 수 없습니다/);
  assert.throws(() => buildCommentPayload({ body: "b", line: 3 }), /path가 필요/);
  assert.throws(() => buildCommentPayload({ body: "b", path: "a.js" }), /line은 양의 정수/);
  assert.throws(() => buildCommentPayload({ body: "b", path: "a.js", line: 0 }), /line은 양의 정수/);
  assert.throws(() => buildCommentPayload({ body: "b", path: "a.js", line: 1, side: "x" }), /side/);
  assert.throws(
    () => buildCommentPayload({ body: "b", path: "a.js", line: 1, parentId: 5 }),
    /함께 쓸 수 없습니다/,
  );
});

test("truncateDiff는 줄 경계에서 자르고 안내를 붙인다", () => {
  const small = "line1\nline2\n";
  assert.deepEqual(truncateDiff(small, 1000), { text: small, truncated: false });

  const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  const r = truncateDiff(big, 100);
  assert.equal(r.truncated, true);
  assert.match(r.text, /잘렸음/);
  assert.match(r.text, /bb_pr_files/);
  // 잘린 본문은 줄 중간에서 끊기지 않는다
  const bodyPart = r.text.split("\n\n[...")[0];
  assert.ok(big.startsWith(bodyPart), "잘린 앞부분이 원문의 접두사여야 한다");
  assert.ok(bodyPart.split("\n").every((l) => /^line \d+$/.test(l)), "온전한 줄만 남아야 한다");
});

test("truncateDiff는 멀티바이트 경계에서 깨진 문자를 남기지 않는다", () => {
  const ko = Array.from({ length: 100 }, (_, i) => `한글 라인 ${i}`).join("\n");
  const r = truncateDiff(ko, 50);
  assert.equal(r.truncated, true);
  assert.ok(!r.text.includes("�"), "치환 문자가 남으면 안 된다");
});

// ── allowlist 파일 파서 ───────────────────────────────────────────────
import { parseAllowlistFile } from "../lib.mjs";

test("parseAllowlistFile은 주석·빈 줄·중복을 정리한다", () => {
  const src = `
# 리뷰 대상 저장소
acme/repo-a      # 웹

  acme/repo-b
acme/repo-a
`;
  assert.deepEqual(parseAllowlistFile(src), ["acme/repo-a", "acme/repo-b"]);
});

test("parseAllowlistFile은 CRLF와 빈 파일을 처리한다", () => {
  assert.deepEqual(parseAllowlistFile("acme/a\r\nacme/b\r\n"), ["acme/a", "acme/b"]);
  assert.deepEqual(parseAllowlistFile(""), []);
  assert.deepEqual(parseAllowlistFile("\n\n# 주석만\n"), []);
});

test("parseAllowlistFile은 형식이 틀린 줄을 줄 번호와 함께 거부한다", () => {
  assert.throws(() => parseAllowlistFile("acme/a\nrepo-b\n", "목록"), /목록 2번째 줄.*repo-b/);
  assert.throws(() => parseAllowlistFile("acme/a/b\n"), /1번째 줄/);
  assert.throws(() => parseAllowlistFile("acme repo\n"), /1번째 줄/);
});

// ── 토큰 위생 검사 ────────────────────────────────────────────────────
import { assertPlausibleToken } from "../lib.mjs";

test("assertPlausibleToken은 정상 토큰을 통과시킨다", () => {
  const real = "ATATT" + "x3FfGF0T".repeat(23); // 실제 토큰과 비슷한 길이/모양
  assert.equal(assertPlausibleToken(real), real);
  assert.equal(assertPlausibleToken("short-token"), "short-token");
  // 순수 hex여도 짧으면(우연히 hex 문자만) 건드리지 않는다
  assert.equal(assertPlausibleToken("abcdef123456"), "abcdef123456");
});

test("assertPlausibleToken은 hex 인코딩된 토큰을 잡아낸다", () => {
  const real = "ATATT" + "x3FfGF0T".repeat(23);
  const hex = Buffer.from(real + "\n", "utf8").toString("hex");
  assert.throws(() => assertPlausibleToken(hex), /hex로 인코딩돼 보입니다/);
  // 원인과 해결책을 메시지에 담는다
  assert.throws(() => assertPlausibleToken(hex), /개행/);
  assert.throws(() => assertPlausibleToken(hex), /128자에서 잘리므로/);
});

test("assertPlausibleToken은 빈 토큰을 거부한다", () => {
  assert.throws(() => assertPlausibleToken(""), /비어 있습니다/);
  assert.throws(() => assertPlausibleToken(undefined), /비어 있습니다/);
});

test("assertPlausibleToken은 hex처럼 보여도 디코딩이 쓰레기면 통과시킨다", () => {
  // 짝수 길이 hex지만 디코딩 결과가 출력 가능한 ASCII가 아니면 진짜 토큰일 수 있다
  const binaryish = Buffer.from(Array.from({ length: 40 }, (_, i) => i + 1)).toString("hex");
  assert.equal(assertPlausibleToken(binaryish), binaryish);
});

// ── 재시도 판정 ───────────────────────────────────────────────────────
import { shouldRetry, backoffMs, parseRetryAfter, numberLines } from "../lib.mjs";

test("shouldRetry: 429는 메서드와 무관하게 재시도한다", () => {
  for (const m of ["GET", "POST", "PUT", "DELETE"]) {
    assert.equal(shouldRetry({ status: 429, method: m }), true, m);
  }
});

test("shouldRetry: 5xx는 GET만 재시도한다 (쓰기 중복 방지)", () => {
  for (const st of [500, 502, 503, 504]) {
    assert.equal(shouldRetry({ status: st, method: "GET" }), true);
    assert.equal(shouldRetry({ status: st, method: "POST" }), false, `POST ${st}`);
    assert.equal(shouldRetry({ status: st, method: "DELETE" }), false);
  }
});

test("shouldRetry: 4xx(429 제외)는 재시도하지 않는다", () => {
  for (const st of [400, 401, 403, 404, 409, 422]) {
    assert.equal(shouldRetry({ status: st, method: "GET" }), false, String(st));
  }
});

test("shouldRetry: 네트워크 오류는 GET만 재시도한다", () => {
  assert.equal(shouldRetry({ method: "GET", networkError: true }), true);
  assert.equal(shouldRetry({ method: "POST", networkError: true }), false);
});

test("backoffMs: Retry-After가 있으면 그 값을 따른다", () => {
  assert.equal(backoffMs(0, 3), 3000);
  assert.equal(backoffMs(5, 0), 0);
  assert.equal(backoffMs(0, 9999), 30_000, "30초 상한");
});

test("backoffMs: Retry-After가 없으면 지수 백오프 + 지터", () => {
  assert.equal(backoffMs(0, null, () => 0), 500);
  assert.equal(backoffMs(1, null, () => 0), 1000);
  assert.equal(backoffMs(2, null, () => 0), 2000);
  assert.equal(backoffMs(0, null, () => 1), 750, "지터 최대 250ms");
  assert.equal(backoffMs(10, null, () => 0), 8000, "8초 상한");
});

test("parseRetryAfter: 초 단위와 HTTP-date 둘 다 처리한다", () => {
  assert.equal(parseRetryAfter("5"), 5);
  assert.equal(parseRetryAfter("0"), 0);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(""), null);
  assert.equal(parseRetryAfter("이상한값"), null);
  assert.equal(parseRetryAfter("-1"), null);
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now), 10);
  // 이미 지난 시각은 0으로 클램프
  assert.equal(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now + 5000), 0);
});

// ── 줄 번호 ───────────────────────────────────────────────────────────
test("numberLines: 전체에 번호를 붙이고 끝 개행을 세지 않는다", () => {
  const r = numberLines("a\nb\nc\n");
  assert.equal(r.totalLines, 3);
  assert.equal(r.from, 1);
  assert.equal(r.to, 3);
  assert.equal(r.text, "1 | a\n2 | b\n3 | c");
});

test("numberLines: 범위를 자르고 번호는 원래 줄 번호를 유지한다", () => {
  const src = Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n");
  const r = numberLines(src, { start: 9, end: 11 });
  assert.equal(r.text, " 9 | line9\n10 | line10\n11 | line11");
  assert.equal(r.totalLines, 12);
});

test("numberLines: end 생략 시 끝까지, 범위 초과는 파일 끝으로 클램프", () => {
  const src = "a\nb\nc";
  assert.equal(numberLines(src, { start: 2 }).text, "2 | b\n3 | c");
  assert.equal(numberLines(src, { start: 1, end: 99 }).to, 3);
});

test("numberLines: 잘못된 범위를 거부한다", () => {
  assert.throws(() => numberLines("a\nb", { start: 5 }), /파일 길이/);
  assert.throws(() => numberLines("a\nb", { start: 2, end: 1 }), /보다 작습니다/);
});

test("truncateDiff는 상황에 맞는 안내를 붙인다", async () => {
  const { TRUNCATE_HINT } = await import("../lib.mjs");
  const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");

  const asDiff = truncateDiff(big, 100);
  assert.match(asDiff.text, /bb_pr_diff 에 path/, "기본은 diff 안내");

  const asFile = truncateDiff(big, 100, TRUNCATE_HINT.file);
  assert.match(asFile.text, /bb_file 의 start·end/, "파일은 범위 안내");
  assert.ok(!asFile.text.includes("bb_pr_diff"), "diff 안내가 섞이면 안 된다");
});

// ── 경로 탈출 방어 (회귀) ─────────────────────────────────────────────
// 실제로 발견된 우회: 가드는 원본 문자열의 literal `..` 만 봤고,
// fetch의 WHATWG URL 파서가 `%2e%2e` 등을 `..` 로 접어 allowlist를 무력화했다.
import { resolveApiUrl, encodePathSegments, mapLimit, capItems } from "../lib.mjs";

const BASE = "https://api.bitbucket.org/2.0";
const ONLY = ["ws/allowed"];
const blocked = (path) =>
  assert.throws(() => resolveApiUrl(BASE, path, ONLY), undefined, `통과하면 안 됨: ${path}`);

test("resolveApiUrl: 정상 경로는 통과하고 URL을 돌려준다", () => {
  const u = resolveApiUrl(BASE, "/repositories/ws/allowed/pullrequests?state=OPEN", ONLY);
  assert.equal(u.pathname, "/2.0/repositories/ws/allowed/pullrequests");
  assert.equal(u.search, "?state=OPEN");
  assert.equal(resolveApiUrl(BASE, "/user", ONLY).pathname, "/2.0/user");
});

test("resolveApiUrl: 퍼센트 인코딩된 상위 이동을 막는다", () => {
  // URL 파서가 접는 모든 변형
  blocked("/repositories/ws/allowed/%2e%2e/%2e%2e/other/repo");
  blocked("/repositories/ws/allowed/%2E%2E/%2E%2E/other/repo");
  blocked("/repositories/ws/allowed/.%2e/.%2e/other/repo");
  blocked("/repositories/ws/allowed/%2e./%2e./other/repo");
  blocked("/repositories/ws/allowed/src/main/%2e%2e/%2e%2e/%2e%2e/%2e%2e/other/repo");
});

test("resolveApiUrl: 일부러 막은 인벤토리 경로에 우회로 닿지 못한다", () => {
  blocked("/repositories/ws/allowed/%2e%2e/%2e%2e/%2e%2e/user/permissions/repositories");
  blocked("/repositories/ws/allowed/%2e%2e/%2e%2e/%2e%2e/workspaces/ws");
  blocked("/repositories/ws/allowed/%2e%2e"); // /repositories/ws → 워크스페이스 목록
});

test("resolveApiUrl: literal .. 과 백슬래시도 막는다", () => {
  blocked("/repositories/ws/allowed/../../other/repo");
  blocked("/repositories/ws/allowed/..\\..\\other");
  blocked("/repositories/ws/allowed//other");
});

test("resolveApiUrl: API 베이스와 호스트를 벗어나면 막는다", () => {
  assert.throws(() => resolveApiUrl(BASE, "/../../evil", ONLY), /API 베이스/);
  assert.throws(() => resolveApiUrl(BASE, "/%2e%2e/%2e%2e/evil", ONLY), /API 베이스/);
  assert.throws(() => resolveApiUrl(BASE, "relative", ONLY), /\/로 시작/);
});

test("resolveApiUrl: allowlist가 없으면 베이스 안에서는 자유롭다", () => {
  assert.doesNotThrow(() => resolveApiUrl(BASE, "/repositories/anything/at/all", []));
  // 그래도 베이스 밖은 막는다
  assert.throws(() => resolveApiUrl(BASE, "/%2e%2e/%2e%2e/evil", []), /API 베이스/);
});

test("resolveApiUrl: 판정한 URL을 그대로 돌려준다 (재조립하지 않음)", () => {
  // 판정 대상과 전송 대상이 갈리면 우회가 생긴다. 같은 객체여야 한다.
  const u = resolveApiUrl(BASE, "/repositories/ws/allowed/src/main/a%20b.js", ONLY);
  assert.equal(u.pathname, "/2.0/repositories/ws/allowed/src/main/a%20b.js");
  assert.ok(u instanceof URL);
});

test("encodePathSegments: 구분자는 남기고 나머지를 인코딩한다", () => {
  assert.equal(encodePathSegments("src/a.js"), "src/a.js");
  assert.equal(encodePathSegments("/src/a.js"), "src/a.js", "앞 슬래시 제거");
  // Next.js 괄호 경로는 그대로 (실제 저장소에서 검증된 형태)
  assert.equal(
    encodePathSegments("apps/ceo/app/(auth)/(gnb)/layout.tsx"),
    "apps/ceo/app/(auth)/(gnb)/layout.tsx",
  );
  // 위험 문자는 리터럴로
  assert.equal(encodePathSegments("a.js?x=1"), "a.js%3Fx%3D1");
  assert.equal(encodePathSegments("a.js#f"), "a.js%23f");
  assert.equal(encodePathSegments("%2e%2e/x"), "%252e%252e/x");
  assert.equal(encodePathSegments("a b.js"), "a%20b.js");
});

// ── 동시성·크기 상한 ─────────────────────────────────────────────────
test("mapLimit: 동시 실행 수를 넘지 않는다", async () => {
  let running = 0, peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const out = await mapLimit(items, 3, async (n) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return n * 2;
  });
  assert.ok(peak <= 3, `동시 실행 최대 ${peak} (3 이하여야 함)`);
  assert.deepEqual(out, items.map((n) => n * 2), "순서가 보존돼야 한다");
});

test("mapLimit: 빈 배열과 limit 초과를 처리한다", async () => {
  assert.deepEqual(await mapLimit([], 5, async () => 1), []);
  assert.deepEqual(await mapLimit([1, 2], 99, async (n) => n), [1, 2]);
});

test("capItems: 바이트 예산을 넘으면 자르고 개수를 알려준다", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i, body: "가".repeat(50) }));
  const r = capItems(items, 1000);
  assert.ok(r.items.length < 50);
  assert.equal(r.items.length + r.dropped, 50);
  assert.deepEqual(capItems(items, 10_000_000), { items, dropped: 0 });
  assert.deepEqual(capItems([], 100), { items: [], dropped: 0 });
});

// ── 자기 진단 ─────────────────────────────────────────────────────────
import { tokenSummary, extractScopeInfo, tokenProblems, scopeProblems } from "../lib.mjs";

const REAL_SHAPE = "ATATT" + "x3FfGF0T".repeat(23) + "abc"; // 192자

test("tokenSummary는 토큰 값을 어떤 형태로도 담지 않는다", () => {
  const s = tokenSummary(REAL_SHAPE);
  const dump = JSON.stringify(s);
  assert.ok(!dump.includes(REAL_SHAPE), "전체 값이 들어가면 안 된다");
  // 접두사조차 담지 않는다 — boolean 으로만 판정한다
  assert.ok(!dump.includes("ATATT"), "접두사도 담지 않는다");
  assert.ok(!dump.includes(REAL_SHAPE.slice(0, 4)), "앞 4자도 담지 않는다");
  assert.deepEqual(Object.keys(s).sort(), [
    "length", "looks_atlassian", "looks_hex", "maybe_truncated", "present",
  ]);
});

test("tokenSummary는 형태를 정확히 판정한다", () => {
  assert.deepEqual(tokenSummary(""), { present: false });
  assert.deepEqual(tokenSummary(undefined), { present: false });

  const good = tokenSummary(REAL_SHAPE);
  assert.equal(good.length, 192);
  assert.equal(good.looks_hex, false);
  assert.equal(good.looks_atlassian, true);
  assert.equal(good.maybe_truncated, false);

  const hex = tokenSummary(Buffer.from(REAL_SHAPE + "\n", "utf8").toString("hex"));
  assert.equal(hex.looks_hex, true);
  assert.equal(hex.looks_atlassian, false);

  assert.equal(tokenSummary(REAL_SHAPE.slice(0, 128)).maybe_truncated, true);
});

test("tokenProblems는 원인별로 실행할 명령을 준다", () => {
  const bad = (t) => tokenProblems(tokenSummary(t)).filter((c) => !c.ok);

  const hex = bad(Buffer.from(REAL_SHAPE + "\n", "utf8").toString("hex"));
  assert.equal(hex.length, 1);
  assert.match(hex[0].detail, /hex/);
  assert.match(hex[0].fix, /add-generic-password -U/);

  const cut = bad(REAL_SHAPE.slice(0, 128));
  assert.match(cut[0].detail, /128자/);
  assert.match(cut[0].fix, /-w 뒤에 값을 직접/);

  assert.equal(bad(REAL_SHAPE).length, 0, "정상 토큰은 문제 없음");
  assert.match(tokenProblems({ present: false })[0].fix, /BITBUCKET_TOKEN_CMD/);
});

test("extractScopeInfo는 403 본문에서 granted/required를 뽑는다", () => {
  const body = JSON.stringify({
    type: "error",
    error: {
      message: "Your credentials lack one or more required privilege scopes.",
      detail: {
        required: ["read:user:bitbucket"],
        granted: ["read:repository:bitbucket", "read:pullrequest:bitbucket"],
      },
    },
  });
  const info = extractScopeInfo(body);
  assert.deepEqual(info.required, ["read:user:bitbucket"]);
  assert.equal(info.granted.length, 2);

  // 형태가 다르면 null 로 떨어진다 (예외를 던지지 않는다)
  assert.deepEqual(extractScopeInfo("not json"), { granted: null, required: null });
  assert.deepEqual(extractScopeInfo("{}"), { granted: null, required: null });
});

test("scopeProblems는 부족한 스코프와 못 쓰는 툴을 짝지어 준다", () => {
  const partial = scopeProblems([
    "read:repository:bitbucket",
    "read:pullrequest:bitbucket",
  ]);
  const missing = partial.filter((c) => !c.ok);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].label, "write:pullrequest:bitbucket");
  assert.match(missing[0].detail, /bb_comment/);

  const all = scopeProblems(Object.keys(
    // 세 스코프 전부
    { "read:repository:bitbucket": 1, "read:pullrequest:bitbucket": 1, "write:pullrequest:bitbucket": 1 },
  ));
  assert.equal(all.filter((c) => !c.ok).length, 0);

  assert.deepEqual(scopeProblems(null), [], "목록을 못 얻으면 판정하지 않는다");
});

// ── 진단 출력 위생 ────────────────────────────────────────────────────
import { maskEmail, sanitizeUrlForDisplay } from "../lib.mjs";

test("maskEmail은 로컬 파트를 가리고 도메인은 남긴다", () => {
  assert.equal(maskEmail("someone@company.co.kr"), "s******@company.co.kr");
  assert.equal(maskEmail("ab@x.com"), "a*@x.com".replace("a*", "a**"));
  assert.equal(maskEmail("a@x.com"), "a**@x.com", "한 글자도 길이를 추정할 수 없게");
  assert.equal(maskEmail("no-at-sign"), "(형식 아님)");
  assert.equal(maskEmail(""), "(형식 아님)");
  assert.equal(maskEmail(undefined), "(형식 아님)");
});

test("maskEmail은 로컬 파트 원문을 남기지 않는다", () => {
  const email = "verylongname@company.com";
  const masked = maskEmail(email);
  assert.ok(!masked.includes("verylongname"));
  assert.ok(!masked.includes("erylongname"));
  assert.ok(masked.endsWith("@company.com"), "도메인은 오설정 판별에 필요하다");
});

test("sanitizeUrlForDisplay는 URL에 박힌 자격증명을 제거한다", () => {
  assert.equal(
    sanitizeUrlForDisplay("https://api.bitbucket.org/2.0"),
    "https://api.bitbucket.org/2.0",
  );
  const withCreds = sanitizeUrlForDisplay("https://user:s3cret@evil.example/2.0");
  assert.ok(!withCreds.includes("s3cret"), "비밀번호가 남으면 안 된다");
  assert.ok(!withCreds.includes("user"), "사용자명도 남기지 않는다");
  assert.match(withCreds, /자격증명 제거됨/);
  assert.equal(sanitizeUrlForDisplay("not a url"), "(URL로 해석 불가)");
});
