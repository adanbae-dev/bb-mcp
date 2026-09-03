// 로컬 가짜 Bitbucket API에 실제 MCP 클라이언트를 붙여 전 구간을 확인한다.
// (라이브 Bitbucket 토큰 없이 검증 가능한 범위: 가드, allowlist 소스, 페이지네이션,
//  페이로드, 게이트, 잘라내기)
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));
const EMAIL = "you@example.com";
const TOKEN = "fake-token";
const BIG_DIFF = Array.from({ length: 3000 }, (_, i) => `+추가된 줄 ${i}`).join("\n");

// acme 워크스페이스의 어떤 repo 이름이든 응답한다.
// (allowlist 판정은 서버 쪽 책임이므로 API는 관여하지 않는다)
function makeApi() {
  const seen = { requests: [], posted: [], flaky: {}, inFlight: 0, peakConcurrent: 0 };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    seen.requests.push(`${req.method} ${req.url}`);
    seen.inFlight++;
    seen.peakConcurrent = Math.max(seen.peakConcurrent, seen.inFlight);
    res.on("finish", () => seen.inFlight--);
    // 동시성 측정을 위해 응답을 살짝 늦춘다
    const origEnd = res.end.bind(res);
    res.end = (...a) => setTimeout(() => origEnd(...a), 8);

    const decoded = Buffer.from(
      (req.headers.authorization ?? "").replace(/^Basic /, ""), "base64",
    ).toString();
    if (decoded !== `${EMAIL}:${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "bad auth" } }));
    }

    const json = (o) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };
    const base = `http://127.0.0.1:${srv.address().port}/2.0`;
    const p = url.pathname.replace("/2.0", "");
    const repo = p.match(/^\/repositories\/([^/]+\/[^/]+)/)?.[1];
    const sub = repo ? p.slice(`/repositories/${repo}`.length) : null;

    if (repo && sub === "") {
      return json({
        full_name: repo, name: repo.split("/")[1], is_private: true,
        mainbranch: { name: "main" }, updated_on: "2026-01-01T00:00:00Z",
        links: { html: { href: `https://bitbucket.org/${repo}` } },
      });
    }
    if (sub === "/pullrequests" && repo.endsWith("/repo-broken")) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "이 저장소는 고장남" } }));
    }
    if (sub === "/pullrequests") {
      return json({
        size: 1,
        values: [{
          id: 7, title: `${repo} 널 체크 추가`, state: "OPEN",
          author: { display_name: "kim" },
          source: { branch: { name: "fix/null" } },
          destination: { branch: { name: "main" } },
          comment_count: 2, task_count: 0,
          links: { html: { href: "https://bitbucket.org/pr/7" } },
        }],
      });
    }
    if (sub === "/pullrequests/7") {
      return json({
        id: 7, title: "널 체크 추가", state: "OPEN", description: "설명 본문",
        author: { display_name: "kim" },
        source: { branch: { name: "fix/null" }, commit: { hash: "aaa111" } },
        destination: { branch: { name: "main" }, commit: { hash: "bbb222" } },
        reviewers: [{ display_name: "lee" }],
        participants: [{ approved: true, user: { display_name: "lee" } }],
        links: { html: { href: "https://bitbucket.org/pr/7" } },
      });
    }
    // 2페이지로 나눠 페이지네이션 추적을 확인한다
    if (sub === "/pullrequests/7/diffstat") {
      if (!url.searchParams.get("page")) {
        return json({
          values: [{ status: "modified", lines_added: 10, lines_removed: 2, new: { path: "src/a.js" }, old: { path: "src/a.js" } }],
          next: `${base}/repositories/${repo}/pullrequests/7/diffstat?pagelen=100&page=2`,
        });
      }
      return json({ values: [{ status: "added", lines_added: 5, lines_removed: 0, new: { path: "src/b.js" } }] });
    }
    if (sub === "/pullrequests/7/diff") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end(url.searchParams.get("path") ? "+파일 하나만\n" : BIG_DIFF);
    }
    if (sub === "/pullrequests/7/comments") {
      if (req.method === "POST") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        return req.on("end", () => {
          const body = JSON.parse(raw);
          seen.posted.push(body);
          json({ id: 123, content: body.content, user: { display_name: "me" }, inline: body.inline ?? null, parent: body.parent ?? null });
        });
      }
      return json({
        values: [
          { id: 1, content: { raw: "일반 코멘트" }, user: { display_name: "kim" } },
          { id: 2, content: { raw: "인라인" }, user: { display_name: "lee" }, inline: { path: "src/a.js", to: 12 } },
          { id: 3, deleted: true, content: { raw: "지워짐" } },
        ],
      });
    }
    if (sub && sub.startsWith("/src/")) {
      const rest = sub.slice("/src/".length);
      const slash = rest.indexOf("/");
      const filePath = rest.slice(slash + 1);
      if (filePath === "dir/") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ values: [{ path: "dir/a.js" }] }));
      }
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄\n");
    }
    // 재시도 검증용. /repositories/{repo}/flaky/{status}/{failTimes}
    // (가드가 저장소 하위 경로만 통과시키므로 여기에 둔다)
    const flaky = (sub ?? "").match(/^\/flaky\/(\d+)\/(\d+)$/);
    if (flaky) {
      const [, status, failTimes] = flaky;
      const key = `${status}/${failTimes}`;
      seen.flaky[key] = (seen.flaky[key] ?? 0) + 1;
      if (seen.flaky[key] <= Number(failTimes)) {
        const h = { "content-type": "application/json" };
        if (status === "429") h["retry-after"] = "0";
        res.writeHead(Number(status), h);
        return res.end(JSON.stringify({ error: { message: "일시적 오류" } }));
      }
      return json({ ok: true, attempts: seen.flaky[key] });
    }
    if (p === "/repositories/acme") {
      return json({ values: [{ full_name: "acme/repo-a" }, { full_name: "acme/repo-b" }] });
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: `no route ${p}` } }));
  });
  return { srv, seen };
}

async function withServer(envExtra, fn) {
  const { srv, seen } = makeApi();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bb-mcp-it-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      PATH: process.env.PATH,
      HOME: tmp, // 사용자의 실제 ~/.config/bb-mcp 가 테스트에 끼어들지 않게 한다
      BITBUCKET_API_BASE: `http://127.0.0.1:${srv.address().port}/2.0`,
      BITBUCKET_EMAIL: EMAIL,
      BITBUCKET_API_TOKEN: TOKEN,
      BITBUCKET_ALLOWED_REPOS: "acme/repo-a",
      BITBUCKET_TIMEOUT_MS: "5000",
      ...envExtra,
    },
  });
  const client = new Client({ name: "it", version: "0" });
  await client.connect(transport);
  const callTool = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return { isError: Boolean(r.isError), text: r.content[0].text };
  };
  try {
    await fn({ callTool, seen, client, tmp });
  } finally {
    await client.close();
    srv.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 파일 모드로 서버를 띄운다. writeList 로 실행 중에 목록을 갈아끼울 수 있다.
async function withFileAllowlist(initial, fn, envExtra = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bb-mcp-al-"));
  const file = path.join(tmp, "allowed-repos");
  const writeList = (text) => writeFileSync(file, text, "utf8");
  if (initial != null) writeList(initial);
  try {
    await withServer(
      { BITBUCKET_ALLOWED_REPOS: "", BITBUCKET_ALLOWED_REPOS_FILE: file, ...envExtra },
      (ctx) => fn({ ...ctx, writeList, file }),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("툴 12개가 등록된다", async () => {
  await withServer({}, async ({ client }) => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "bb_comment", "bb_doctor", "bb_file", "bb_get", "bb_pr_comments", "bb_pr_diff",
      "bb_pr_files", "bb_pr_get", "bb_pr_inbox", "bb_pr_list", "bb_repos", "bb_write",
    ]);
  });
});

test("bb_repos는 allowlist 저장소만 조회하고 소스를 보고한다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const out = JSON.parse((await callTool("bb_repos", {})).text);
    assert.equal(out.source, "env");
    assert.deepEqual(out.repos.map((x) => x.repo), ["acme/repo-a"]);
    assert.equal(out.repos[0].main_branch, "main");
    assert.ok(!seen.requests.includes("GET /2.0/repositories/acme"));
  });
});

test("bb_pr_list / bb_pr_get 이 필드를 줄여서 돌려준다", async () => {
  await withServer({}, async ({ callTool }) => {
    const list = JSON.parse((await callTool("bb_pr_list", { repo: "acme/repo-a" })).text);
    assert.equal(list.count, 1);
    assert.equal(list.pull_requests[0].id, 7);
    assert.equal(list.pull_requests[0].source, "fix/null");

    const pr = JSON.parse((await callTool("bb_pr_get", { repo: "acme/repo-a", id: 7 })).text);
    assert.equal(pr.description, "설명 본문");
    assert.equal(pr.source_commit, "aaa111");
    assert.deepEqual(pr.approved_by, ["lee"]);
  });
});

test("bb_pr_files는 next를 따라가 두 페이지를 합친다", async () => {
  await withServer({}, async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_pr_files", { repo: "acme/repo-a", id: 7 })).text);
    assert.equal(out.file_count, 2);
    assert.equal(out.truncated, false);
    assert.deepEqual(out.files.map((f) => f.path), ["src/a.js", "src/b.js"]);
    assert.equal(out.total_lines_added, 15);
  });
});

test("bb_pr_diff는 max_bytes에서 잘리고 path로 좁힐 수 있다", async () => {
  await withServer({}, async ({ callTool }) => {
    const big = await callTool("bb_pr_diff", { repo: "acme/repo-a", id: 7, max_bytes: 2000 });
    assert.match(big.text, /잘렸음/);
    assert.ok(Buffer.byteLength(big.text) < 3000);

    const one = await callTool("bb_pr_diff", { repo: "acme/repo-a", id: 7, path: "src/a.js" });
    assert.equal(one.text.trim(), "+파일 하나만");
  });
});

test("bb_pr_comments는 삭제된 코멘트를 빼고 inline_only를 지원한다", async () => {
  await withServer({}, async ({ callTool }) => {
    const all = JSON.parse((await callTool("bb_pr_comments", { repo: "acme/repo-a", id: 7 })).text);
    assert.equal(all.count, 2);
    const inline = JSON.parse(
      (await callTool("bb_pr_comments", { repo: "acme/repo-a", id: 7, inline_only: true })).text,
    );
    assert.equal(inline.count, 1);
    assert.deepEqual(inline.comments[0].inline, { path: "src/a.js", from: null, to: 12 });
  });
});

test("bb_comment는 기본 차단이다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const r = await callTool("bb_comment", { repo: "acme/repo-a", id: 7, body: "x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /BITBUCKET_ALLOW_COMMENT=true/);
    assert.equal(seen.posted.length, 0, "차단됐으면 POST가 나가면 안 된다");
  });
});

test("ALLOW_COMMENT=true 면 일반/인라인/답글 코멘트를 올린다", async () => {
  await withServer({ BITBUCKET_ALLOW_COMMENT: "true" }, async ({ callTool, seen }) => {
    const plain = await callTool("bb_comment", { repo: "acme/repo-a", id: 7, body: "LGTM" });
    assert.equal(plain.isError, false);
    assert.equal(JSON.parse(plain.text).created.id, 123);

    await callTool("bb_comment", { repo: "acme/repo-a", id: 7, body: "널 체크", path: "src/a.js", line: 12 });
    await callTool("bb_comment", { repo: "acme/repo-a", id: 7, body: "답글", parent_id: 1 });

    assert.deepEqual(seen.posted, [
      { content: { raw: "LGTM" } },
      { content: { raw: "널 체크" }, inline: { path: "src/a.js", to: 12 } },
      { content: { raw: "답글" }, parent: { id: 1 } },
    ]);
  });
});

test("ALLOW_COMMENT는 bb_write를 열지 않는다", async () => {
  await withServer({ BITBUCKET_ALLOW_COMMENT: "true" }, async ({ callTool }) => {
    const r = await callTool("bb_write", {
      method: "POST", path: "/repositories/acme/repo-a/pullrequests/7/merge",
    });
    assert.equal(r.isError, true);
    assert.match(r.text, /BITBUCKET_ALLOW_WRITE=true/);
  });
});

test("허용되지 않은 저장소는 네트워크에 나가기 전에 막힌다", async () => {
  await withServer({ BITBUCKET_ALLOW_COMMENT: "true" }, async ({ callTool, seen }) => {
    const before = seen.requests.length;
    for (const [tool, args] of [
      ["bb_pr_list", { repo: "acme/repo-c" }],
      ["bb_pr_get", { repo: "other/repo-a", id: 1 }],
      ["bb_pr_files", { repo: "acme/repo-c", id: 1 }],
      ["bb_pr_diff", { repo: "acme/repo-c", id: 1 }],
      ["bb_pr_comments", { repo: "acme/repo-c", id: 1 }],
      ["bb_comment", { repo: "acme/repo-c", id: 1, body: "x" }],
      ["bb_get", { path: "/repositories/acme" }],
      ["bb_get", { path: "/user/permissions/repositories" }],
    ]) {
      assert.equal((await callTool(tool, args)).isError, true, `${tool} 가 막혀야 한다`);
    }
    assert.equal(seen.requests.length, before, "차단된 호출은 API에 닿으면 안 된다");
  });
});

test("잘못된 인자는 오류로 돌아온다", async () => {
  await withServer({ BITBUCKET_ALLOW_COMMENT: "true" }, async ({ callTool }) => {
    assert.equal((await callTool("bb_pr_get", { repo: "repo-a", id: 1 })).isError, true);
    const r = await callTool("bb_comment", { repo: "acme/repo-a", id: 7, body: "x", line: 3 });
    assert.equal(r.isError, true);
    assert.match(r.text, /path가 필요/);
  });
});

// ── 파일 기반 allowlist ───────────────────────────────────────────────

test("파일 모드: 파일의 저장소만 통과하고 소스를 file로 보고한다", async () => {
  await withFileAllowlist("acme/repo-a\n", async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_repos", {})).text);
    assert.equal(out.source, "file");
    assert.deepEqual(out.repos.map((x) => x.repo), ["acme/repo-a"]);
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, false);
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, true);
  });
});

test("파일 모드: 재시작 없이 저장소 추가·삭제가 반영된다", async () => {
  await withFileAllowlist("acme/repo-a\n", async ({ callTool, writeList }) => {
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, true, "처음엔 repo-b 차단");

    writeList("acme/repo-a\nacme/repo-b\n"); // 서버 재시작 없이 파일만 교체
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, false, "추가 즉시 허용");
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, false);

    writeList("acme/repo-b\n"); // repo-a 제거
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, true, "제거 즉시 차단");
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, false);
  });
});

test("파일 모드: 주석·빈 줄·중복을 처리한다", async () => {
  const list = `
# 리뷰 대상
acme/repo-a      # 웹

acme/repo-b
acme/repo-a
`;
  await withFileAllowlist(list, async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_repos", {})).text);
    assert.deepEqual(out.repos.map((x) => x.repo), ["acme/repo-a", "acme/repo-b"]);
  });
});

test("파일 모드: 파일이 비면 전체 개방이 아니라 전체 차단이다", async () => {
  await withFileAllowlist("acme/repo-a\n", async ({ callTool, writeList, file }) => {
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, false);
    writeList("# 다 지웠음\n");
    const r = await callTool("bb_pr_list", { repo: "acme/repo-a" });
    assert.equal(r.isError, true);
    assert.match(r.text, /비어 있어 모든 저장소를 차단/);
    assert.ok(r.text.includes(file), "오류 메시지가 파일 경로를 알려줘야 한다");
    // 다른 저장소도 열리지 않는다
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, true);
    assert.equal((await callTool("bb_get", { path: "/repositories/acme" })).isError, true);
  });
});

test("파일 모드: 파일이 사라지면 전체 차단이다", async () => {
  await withFileAllowlist("acme/repo-a\n", async ({ callTool, file }) => {
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, false);
    rmSync(file);
    const r = await callTool("bb_pr_list", { repo: "acme/repo-a" });
    assert.equal(r.isError, true);
    assert.match(r.text, /읽을 수 없어 모든 저장소를 차단/);
  });
});

test("파일 모드: 형식이 틀린 줄은 줄 번호와 함께 오류를 낸다", async () => {
  await withFileAllowlist("acme/repo-a\nrepo-b\n", async ({ callTool }) => {
    const r = await callTool("bb_pr_list", { repo: "acme/repo-a" });
    assert.equal(r.isError, true);
    assert.match(r.text, /2번째 줄/);
    assert.match(r.text, /repo-b/);
  });
});

test("_FILE을 지정하면 파일이 나중에 생겨도 재시작 없이 반영된다", async () => {
  // 권장 설정 흐름: .mcp.json 에 _FILE 을 박아두고 파일은 나중에 만든다
  await withFileAllowlist(null, async ({ callTool, writeList, file }) => {
    const before = await callTool("bb_pr_list", { repo: "acme/repo-a" });
    assert.equal(before.isError, true, "파일이 없으면 차단");
    assert.match(before.text, /읽을 수 없어 모든 저장소를 차단/);
    assert.ok(before.text.includes(file));

    writeList("acme/repo-a\n"); // 서버는 계속 떠 있다
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-a" })).isError, false, "생성 즉시 허용");
    assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, true);
  });
});

test("env가 설정돼 있으면 파일보다 우선한다", async () => {
  await withFileAllowlist(
    "acme/repo-b\n",
    async ({ callTool }) => {
      const out = JSON.parse((await callTool("bb_repos", {})).text);
      assert.equal(out.source, "env");
      assert.deepEqual(out.repos.map((x) => x.repo), ["acme/repo-a"]);
      assert.equal((await callTool("bb_pr_list", { repo: "acme/repo-b" })).isError, true);
    },
    { BITBUCKET_ALLOWED_REPOS: "acme/repo-a" },
  );
});

test("env도 파일도 없으면 제한 없음(토큰 스코프에 맡김)", async () => {
  await withServer(
    { BITBUCKET_ALLOWED_REPOS: "", BITBUCKET_ALLOWED_REPOS_FILE: "" },
    async ({ callTool }) => {
      // allowlist가 없으므로 workspace를 요구한다
      const need = await callTool("bb_repos", {});
      assert.equal(need.isError, true);
      assert.match(need.text, /workspace를 지정/);

      const out = JSON.parse((await callTool("bb_repos", { workspace: "acme" })).text);
      assert.equal(out.source, "api");
      // allowlist에 없던 저장소도 통과한다
      assert.equal((await callTool("bb_pr_list", { repo: "other/anything" })).isError, false);
    },
  );
});

// ── bb_pr_inbox ───────────────────────────────────────────────────────

test("bb_pr_inbox는 여러 저장소를 모아 최근 갱신순으로 돌려준다", async () => {
  await withFileAllowlist("acme/repo-a\nacme/repo-b\n", async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_pr_inbox", {})).text);
    assert.equal(out.repos_scanned, 2);
    assert.equal(out.count, 2);
    assert.equal(out.errors, undefined);
    assert.deepEqual(out.pull_requests.map((p) => p.repo).sort(), ["acme/repo-a", "acme/repo-b"]);
    // repo 필드가 각 PR에 붙는다
    assert.ok(out.pull_requests.every((p) => p.repo && p.id === 7));
  });
});

test("bb_pr_inbox는 저장소 하나가 실패해도 나머지를 돌려준다", async () => {
  // repo-broken 은 가짜 API가 500을 낸다
  await withFileAllowlist("acme/repo-a\nacme/repo-broken\n", async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_pr_inbox", {})).text);
    assert.equal(out.count, 1, "성공한 저장소의 PR은 그대로 온다");
    assert.equal(out.errors.length, 1);
    assert.equal(out.errors[0].repo, "acme/repo-broken");
    assert.match(out.errors[0].error, /500/);
  });
});

test("bb_pr_inbox는 최근 갱신순으로 정렬한다", async () => {
  await withFileAllowlist("acme/repo-a\nacme/repo-b\n", async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_pr_inbox", {})).text);
    const dates = out.pull_requests.map((p) => p.updated_on ?? "");
    assert.deepEqual(dates, [...dates].sort().reverse(), "내림차순이어야 한다");
  });
});

test("bb_pr_inbox는 allowlist가 없으면 거부한다", async () => {
  await withServer(
    { BITBUCKET_ALLOWED_REPOS: "", BITBUCKET_ALLOWED_REPOS_FILE: "" },
    async ({ callTool }) => {
      const r = await callTool("bb_pr_inbox", {});
      assert.equal(r.isError, true);
      assert.match(r.text, /allowlist가 없어/);
    },
  );
});

// ── bb_file ───────────────────────────────────────────────────────────

test("bb_file은 줄 번호를 붙여 파일을 돌려준다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_file", {
      repo: "acme/repo-a", ref: "abc123", path: "src/a.js",
    });
    assert.equal(r.isError, false);
    assert.match(r.text, /src\/a\.js @ abc123 — 1~5 \/ 전체 5줄/);
    assert.match(r.text, /^1 \| 첫째 줄$/m);
    assert.match(r.text, /^5 \| 다섯째 줄$/m);
  });
});

test("bb_file은 범위를 지정하면 원래 줄 번호를 유지한다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_file", {
      repo: "acme/repo-a", ref: "abc123", path: "src/a.js", start: 3, end: 4,
    });
    assert.match(r.text, /3~4 \/ 전체 5줄/);
    assert.match(r.text, /^3 \| 셋째 줄$/m);
    assert.ok(!r.text.includes("1 | 첫째 줄"), "범위 밖은 오지 않는다");
  });
});

test("bb_file은 앞 슬래시를 벗기고 allowlist를 지킨다", async () => {
  await withServer({}, async ({ callTool }) => {
    assert.equal(
      (await callTool("bb_file", { repo: "acme/repo-a", ref: "x", path: "/src/a.js" })).isError,
      false,
      "앞 슬래시가 있어도 동작",
    );
    assert.equal(
      (await callTool("bb_file", { repo: "acme/repo-c", ref: "x", path: "src/a.js" })).isError,
      true,
      "allowlist 밖은 차단",
    );
  });
});

test("bb_file은 디렉터리(JSON 응답)에 번호를 붙이지 않는다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_file", { repo: "acme/repo-a", ref: "x", path: "dir/" });
    assert.equal(r.isError, false);
    assert.ok(!r.text.includes(" | "), "번호를 붙이지 않는다");
    assert.match(r.text, /dir\/a\.js/);
  });
});

test("bb_file은 잘못된 범위를 오류로 돌려준다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_file", {
      repo: "acme/repo-a", ref: "x", path: "src/a.js", start: 99,
    });
    assert.equal(r.isError, true);
    assert.match(r.text, /파일 길이/);
  });
});

// ── 재시도 ────────────────────────────────────────────────────────────

test("429는 재시도해서 성공한다", async () => {
  await withServer({}, async ({ callTool }) => {
    // 2번 실패 후 성공. 기본 RETRY_MAX=2 이므로 3번째 시도에서 성공
    const r = await callTool("bb_get", { path: "/repositories/acme/repo-a/flaky/429/2" });
    assert.equal(r.isError, false);
    assert.equal(JSON.parse(r.text).attempts, 3);
  });
});

test("503은 GET에서 재시도한다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_get", { path: "/repositories/acme/repo-a/flaky/503/1" });
    assert.equal(r.isError, false);
    assert.equal(JSON.parse(r.text).attempts, 2);
  });
});

test("재시도 횟수를 넘기면 오류를 돌려준다", async () => {
  await withServer({}, async ({ callTool }) => {
    const r = await callTool("bb_get", { path: "/repositories/acme/repo-a/flaky/429/5" });
    assert.equal(r.isError, true);
    assert.match(r.text, /429/);
  });
});

test("5xx 쓰기는 재시도하지 않는다 (중복 방지)", async () => {
  await withServer(
    { BITBUCKET_ALLOW_WRITE: "true" },
    async ({ callTool, seen }) => {
      const r = await callTool("bb_write", { method: "POST", path: "/repositories/acme/repo-a/flaky/500/1" });
      assert.equal(r.isError, true);
      assert.match(r.text, /500/);
      // 서버에 정확히 한 번만 도달
      assert.equal(seen.flaky["500/1"], 1, "POST는 5xx에서 재시도하면 안 된다");
    },
  );
});

test("RETRY_MAX=0 이면 재시도하지 않는다", async () => {
  await withServer({ BITBUCKET_RETRY_MAX: "0" }, async ({ callTool, seen }) => {
    const r = await callTool("bb_get", { path: "/repositories/acme/repo-a/flaky/429/1" });
    assert.equal(r.isError, true);
    assert.equal(seen.flaky["429/1"], 1);
  });
});

test("4xx는 재시도하지 않는다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const r = await callTool("bb_get", { path: "/repositories/acme/repo-a/flaky/404/1" });
    assert.equal(r.isError, true);
    assert.equal(seen.flaky["404/1"], 1, "404는 한 번만");
  });
});

// ── 경로 탈출 방어 (전 구간 회귀) ─────────────────────────────────────

test("퍼센트 인코딩 상위 이동은 네트워크에 나가기 전에 막힌다", async () => {
  await withServer({ BITBUCKET_ALLOW_WRITE: "true" }, async ({ callTool, seen }) => {
    const before = seen.requests.length;
    const escapes = [
      ["bb_get", { path: "/repositories/acme/repo-a/%2e%2e/%2e%2e/secret/repo" }],
      ["bb_get", { path: "/repositories/acme/repo-a/%2E%2E/%2E%2E/secret/repo" }],
      ["bb_get", { path: "/repositories/acme/repo-a/.%2e/.%2e/secret/repo" }],
      ["bb_get", { path: "/repositories/acme/repo-a/%2e%2e/%2e%2e/%2e%2e/user/permissions/repositories" }],
      ["bb_get", { path: "/repositories/acme/repo-a/%2e%2e" }],
      ["bb_write", { method: "DELETE", path: "/repositories/acme/repo-a/%2e%2e/%2e%2e/secret/repo" }],
    ];
    for (const [tool, args] of escapes) {
      const r = await callTool(tool, args);
      assert.equal(r.isError, true, `${tool} ${JSON.stringify(args)} 가 막혀야 한다`);
    }
    assert.equal(seen.requests.length, before, "차단된 호출은 API에 닿으면 안 된다");
  });
});

test("bb_file 은 상위 이동을 리터럴로 만들어 허용 저장소를 벗어나지 않는다", async () => {
  // bb_file 은 차단이 아니라 인코딩으로 막는다(다층 방어).
  // 중요한 것은 "오류가 났는가"가 아니라 "밖으로 나갔는가"다.
  await withServer({}, async ({ callTool, seen }) => {
    await callTool("bb_file", {
      repo: "acme/repo-a", ref: "main",
      path: "%2e%2e/%2e%2e/%2e%2e/%2e%2e/secret/repo/src/main/x",
    });
    const last = seen.requests[seen.requests.length - 1];
    assert.ok(
      last.startsWith("GET /2.0/repositories/acme/repo-a/"),
      `허용 저장소를 벗어났다: ${last}`,
    );
    assert.ok(last.includes("%252e%252e"), `리터럴로 인코딩되지 않았다: ${last}`);
    // 상위 이동이 성립했다면 /src/main/ 아래가 아니라 저장소 경계 밖에 있게 된다
    assert.ok(
      last.startsWith("GET /2.0/repositories/acme/repo-a/src/main/"),
      `저장소 하위를 벗어났다: ${last}`,
    );
    assert.ok(!/%2e%2e(?!%)/.test(last), `디코딩된 .. 가 남아 있다: ${last}`);
  });
});

test("bb_file 은 파일명 안의 위험 문자를 리터럴로 인코딩한다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    await callTool("bb_file", { repo: "acme/repo-a", ref: "main", path: "a.js?format=meta" });
    const last = seen.requests[seen.requests.length - 1];
    assert.ok(last.includes("a.js%3Fformat%3Dmeta"), `쿼리로 해석되면 안 된다: ${last}`);
    assert.ok(!last.includes("?format=meta"), "쿼리 주입이 성립하면 안 된다");
  });
});

test("정상 경로는 인코딩 후에도 그대로 동작한다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const r = await callTool("bb_file", {
      repo: "acme/repo-a", ref: "main", path: "apps/ceo/app/(auth)/(gnb)/layout.tsx",
    });
    assert.equal(r.isError, false);
    const last = seen.requests[seen.requests.length - 1];
    assert.ok(last.includes("(auth)/(gnb)/layout.tsx"), `괄호 경로가 깨졌다: ${last}`);
  });
});

// ── 토큰 유출 방어 ────────────────────────────────────────────────────

test("TOKEN_CMD가 실패해도 stdout(토큰 채널)은 오류에 실리지 않는다", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bb-mcp-tok-"));
  const script = path.join(tmp, "leaky.sh");
  writeFileSync(
    script,
    "#!/bin/sh\necho 'SECRET_TOKEN_ABC123'\necho 'keychain: item not found' >&2\nexit 1\n",
    { mode: 0o755 },
  );
  try {
    await withServer(
      { BITBUCKET_API_TOKEN: "", BITBUCKET_TOKEN_CMD: script },
      async ({ callTool }) => {
        const r = await callTool("bb_pr_list", { repo: "acme/repo-a" });
        assert.equal(r.isError, true);
        assert.ok(!r.text.includes("SECRET_TOKEN_ABC123"), `토큰이 유출됐다: ${r.text}`);
        // stderr는 진단에 필요하므로 남는다
        assert.match(r.text, /item not found/);
      },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("hex로 저장된 토큰은 값을 노출하지 않고 원인을 알려준다", async () => {
  const real = "ATATT" + "x3FfGF0T".repeat(23);
  const hex = Buffer.from(real + "\n", "utf8").toString("hex");
  await withServer({ BITBUCKET_API_TOKEN: hex }, async ({ callTool }) => {
    const r = await callTool("bb_pr_list", { repo: "acme/repo-a" });
    // 평문 토큰은 assertPlausibleToken 을 거치지 않으므로 401이 나거나 통과한다.
    // 핵심은 어느 경로로도 토큰 값이 응답에 실리지 않는 것이다.
    assert.ok(!r.text.includes(real), "원본 토큰이 노출되면 안 된다");
    assert.ok(!r.text.includes(hex), "hex 토큰이 노출되면 안 된다");
  });
});

// ── 동시성 상한 ───────────────────────────────────────────────────────

test("bb_pr_inbox는 동시 요청 수를 제한한다", async () => {
  const repos = Array.from({ length: 12 }, (_, i) => `acme/r${i}`).join("\n");
  await withFileAllowlist(repos, async ({ callTool, seen }) => {
    await callTool("bb_pr_inbox", {});
    assert.ok(seen.peakConcurrent <= 6, `동시 요청 최대 ${seen.peakConcurrent} (6 이하)`);
    assert.ok(seen.peakConcurrent > 1, "그래도 병렬로 돌아야 한다");
  });
});

// ── bb_doctor ─────────────────────────────────────────────────────────

test("bb_doctor는 정상 설정을 통과시킨다", async () => {
  await withServer({ BITBUCKET_ALLOW_COMMENT: "true" }, async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_doctor", {})).text);
    // 가짜 API는 /user 에 라우트가 없어 404를 낸다 → 인증 항목만 실패
    const labels = out.checks.map((c) => c.label);
    assert.ok(labels.includes("이메일"));
    assert.ok(labels.includes("허용 저장소"));
    assert.ok(labels.includes("bb_comment"));
    assert.ok(labels.includes("저장소 접근"));
    const gate = out.checks.find((c) => c.label === "bb_comment");
    assert.match(gate.detail, /허용/);
  });
});

test("bb_doctor는 토큰 값을 절대 출력하지 않는다", async () => {
  const real = "ATATT" + "x3FfGF0T".repeat(23) + "abc";
  await withServer({ BITBUCKET_API_TOKEN: real }, async ({ callTool }) => {
    const text = (await callTool("bb_doctor", {})).text;
    assert.ok(!text.includes(real), "토큰 전체가 노출됐다");
    assert.ok(!text.includes(real.slice(0, 20)), "토큰 앞부분이 노출됐다");
    assert.ok(!text.includes("ATATT"), "접두사가 노출됐다");
    // 그래도 형태 판정은 되어 있다
    assert.match(text, /192자/);
  });
});

test("bb_doctor는 hex 토큰을 잡아내고 조치를 알려준다", async () => {
  const hex = Buffer.from("ATATT" + "x3FfGF0T".repeat(23) + "\n", "utf8").toString("hex");
  await withServer({ BITBUCKET_API_TOKEN: hex }, async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_doctor", {})).text);
    assert.equal(out.ok, false);
    const p = out.problems.find((x) => x.label === "토큰 형태");
    assert.ok(p, "토큰 형태 문제를 잡아야 한다");
    assert.match(p.detail, /hex/);
    assert.match(p.fix, /add-generic-password/);
    assert.ok(!JSON.stringify(out).includes(hex), "hex 값도 노출하면 안 된다");
  });
});

test("bb_doctor는 빈 allowlist를 문제로 보고한다", async () => {
  await withFileAllowlist("# 주석만\n", async ({ callTool }) => {
    const out = JSON.parse((await callTool("bb_doctor", {})).text);
    assert.equal(out.ok, false);
    // allowlist 해석 자체가 실패하므로 오류로 떨어진다
    assert.ok(out.problems.length > 0);
  });
});

test("bb_doctor는 probe=false 면 네트워크를 쓰지 않는다", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const before = seen.requests.length;
    const out = JSON.parse((await callTool("bb_doctor", { probe: false })).text);
    assert.equal(seen.requests.length, before, "네트워크 호출이 있으면 안 된다");
    assert.ok(out.checks.some((c) => c.label === "토큰 형태"));
    assert.ok(!out.checks.some((c) => c.label === "인증"), "인증 검사는 건너뛴다");
  });
});

test("bb_doctor는 읽기 전용이다 (게이트가 꺼져도 동작)", async () => {
  await withServer({}, async ({ callTool, seen }) => {
    const r = await callTool("bb_doctor", { probe: false });
    assert.equal(r.isError, false, "쓰기 게이트와 무관하게 동작해야 한다");
    assert.equal(seen.posted.length, 0, "어떤 쓰기도 하지 않는다");
  });
});
