# 플러그인 배포용 템플릿

## 왜 루트에 `.mcp.json` 을 두지 않는가

이 저장소는 **그 자체로 Claude Code 프로젝트**다. 루트에 `.mcp.json` 을 두면
Claude Code 가 그것을 **프로젝트 스코프 MCP 설정**으로 읽는다.
프로젝트 스코프는 user 스코프를 덮어쓰므로, 잘 돌던 등록이
`${CLAUDE_PLUGIN_ROOT}/server.mjs` 라는 치환되지 않은 문자열 경로로 바뀌어
서버가 못 뜬다. 실제로 한 번 그렇게 깨졌다.

`${CLAUDE_PLUGIN_ROOT}` 는 **설치된 플러그인으로 로드될 때만** 치환된다.
프로젝트 `.mcp.json` 으로 읽힐 때는 그대로 남는다.

## 배포할 때

플러그인 저장소를 따로 만들고(또는 릴리스 시점에) 이 파일을 플러그인 루트의
`.mcp.json` 으로 복사한다.

```bash
cp plugin-template/mcp.json <플러그인루트>/.mcp.json
```

플러그인 루트에는 `server.mjs`, `lib.mjs`, `node_modules` 가 함께 있어야 한다.
의존성은 `@modelcontextprotocol/sdk` 와 `zod` 둘뿐이다.

## 개발 중에는

MCP 서버는 `setup.sh` 또는 `claude mcp add --scope user` 로 등록하고,
스킬은 `~/.claude/skills/` 에 설치한다. 플러그인 경로를 타지 않으므로
`${CLAUDE_PLUGIN_ROOT}` 문제가 생기지 않는다.
