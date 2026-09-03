// server.mjs가 stdio 전송을 붙이기 전에 순수 로직만 떼어둔 곳.
// 테스트에서 서버를 띄우지 않고 가드를 검증하기 위한 분리다.

// 공백 구분 + "..." / '...' 묶음 지원. 셸이 아니므로 이스케이프·확장은 없다.
export function tokenizeCmd(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let m; (m = re.exec(cmd)); ) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// allowedRepos가 비면 토큰 권한 전체. 하나라도 있으면 default-deny로 전환한다.
// 허용되는 것은 허용 저장소 하위 경로와 /user 뿐이다.
// /repositories/{ws}, /workspaces/*, /user/permissions/repositories 같은
// 목록형 경로는 저장소 인벤토리를 노출하므로 함께 막는다.
export function assertPathAllowed(path, allowedRepos = []) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("path는 /로 시작해야 합니다");
  }

  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname.includes("..")) throw new Error("상대 경로 금지");
  if (pathname.includes("//")) throw new Error("빈 경로 세그먼트 금지");
  if (allowedRepos.length === 0) return;

  if (pathname === "/user") return;

  const m = pathname.match(/^\/repositories\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (!m) {
    throw new Error(
      `허용되지 않은 경로: ${pathname}\n` +
        "allowlist가 설정되면 /repositories/{workspace}/{repo} 하위 경로와 /user 만 허용됩니다.",
    );
  }
  const repo = `${m[1]}/${m[2]}`;
  if (!allowedRepos.includes(repo)) {
    throw new Error(`허용되지 않은 저장소: ${repo} (허용: ${allowedRepos.join(", ")})`);
  }
}

// 응답이 커서 토큰을 태우기 쉬우므로 필드를 골라낸다.
// diff처럼 JSON이 아닌 응답에는 적용할 수 없으므로 원문을 그대로 돌려준다.
export function pick({ text, contentType = "" }, fields) {
  if (!fields?.length) return text;
  if (!contentType.includes("json")) return text;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return text;
  }

  const take = (obj) =>
    Object.fromEntries(
      fields.map((f) => [f, f.split(".").reduce((o, k) => o?.[k], obj)]),
    );
  const out = Array.isArray(data?.values)
    ? { values: data.values.map(take), next: data.next ?? null }
    : take(data);
  return JSON.stringify(out, null, 2);
}

// ── PR 리뷰 워크플로 ──────────────────────────────────────────────────

// "workspace/repo" 를 검증하고 쪼갠다. allowedRepos가 있으면 대조까지 한다.
export function parseRepo(repo, allowedRepos = []) {
  if (typeof repo !== "string") {
    throw new Error("repo는 'workspace/repo' 형식의 문자열이어야 합니다");
  }
  const m = repo.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) throw new Error(`repo는 'workspace/repo' 형식이어야 합니다: ${repo}`);
  const full = `${m[1]}/${m[2]}`;
  if (allowedRepos.length && !allowedRepos.includes(full)) {
    throw new Error(`허용되지 않은 저장소: ${full} (허용: ${allowedRepos.join(", ")})`);
  }
  return { workspace: m[1], slug: m[2], full };
}

export function prId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`PR id는 양의 정수여야 합니다: ${id}`);
  return n;
}

const at = (obj, dotted) => dotted.split(".").reduce((o, k) => o?.[k], obj);

// 응답을 리뷰에 필요한 필드로만 줄인다. 원본 전체는 토큰을 크게 태운다.
export function compactRepo(r) {
  return {
    repo: r?.full_name ?? null,
    name: r?.name ?? null,
    is_private: r?.is_private ?? null,
    main_branch: at(r, "mainbranch.name") ?? null,
    updated_on: r?.updated_on ?? null,
    url: at(r, "links.html.href") ?? null,
  };
}

export function compactPrSummary(p) {
  return {
    id: p?.id ?? null,
    title: p?.title ?? null,
    state: p?.state ?? null,
    author: at(p, "author.display_name") ?? null,
    source: at(p, "source.branch.name") ?? null,
    destination: at(p, "destination.branch.name") ?? null,
    comment_count: p?.comment_count ?? null,
    task_count: p?.task_count ?? null,
    created_on: p?.created_on ?? null,
    updated_on: p?.updated_on ?? null,
    url: at(p, "links.html.href") ?? null,
  };
}

export function compactPr(p) {
  const approvals = (p?.participants ?? [])
    .filter((x) => x?.approved)
    .map((x) => at(x, "user.display_name"))
    .filter(Boolean);
  return {
    ...compactPrSummary(p),
    description: p?.description ?? at(p, "summary.raw") ?? null,
    source_commit: at(p, "source.commit.hash") ?? null,
    destination_commit: at(p, "destination.commit.hash") ?? null,
    reviewers: (p?.reviewers ?? []).map((r) => r?.display_name).filter(Boolean),
    approved_by: approvals,
    close_source_branch: p?.close_source_branch ?? null,
    merge_commit: at(p, "merge_commit.hash") ?? null,
  };
}

// diffstat: 변경 파일 목록. diff 전체를 받기 전에 리뷰 범위를 잡는 데 쓴다.
export function compactDiffstat(d) {
  return {
    status: d?.status ?? null,
    path: at(d, "new.path") ?? at(d, "old.path") ?? null,
    old_path: at(d, "old.path") ?? null,
    lines_added: d?.lines_added ?? 0,
    lines_removed: d?.lines_removed ?? 0,
  };
}

export function compactComment(c) {
  const inline = c?.inline
    ? { path: c.inline.path ?? null, from: c.inline.from ?? null, to: c.inline.to ?? null }
    : null;
  return {
    id: c?.id ?? null,
    author: at(c, "user.display_name") ?? null,
    body: at(c, "content.raw") ?? null,
    inline,
    parent_id: at(c, "parent.id") ?? null,
    created_on: c?.created_on ?? null,
    url: at(c, "links.html.href") ?? null,
  };
}

// 코멘트 POST 본문. path+line이 있으면 인라인, 없으면 PR 전체 코멘트.
// side="new"는 변경 후 파일의 줄(inline.to), "old"는 변경 전 줄(inline.from).
export function buildCommentPayload({ body, path, line, side = "new", parentId }) {
  if (typeof body !== "string" || !body.trim()) {
    throw new Error("body는 비어 있을 수 없습니다");
  }
  const payload = { content: { raw: body } };

  if (path != null || line != null) {
    if (typeof path !== "string" || !path.trim()) {
      throw new Error("인라인 코멘트에는 path가 필요합니다");
    }
    const n = Number(line);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`인라인 코멘트의 line은 양의 정수여야 합니다: ${line}`);
    }
    if (side !== "new" && side !== "old") {
      throw new Error(`side는 'new' 또는 'old' 여야 합니다: ${side}`);
    }
    payload.inline = side === "new" ? { path, to: n } : { path, from: n };
  }

  if (parentId != null) {
    const n = Number(parentId);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`parent_id는 양의 정수여야 합니다: ${parentId}`);
    }
    if (payload.inline) {
      throw new Error("답글(parent_id)과 인라인 위치(path/line)는 함께 쓸 수 없습니다");
    }
    payload.parent = { id: n };
  }

  return payload;
}

// diff나 파일 본문은 수십만 바이트가 되기 쉬우므로 줄 경계에서 자른다.
// hint는 "그래서 어떻게 좁히라는 것인가"를 알려주는 문장이다.
// 잘린 응답을 받은 쪽이 다음 호출을 바로 만들 수 있어야 한다.
export const TRUNCATE_HINT = {
  diff: "bb_pr_files 로 파일 목록을 먼저 보고 bb_pr_diff 에 path 를 지정해 파일 단위로 받으세요.",
  file: "bb_file 의 start·end 로 줄 범위를 좁혀 다시 받으세요.",
};

export function truncateDiff(text, maxBytes, hint = TRUNCATE_HINT.diff) {
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= maxBytes) return { text, truncated: false };
  let cut = buf.subarray(0, maxBytes).toString("utf8");
  const lastNl = cut.lastIndexOf("\n");
  if (lastNl > 0) cut = cut.slice(0, lastNl);
  return {
    text:
      cut +
      `\n\n[...잘렸음: 전체 ${buf.byteLength} 바이트 중 ${Buffer.byteLength(cut, "utf8")} 바이트만 표시. ` +
      hint +
      "]",
    truncated: true,
  };
}

// ── allowlist 파일 ────────────────────────────────────────────────────
// 한 줄에 workspace/repo 하나. `#` 이후는 주석. 빈 줄 무시.
// 형식이 틀린 줄은 조용히 넘기지 않고 예외를 던진다. 오타 때문에
// "허용한 줄 알았는데 차단됨"으로 헤매는 게 더 나쁘다.
export function parseAllowlistFile(content, source = "allowlist 파일") {
  const repos = [];
  content.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    if (!/^[^/\s]+\/[^/\s]+$/.test(line)) {
      throw new Error(
        `${source} ${i + 1}번째 줄이 'workspace/repo' 형식이 아닙니다: ${raw.trim()}`,
      );
    }
    if (!repos.includes(line)) repos.push(line);
  });
  return repos;
}

// ── 토큰 위생 검사 ────────────────────────────────────────────────────
// `security find-generic-password -w` 는 저장된 값에 개행 등이 섞여 있으면
// 평문 대신 hex 문자열을 출력한다. 그대로 Basic 인증에 쓰면 Bitbucket이
// 본문 없는 401을 돌려주기 때문에 원인을 찾기가 매우 어렵다. 미리 잡는다.
export function assertPlausibleToken(token, source = "토큰") {
  if (!token) throw new Error(`${source}이 비어 있습니다`);

  if (token.length >= 40 && token.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(token)) {
    let decoded = "";
    try {
      decoded = Buffer.from(token, "hex").toString("utf8");
    } catch {
      /* hex가 아니면 아래 검사에서 걸리지 않는다 */
    }
    if (/^[\x20-\x7e\r\n\t]+$/.test(decoded)) {
      throw new Error(
        `${source}이 hex로 인코딩돼 보입니다 (${token.length}자). ` +
          "키체인에 저장된 값에 개행이 섞이면 `security -w`가 평문 대신 hex를 출력합니다.\n" +
          "토큰을 한 줄로 다시 저장하세요:\n" +
          "  security add-generic-password -U -s bb-api-token -a \"$USER\" -w '<TOKEN>'\n" +
          "대화형 프롬프트(`-w` 를 값 없이 맨 끝)는 128자에서 잘리므로 쓰지 마세요.",
      );
    }
  }
  return token;
}

// ── 재시도 판정 ───────────────────────────────────────────────────────
// 429는 요청이 거부된 것이므로 어떤 메서드든 재시도가 안전하다.
// 5xx는 서버가 이미 처리했을 수도 있어 GET만 재시도한다.
// (코멘트 POST를 5xx에서 재시도하면 중복 코멘트가 달릴 수 있다)
export function shouldRetry({ status, method, networkError = false }) {
  if (networkError) return method === "GET";
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return method === "GET";
  return false;
}

// Retry-After가 있으면 그걸 따르고, 없으면 지수 백오프 + 지터.
export function backoffMs(attempt, retryAfterSeconds, rand = Math.random) {
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 30_000);
  }
  return Math.min(500 * 2 ** attempt + rand() * 250, 8_000);
}

// Retry-After는 초 단위 정수 또는 HTTP-date 두 형태가 있다.
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return secs >= 0 ? secs : null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (at - now) / 1000);
}

// ── 파일 본문 ─────────────────────────────────────────────────────────
// 인라인 코멘트의 줄 번호를 눈으로 찾을 수 있게 번호를 붙인다.
export function numberLines(text, { start = 1, end } = {}) {
  const all = text.split("\n");
  // 파일 끝 개행으로 생긴 빈 줄은 실제 줄이 아니다
  if (all.length > 1 && all[all.length - 1] === "") all.pop();

  const from = Math.max(1, start);
  const to = end == null ? all.length : Math.min(end, all.length);
  if (from > all.length) {
    throw new Error(`start(${from})가 파일 길이(${all.length}줄)를 넘습니다`);
  }
  if (end != null && end < from) {
    throw new Error(`end(${end})가 start(${from})보다 작습니다`);
  }

  const width = String(to).length;
  const body = all
    .slice(from - 1, to)
    .map((line, i) => `${String(from + i).padStart(width)} | ${line}`)
    .join("\n");

  return { text: body, totalLines: all.length, from, to };
}

// ── URL 해석 + 판정 ──────────────────────────────────────────────────
// 가드가 문자열을 보고, fetch가 정규화된 URL을 보내면 둘이 어긋난다.
// WHATWG URL 파서는 `%2e%2e`, `.%2e`, `%2E%2E`, 백슬래시를 `..`/`/`로 접는다.
// 그래서 가드를 통과한 `/repositories/ws/allowed/%2e%2e/%2e%2e/other/repo` 가
// 실제로는 `/repositories/other/repo` 로 나가 allowlist를 무력화했다.
//
// 해결: 여기서 URL을 먼저 만들고, **정규화된 pathname**으로 판정한 뒤,
// 그 URL 객체를 그대로 fetch에 넘긴다. 판정 대상과 전송 대상이 같아진다.
export function resolveApiUrl(apiBase, path, allowed = []) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("path는 /로 시작해야 합니다");
  }

  const base = new URL(apiBase);
  const basePath = base.pathname.replace(/\/+$/, "");

  let url;
  try {
    url = new URL(apiBase + path);
  } catch {
    throw new Error(`URL로 해석할 수 없는 path: ${path}`);
  }

  // 파서가 경로를 접은 뒤에도 같은 호스트, 같은 API 베이스 아래여야 한다
  if (url.origin !== base.origin) {
    throw new Error(`API 호스트를 벗어났습니다: ${path}`);
  }
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
    throw new Error(`API 베이스(${basePath || "/"})를 벗어났습니다: ${path}`);
  }

  const normalized = url.pathname.slice(basePath.length) || "/";
  assertPathAllowed(normalized + url.search, allowed);
  return url;
}

// 파일 경로를 URL 경로 세그먼트로 인코딩한다. `/`는 구분자로 남긴다.
// 이걸 안 하면 파일명 안의 `?`가 쿼리로, `%2e%2e`가 상위 이동으로 해석된다.
export function encodePathSegments(filePath) {
  return String(filePath)
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

// 동시 요청 수를 제한한다. allowlist가 커지면 저장소 수만큼
// 한꺼번에 때려서 rate limit에 걸리거나 스스로를 막는다.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// 목록 응답이 컨텍스트를 통째로 태우지 않게 항목 수를 자른다.
export function capItems(items, maxBytes) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += Buffer.byteLength(JSON.stringify(items[i]), "utf8") + 2;
    if (total > maxBytes) {
      return { items: items.slice(0, i), dropped: items.length - i };
    }
  }
  return { items, dropped: 0 };
}
