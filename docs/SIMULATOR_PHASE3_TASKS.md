# 시뮬레이터 Phase 3 작업 지시서 — 유저 PvP 친선전 (2026-06-13)

> 상위: [SIMULATOR_GAME_PLAN.md](./SIMULATOR_GAME_PLAN.md) §4-D.
> **DB·Realtime 설계 = Claude(완료분 아래), 로비/PvP 대국 UI = Antigravity.** 검증·병합: Claude.
> 작업 자세: [HARNESS_PRINCIPLES.md](./HARNESS_PRINCIPLES.md) — 가장 단순한 동작부터(초대 링크 1:1), 검증 루프 내장.
> **브랜치 push 후 보고**, 각 단계 `bun run build`+`bunx eslint` 통과.

## 0. 핵심 원리 (왜 서버 게임루프가 필요 없나)

엔진이 **순수 함수 + 결정론 RNG**라, 두 클라이언트가 **같은 seed로 `init`** 하고 **같은 액션열을 같은 순서로 `applyAction`** 하면 화면이 항상 동일하다(lockstep). 그래서 권위 서버 없이 **액션만 주고받으면** PvP가 성립한다. 친선전은 **클라이언트 신뢰 모델**(상대가 보낸 액션을 그대로 적용, 상대 손패는 화면에서 숨김). 랭크전은 후순위(Edge Function 권위 서버로 승격).

## 1. Claude 완료분 (이미 적용됨 — UI에서 사용)

- **테이블 `simulator_matches`** (마이그레이션 `20260613130000`) + RLS + realtime publication 등록.
  - 컬럼: `host_id`·`guest_id`·`seed`·`host_recipe`/`guest_recipe`(jsonb)·`host_leader_code`/`guest_leader_code`·`status`(waiting/playing/finished/abandoned)·`action_log`(jsonb)·`winner`(host/guest/draw)·timestamps
  - RLS: 조회=참가자 또는 `waiting`(로비), 생성=host 본인, 수정=참가자 또는 빈 대기방 입장, 삭제=host
- **types.ts 재생성 완료** — `Tables<"simulator_matches">` 타입 사용 가능.

## 2. 동기화 모델 (이대로 구현)

- **채널**: Supabase Realtime broadcast 채널 `sim-match-{id}`, `{ config: { broadcast: { self: true } } }`.
  - `self: true`로 **발행자도 자기 메시지를 수신** → 모든 액션이 단일 경로(broadcast 수신)로 적용되어 양측 순서 일관.
- **액션 전송**: `{ seq, action }` 브로드캐스트. 수신 시 `seq` 순서대로 `optcgEngine.applyAction` 적용. (seq로 중복/순서 방어)
- **영속·복구**: 매 액션마다 `simulator_matches.action_log`에 append(UPDATE). 재접속 시 `action_log`를 순서대로 리플레이해 현재 상태 복원 → 이후 broadcast 구독.
- **lifecycle**: `simulator_matches`의 postgres_changes 구독으로 게스트 입장·status 변화 감지(호스트가 "상대 입장" 인지).

## 3. 권한 규칙 (중요)

- **host = p1, guest = p2** 고정.
- 각자 **자기 플레이어의 액션만** 발행: host는 `getAvailableActions(state, "p1")`, guest는 `"p2"`만. 상대 플레이어 액션 버튼은 비활성.
- **카운터 윈도우**(`pendingResponse`)에선 `defenderPlayer`가 발행 주체 — 상대 턴에도 내가 수비자면 카운터/블록/패스 발행 가능. (기존 단일플레이 actor 로직과 동일 개념)
- AI 자동진행(`isAutoPlaying`)은 PvP에서 **비활성**(양쪽 다 사람).

## 4. UI 작업 (Antigravity)

### 4-1. 로비 / 매치 생성·입장
- `simulator.index.tsx`에 "유저 대전(PvP)" 섹션 또는 새 라우트(`/simulator/pvp`). 1차는 **초대 링크 방식**(가장 단순):
  1. **방 만들기**: 내 덱 선택 → `simulator_matches` INSERT(host_id=나, seed=랜덤, host_recipe=레시피 스냅샷, status=waiting) → **초대 링크 `/simulator/pvp/{id}` 복사**.
  2. **입장**: 링크 접속 → 내 덱 선택 → 빈 대기방이면 UPDATE(guest_id=나, guest_recipe, status=playing).
  3. (2차) 공개 대기방 목록: `status='waiting'` SELECT로 로비 리스트.

### 4-2. PvP 대국 화면
- **기존 `simulator.$id.tsx`(플레이매트 보드) 최대한 재사용.** PvP 모드 분기:
  - init: `simulator_matches.seed` + 양측 recipe로 `optcgEngine.init`. 내가 host면 내 시점=p1, guest면 화면상 내 진영을 p2로(보드는 항상 "나"를 하단에 — 시점 매핑 주의).
  - AI 루프 제거, 대신 broadcast 수신 → applyAction.
  - 내 액션 발행: `handlePerformAction`을 broadcast 전송 + action_log append로 교체(로컬 즉시 적용 대신 self-echo로 적용).
  - 상대 손패는 `OppHand`(뒷면) 그대로.
  - 연결 상태 표시(상대 접속/대기/끊김), 재접속 시 action_log 리플레이.
- **멀리건**: 양쪽이 각자 결정 → 둘 다 broadcast. 기존 mulligan phase 흐름을 PvP에 맞춰(p1→p2 순서는 동일, 단 각자 자기 것만 발행).

## 5. 불변 규칙

- DB 스키마/RLS 추가·변경이 더 필요하면 **코드로 만들지 말고 Claude에 요청**(AGENTS.md §1).
- 엔진(`optcgEngine`)·DSL 변경 금지 — PvP는 기존 엔진을 그대로 양측에서 돌린다.
- 새 패키지 금지(@supabase/supabase-js 기존 client 사용). game 토큰·i18n(ko/en/ja).
- Phase 2 보드·연출·멀리건·플레이매트 전부 보존.

## 6. 수용 기준 (검증 루프)

- [ ] `bun run build`+`bunx eslint` 통과.
- [ ] **브라우저 2개(또는 시크릿 창)로 실제 1:1 대국 완주** — 방 만들기→링크 입장→멀리건→대국→승패.
- [ ] 한쪽 액션이 다른 쪽 화면에 반영(lockstep 동기화 일치).
- [ ] **새로고침 후 action_log 리플레이로 상태 복원**.
- [ ] 상대 손패가 안 보임(비공개), 자기 턴이 아닐 때 액션 비활성(카운터 윈도우 제외).
- [ ] 두 테마·모바일 정상.

## 7. 검증·병합

브랜치 push → 작업 전달 형식 보고 → Claude 코드 리뷰 + RLS/보안 재점검 + 2-클라이언트 시연 검증 → 병합.

> ⚠️ PvP 결과를 공식 전적(`matches`)에 기록할지는 **미정**(SIMULATOR_GAME_PLAN §6-3). 1차는 기록 안 함(친선·연습). 기록 도입 시 별도 지시.
