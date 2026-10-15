// scripts/install-pr-template.sh 는 남의 저장소에 파일을 쓴다.
// 덮어쓰기와 대상 판별이 조용히 틀리면 팀 템플릿이 사라진다 — 실제 git 저장소로 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "scripts/install-pr-template.sh");
const src = readFileSync(join(root, "plugin/skills/bb-pr-create/pull_request_template.md"), "utf8");
const REL = ".bitbucket/pull_request_template.md";

function repo(remote) {
  const dir = mkdtempSync(join(tmpdir(), "bb-tpl-"));
  spawnSync("git", ["init", "-q", dir]);
  if (remote) spawnSync("git", ["-C", dir, "remote", "add", "upstream", remote]);
  return dir;
}

// stdin 을 파이프로 주면 대화형이 아니다 — 덮어쓰기를 묻지 못한다
const run = (...args) => spawnSync("bash", [script, ...args], { input: "", encoding: "utf8" });

test("Bitbucket 저장소에 템플릿을 복사한다 (remote 이름은 origin 이 아니어도 된다)", () => {
  const dir = repo("git@bitbucket.org:acme/web-app.git");
  try {
    mkdirSync(join(dir, "src"));
    const r = run(join(dir, "src")); // 하위 폴더를 줘도 저장소 루트에 둔다
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, REL), "utf8"), src);
    assert.match(r.stdout, /복사 1 /);
    assert.match(r.stdout, /커밋·푸시는 하지 않았습니다/);

    const again = run(dir);
    assert.match(again.stdout, /이미 같음 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Bitbucket 이 아니면 건너뛴다", () => {
  const dir = repo("git@github.com:acme/web-app.git");
  try {
    const r = run(dir);
    assert.equal(r.status, 0);
    assert.equal(existsSync(join(dir, REL)), false);
    assert.match(r.stdout, /건너뜀 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("다른 템플릿이 있으면 대화형이 아닐 때 덮어쓰지 않는다", () => {
  const dir = repo("https://bitbucket.org/acme/api.git");
  try {
    mkdirSync(join(dir, ".bitbucket"));
    writeFileSync(join(dir, REL), "## 팀 템플릿\n");
    const r = run(dir);
    assert.equal(readFileSync(join(dir, REL), "utf8"), "## 팀 템플릿\n");
    assert.match(r.stdout, /덮어쓰지 않습니다/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("템플릿 자리가 심볼릭 링크면 따라가지 않고 실패한다", () => {
  // 링크를 따라 cp 하면 저장소 밖 파일이 덮어써진다
  const dir = repo("git@bitbucket.org:acme/web-app.git");
  const outside = mkdtempSync(join(tmpdir(), "bb-tpl-out-"));
  try {
    const victim = join(outside, "victim.txt");
    writeFileSync(victim, "keep\n");
    mkdirSync(join(dir, ".bitbucket"));
    symlinkSync(victim, join(dir, REL));
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.equal(readFileSync(victim, "utf8"), "keep\n");
    assert.match(r.stderr, /심볼릭 링크/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("git 저장소가 아니면 실패 코드로 끝난다 — 조용히 넘기지 않는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-tpl-"));
  try {
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /실패 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup.sh 는 묻고 나서만 템플릿을 설치한다", () => {
  // 남의 저장소에 쓰는 단계라 기본값이 N 이어야 한다
  const setup = readFileSync(join(root, "setup.sh"), "utf8");
  assert.match(setup, /PR 템플릿을 설정할까요\? \[y\/N\]/);
  assert.match(setup, /scripts\/install-pr-template\.sh/);
});
