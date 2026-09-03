// 버전이 세 곳에 있고 전부 맞아야 한다.
// 어긋나면 claude plugin update 가 "already at the latest version" 으로
// 조용히 스킵해서, 새 코드가 설치본에 반영되지 않는다. 실제로 겪었다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8"));

const pkg = read("package.json");
const plugin = read("plugin/.claude-plugin/plugin.json");
const market = read(".claude-plugin/marketplace.json");

test("버전이 세 곳에서 일치한다", () => {
  const entry = market.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, `marketplace.json 에 ${plugin.name} 항목이 있어야 한다`);
  assert.equal(
    plugin.version, pkg.version,
    "plugin.json 과 package.json 이 어긋나면 plugin update 가 스킵된다",
  );
  assert.equal(
    entry.version, pkg.version,
    "marketplace.json 이 어긋나면 마켓플레이스가 옛 버전을 광고한다",
  );
});

test("마켓플레이스가 가리키는 플러그인 경로가 맞다", () => {
  const entry = market.plugins.find((p) => p.name === plugin.name);
  assert.equal(entry.source, "./plugin", "루트에 두면 프로젝트 MCP 설정을 하이재킹한다");
});

test("플러그인이 MCP 서버를 선언하지 않는다", () => {
  // 자격증명이 머신별이고 node_modules 보장이 없다. 서버는 claude mcp add 로 등록한다.
  assert.equal(plugin.mcpServers, undefined, "plugin.json 에 mcpServers 를 두지 않는다");
  let hasRootMcp = true;
  try {
    readFileSync(fileURLToPath(new URL("../.mcp.json", import.meta.url)));
  } catch {
    hasRootMcp = false;
  }
  assert.equal(hasRootMcp, false, "루트 .mcp.json 은 프로젝트 스코프를 하이재킹한다");
});

test("스킬과 명령 경로가 선언과 일치한다", () => {
  assert.deepEqual(plugin.skills, ["./skills/"]);
  assert.deepEqual(plugin.commands, ["./commands/"]);
});
