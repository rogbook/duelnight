# 시뮬레이터 Phase 2 작업 지시서 — "게임답게" (게임 UX·연출) (2026-06-13)

> 상위 기획: [SIMULATOR_GAME_PLAN.md](./SIMULATOR_GAME_PLAN.md) §4-C / Phase 1 완료분: [SIMULATOR_PHASE1_TASKS.md](./SIMULATOR_PHASE1_TASKS.md).
> **담당: 2A·2B·2D = Antigravity, 2C(연출) = Antigravity 또는 Codex. 멀리건(엔진 의존) = Claude 선행.** 검증·병합: Claude → 사용자/테스터 폰 평가.
> 작업 자세: [HARNESS_PRINCIPLES.md](./HARNESS_PRINCIPLES.md) — 단순 구성부터, 검증을 루프에 내장. **브랜치 push 후 보고**(main 직접 금지), 각 단계 `bun run build` 통과.

## 0. 현황 (전면 재작성 금지 — 이미 있는 것 위에 쌓는다)

`src/routes/simulator.$id.tsx`(약 990줄)는 이미 게임 보드를 갖췄다. **새로 만들지 말고 강화한다:**

- 보드 레이아웃: 상대 필드 상단 / 내 필드 하단, 중앙 리더, 벤치 5슬롯 (`Board`/`BenchUnit`/`LeaderCard`)
- 부채꼴 손패(겹침), 상대 손패 뒷면(비공개), 덱/트래시 파일
- 리더 글로우, 라이프 ❤️ HP 배지, 캐릭터 파워 배지, 로그 패널
- 액션: 손패 탭 → 전용 액션 버튼(`selectedHandIid` + `selectedCardActions`/`boardActions`)

**부족한 것 = Phase 2 범위:** ① SaaS 표면(게이머 톤 미적용) ② 직관적 조작(확대·대상 하이라이트·화살표) ③ 연출(턴 전환·전투·KO·데미지) ④ 게임 흐름(멀리건·결과 화면).

## 2A. 게이머 톤 적용 (Antigravity) — UI 3차와 동일 매핑

- `simulator.$id.tsx`의 SaaS 표면(`bg-card`·`bg-background`·`border-border`·`text-muted-foreground`)을 [UI_GAMER_SPEC_3.md](./UI_GAMER_SPEC_3.md) §2 매핑(`bg-game-card`·`border-game-line`·`text-game-text(-dim)`)으로 교체.
- 보드 배경은 `--game-bg`/`--game-bg-deep`로 "대국장" 느낌. 내 영역과 상대 영역을 미세한 톤 차이로 구분.
- **로직·존 구조·액션 흐름은 건드리지 않는다 — className만.** (UI 3차의 시뮬 대국 "보수적" 항목이 여기서 본격 적용된다.)

## 2B. 직관적 조작 (Antigravity)

1. **카드 확대 미리보기**: 손패/필드 카드를 탭하면 확대 패널(이미지+이름+코스트/파워/효과 텍스트). 모바일은 하단 시트(`Drawer` 재사용), PC는 호버/사이드. 효과 텍스트는 `cards.effect` 사용.
2. **플레이 가능 표시**: 낼 수 있는 손패(`playableHandIids`)는 강조 테두리(`--game-blue`), 불가 카드는 디밍 — 기존 집합 재사용, 새 계산 금지.
3. **공격 대상 선택 시각화**: 공격 액션 선택 시 가능한 대상(상대 리더/레스트 캐릭터)을 하이라이트하고, 공격자→대상 **화살표/라인** 표시 후 확정. 현재 버튼 리스트를 대체가 아니라 보강(접근성 위해 버튼도 유지).

## 2C. 연출 (Antigravity 또는 Codex)

- **턴 전환 배너**: "내 턴 / 상대 턴" 짧은 배너(슬라이드 인/아웃).
- **전투**: 공격 충돌 시 공격자 카드 흔들림/전진, KO 시 대상 페이드아웃, 리더 피격 시 라이프 영역 셰이크 + ❤️ 감소.
- **카운터 윈도우 강조**: `pendingResponse` 활성 시 방어 측 테두리 펄스 + "카운터/블록/패스" 액션을 눈에 띄게.
- **제약(불변)**: 애니메이션은 **transform/opacity만**, `prefers-reduced-motion` 존중(끄면 즉시 전환), 새 패키지 금지(CSS·기존 의존만). 연출은 게임 상태를 바꾸지 않는다(표현 전용).

## 2D. 게임 흐름 (Antigravity, 멀리건은 Claude 선행)

1. **승패 결과 화면**: `isTerminal` 시 오버레이 — 승/패, 턴 수, 로그 요약, [다시 하기]/[덱 변경(=/simulator)] 버튼. UI만이라 부 개발자 범위.
2. **멀리건**(첫 손패 1회 교체, OPTCG 룰): 게임 상태 조작이라 **엔진 액션이 필요** → **Claude가 `optcgEngine`에 결정론 RNG 기반 mulligan 액션을 먼저 추가**(별도 작은 커밋 + verify 시나리오). 그 후 Antigravity가 시작 시 "멀리건 하시겠습니까?" UI 연결. **엔진 지원 전에는 UI 보류.**

## 3. 불변 규칙

- **엔진·DSL·데이터 쿼리·액션 흐름 변경 금지**(멀리건 제외, 그건 Claude 담당). 표현·상호작용 레이어만.
- 새 패키지 금지, lucide 아이콘만. game 토큰 사용, 라이트 테마는 깨지지만 않게.
- 빈 상태·로딩·에러·AI 자동진행(`isAutoPlaying`) 모드 모두 보존. 관전 모드에서도 연출이 자연스럽게.
- i18n: 신규 문구는 ko/en/ja 3개 언어 모두(기존 `useI18n` 패턴 사용 — 컴포넌트 로컬 하드코딩 지양).

## 4. 수용 기준 (검증을 루프에 내장 — 통과해야 병합)

- [ ] `bun run build` 통과, 변경 파일 `bunx eslint <files>` 오류 0.
- [ ] 폰 화면(모바일)에서 한 판을 **처음부터 끝(승패 화면)까지** 끊김 없이 완주.
- [ ] 카드 확대·플레이 가능 표시·공격 화살표가 실제로 동작(스크린샷 첨부 보고).
- [ ] `prefers-reduced-motion: reduce`에서 애니메이션이 즉시 전환으로 대체됨.
- [ ] AI vs AI 관전 모드에서도 연출이 정상(무한 루프·깜빡임 없음).
- [ ] 두 테마(라이트/다크) + 로그인 상태에서 깨짐 없음. (교훈: UI 검수는 두 테마 필수)

## 5. 검증·병합 절차

1. 멀리건이 필요한 경우 Claude가 엔진 액션 + verify 시나리오 선행 → 병합.
2. 2A~2D 브랜치 push → 보고(작업 전달 형식) → Claude 코드 리뷰 + 시연 검증(`verify`, 단독 dev 서버) → 병합.
3. 사용자/외부 테스터 폰 평가 → 피드백 반영 → Phase 3(PvP 친선) 지시서 발행.
