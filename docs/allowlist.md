# 허용 저장소

[← README](../README.md) · 설정 방법과 경계의 실체

## 허용 저장소 지정

세 가지 소스가 있고, **어느 것을 쓸지는 기동 시 한 번 정해진다.**

| 조건 | 모드 | 목록 갱신 |
|---|---|---|
| `BITBUCKET_ALLOWED_REPOS` 설정 | `env` | 재등록 + 세션 재시작 |
| `BITBUCKET_ALLOWED_REPOS_FILE` 설정 | `file` | 파일 편집 + 세션 재시작 |
| 기본 파일이 기동 시점에 존재 | `file` | 파일 편집 + 세션 재시작 |
| `BITBUCKET_ALLOW_ALL_REPOS=true` | `open` | 제한 없음. **경로 가드까지 함께 풀린다** (아래) |
| 아무것도 없음 | `denied` | **전부 차단** |

env가 파일보다 우선한다. `bb_doctor` 응답의 `allowlist 소스`가 지금 어느 모드이고
언제 읽는지 알려준다.

**`open` 모드는 저장소 제한만 푸는 것이 아니다.** 경로 가드도 함께 풀려
`/workspaces/*` · `/teams` · `/user/permissions/repositories` 같은 경로가 열린다
(실측). allowlist 가 있을 때만 "`/repositories/{ws}/{repo}` 하위와 `/user` 만" 이라는
제한이 걸린다. 즉 `open` 은 **토큰이 할 수 있는 전부**이며, 남는 방어선은 쓰기 게이트뿐이다.

### 언제 어떻게 만드나

`setup.sh` 4단계가 대화형으로 만든다. 한 줄씩 입력하고 빈 줄로 끝낸다.
형식이 틀린 줄(3단 경로, 앞 슬래시, 공백)은 그 자리에서 거부한다.
다 끝나면 권한을 600으로 조인다.

손으로 만들려면:

```bash
mkdir -p ~/.config/bb-mcp
cat > ~/.config/bb-mcp/allowed-repos <<'EOF'
# 리뷰 대상 저장소. 한 줄에 하나. `#` 이후는 주석.
acme/web-app
acme/admin-web
EOF
chmod 600 ~/.config/bb-mcp/allowed-repos
```

`workspace/repo` 는 브라우저에서 `bitbucket.org/` 다음에 오는 두 조각이다.
`bitbucket.org/acme/web-app/pull-requests/12` → `acme/web-app`.

만든 뒤 **세션을 재시작해야 반영된다**(기동 시 스냅샷).

### 안 만들면 전부 차단된다

모드 결정은 기동 시 이 순서다.

```
BITBUCKET_ALLOWED_REPOS 있음        → env    (그 목록)
BITBUCKET_ALLOWED_REPOS_FILE 있음   → file   (파일이 없어도 file. 전체 차단)
기본 파일이 존재                     → file
BITBUCKET_ALLOW_ALL_REPOS=true      → open   (제한 없음)
아무것도 없음                        → denied (전부 차단)
```

설정을 빠뜨리면 **아무 저장소에도 접근하지 않는다.** 서버는 뜨지만 모든 호출이
막히고, 여는 방법을 알려준다.

```
[bb-mcp] 허용 저장소가 설정되지 않아 모든 저장소를 차단합니다.
  ~/.config/bb-mcp/allowed-repos 에 'workspace/repo' 를 한 줄씩 적고 세션을 재시작하세요.
  제한 없이 쓰려면 BITBUCKET_ALLOW_ALL_REPOS=true 를 명시해야 합니다.
```

**전체 개방은 명시적으로 켜야 한다.** `BITBUCKET_ALLOW_ALL_REPOS=true` 없이는
`open` 모드가 되지 않는다. `BITBUCKET_ALLOWED_REPOS=""`(빈 문자열)도 개방이 아니라
차단이다.

> **0.11.0 이전에는 반대였다.** 아무 설정이 없으면 `open` 으로 뜨고 stderr 경고만
> 남겼다. "레포를 지정 안 했으면 접근 안 하겠지"라는 자연스러운 기대와 어긋나서
> 기본을 뒤집었다. `open` 을 쓰던 설정은 `BITBUCKET_ALLOW_ALL_REPOS=true` 를
> 추가해야 한다.

### 저장소 이름을 모를 때

`open` 모드에서 한 번 나열해 목록을 만든 뒤 좁히는 방법이 있다.

```
bb_repos({ workspace: "acme" })     # BITBUCKET_ALLOW_ALL_REPOS=true 에서만 동작
```

allowlist 가 설정돼 있으면 `bb_repos` 는 **그 목록만** 조회하고
워크스페이스 전체는 노출하지 않는다. 즉 순서가 이렇다.

1. `BITBUCKET_ALLOW_ALL_REPOS=true` 로 등록 → `open` 모드 (경고가 뜬다)
2. `bb_repos({workspace})` 로 저장소 이름 확인
3. 파일에 필요한 것만 적고 `_FILE` 을 넣어 재등록
4. 세션 재시작 → `file` 모드로 좁혀짐

### 파일 모드 (권장)

```bash
mkdir -p ~/.config/bb-mcp
cat > ~/.config/bb-mcp/allowed-repos <<'EOF'
# 리뷰 대상 저장소. 한 줄에 하나.
acme/web-app      # 서비스 프론트
acme/admin-web    # 어드민
EOF
chmod 600 ~/.config/bb-mcp/allowed-repos
```

`.mcp.json`에서는 `BITBUCKET_ALLOWED_REPOS`를 **빼고** 파일 경로를 명시한다:

```json
"BITBUCKET_ALLOWED_REPOS_FILE": "~/.config/bb-mcp/allowed-repos"
```

경로를 명시하면 파일이 아직 없어도 `file` 모드로 잡힌다(그동안은 전체 차단).

### 경계의 실체는 재시작 장벽이다

목록은 **기동 시 한 번 읽는다.** 저장소를 추가하려면 파일에 한 줄 넣고
세션을 재시작한다. 편집은 쉽고, 반영에는 재시작이 필요하다 — 이 조합이 핵심이다.

```bash
printf '\nacme/new-repo\n' >> ~/.config/bb-mcp/allowed-repos
```

**앞의 `\n` 이 중요하다.** 파일 마지막 줄에 개행이 없으면 `echo 'x' >>` 가
이전 항목에 그대로 붙어 `acme/lastacme/new-repo` 같은 줄을 만든다.
파서가 줄 번호와 함께 거부하므로 조용히 깨지지는 않지만, 빈 줄은 무시되니
`\n` 을 앞에 붙이는 습관이 안전하다.

에이전트는 `Write`/`Edit` 툴을 갖고 있어 allowlist 파일을 고칠 수 있다.
막을 수 없다. 하지만 **고쳐도 그 세션에서는 쓸 수 없다.** 하이재킹된 에이전트가
자기 경계를 넓혀 곧바로 써먹는 경로가 닫힌다. 재시작은 사람이 한다.

env 모드도 같은 성질을 갖지만 편집이 `claude mcp remove/add` 6줄짜리라
번거롭기만 하다. **번거로움은 보안에 기여하지 않는다.** 둘 중 하나를 고른다면
파일 모드가 낫다.

### 호출마다 재읽기 (권장하지 않음)

```
BITBUCKET_ALLOWLIST_RELOAD=true
```

재시작 없이 반영된다. 대신 재시작 장벽이 사라져서, 에이전트가 파일을 고쳐
**그 세션에서 즉시** 자기 경계를 넓힐 수 있다. 저장소를 자주 바꾸고
프롬프트 인젝션 위험이 낮은 상황(공개 저장소, 신뢰하는 PR 작성자)에서만 켠다.

한 번의 툴 호출 안에서는 진입 시점의 스냅샷을 쓰므로, 페이지네이션 도중에
파일이 바뀌어도 판정이 흔들리지 않는다.

### fail-closed

파일이 없거나, 비었거나, 읽을 수 없으면 전체 개방이 아니라 **전체 차단**이다.
파일을 실수로 지웠을 때 조용히 모든 저장소가 열리는 게 훨씬 나쁘다.
형식이 틀린 줄은 줄 번호를 알려주며 거부한다.

기동 시 읽기에 실패해도 **서버는 뜬다.** 죽어버리면 `bb_doctor`로 원인을
볼 수 없기 때문이다. 대신 모든 호출이 그 오류로 차단된다.

모드 자체는 기동 시 고정이므로, 파일을 지운다고 `open` 모드로 뒤바뀌지 않는다.

### 목록 확인과 추가

```
bb_allowlist_list()              적용 중인 목록 + 파일과의 차이
bb_allowlist_add("acme/new")     파일에 한 줄 추가 (게이트 필요)
```

`/bb-pr-review:bb-repos` 와 `/bb-pr-review:bb-repos add acme/new` 로도 부를 수 있다.

`bb_allowlist_list` 는 **설정이 어떤 상태든 응답한다.** 허용 목록이 없거나(`denied`)
파일 파싱에 실패해도 오류로 끝내지 않고 `mode`·`warning`·`error`·`fix` 를 돌려준다 —
상태를 설명해야 할 때 툴이 안 뜨면 쓸모가 없기 때문이다.

```json
{ "mode": "denied", "active": [], "active_count": 0,
  "warning": "허용 저장소가 설정되지 않아 모든 저장소가 차단됩니다.",
  "fix": "~/.config/bb-mcp/allowed-repos 에 workspace/repo 를 한 줄씩 적고 세션을 재시작하세요. ..." }
```

그리고 **기동 시 스냅샷과 현재 파일의 차이**를 보여준다.
"추가했는데 왜 안 먹나"의 답이 여기 있다.

```json
{ "in_sync": false, "pending_add": ["acme/repo-new"],
  "note": "파일이 기동 시점과 다릅니다. 세션을 재시작하면 반영됩니다." }
```

`bb_allowlist_add` 는 **기본 차단**이고, 켜도 **그 세션에는 반영되지 않는다.**
파일에만 쓰고 실행 중 스냅샷은 건드리지 않는다 — 재시작 장벽이 유지된다.
언제 무엇을 넣었는지 주석으로 파일에 남는다.

```
# 2026-09-03 18:30 bb_allowlist_add
acme/repo-new
```

### 이 게이트는 단단한 경계가 아니다

에이전트는 `Write`/`Edit` 툴로 이 파일을 직접 고칠 수 있다([보안](./security.md) 「막지 못하는 것」 ②).
그래서 `ALLOW_ALLOWLIST_WRITE` 를 끄는 것이 파일 수정을 막지는 못한다.
게이트의 값은 셋이다.

- 기본이 off라, 설정하지 않으면 경계를 넓히는 툴이 노출되지 않는다
- 추가 흔적이 타임스탬프 주석으로 파일에 남아 사람이 알아볼 수 있다
- 끝 개행이 없는 파일에 안전하게 덧붙인다(직접 `echo >>` 하면 이전 항목에 붙는다)

**실제 경계는 여전히 재시작 장벽이다.** 파일이 어떻게 바뀌든 실행 중인 세션은
기동 시점의 목록만 적용한다. 이건 테스트로 고정돼 있다.
