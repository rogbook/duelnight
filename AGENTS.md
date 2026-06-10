# AGENTS.md — DuelNight 멀티 AI 작업 지침서 (단일 기준 문서)

> **적용 대상: Claude · Codex · Antigravity 전부.** 이 문서가 역할·절차의 단일 기준이다.
> 코드 품질·검증 체크리스트는 [CLAUDE.md](./CLAUDE.md) §1~2를 모든 도구가 동일하게 적용한다.
> 운영 방향(서버·이관·테스트·플랫폼)은 [docs/OPERATIONS_PLAN.md](./docs/OPERATIONS_PLAN.md) 참고.

---

## 0. 저장소 기본 사실

- 이 저장소(`rogbook/duelnight`)는 **Lovable과 동기화되지 않는 독립 저장소**다. 테스터 운영 중인 Lovable 서비스(duelnight.app)와 별개이며, Lovable 쪽 수정은 여기서 하지 않는다.
- **2026-06-10에 보안 사고(.env 유출)로 전체 히스토리가 재작성(force push)되었다.**
  → **그 이전에 만든 클론·브랜치는 전부 폐기하고 새로 클론할 것.** 옛 클론 기반의 push/PR은 유출 키를 부활시키므로 절대 금지.
- DB: 사용자 소유 Supabase `nrtdhkjeziknmafauypv` (ap-south-1)
- 런타임/패키지: **bun** (`bun install`, `bun run dev`, `bun run build`)

## 1. 역할 분담 (2026-06-10 사용자 확정)

| 도구 | 기본 책임 | 주요 산출물 |
|---|---|---|
| **Claude** | 서버 아키텍처 · DB/RLS/마이그레이션 설계·적용 · 보안 검토 | 설계 문서, migration SQL, 위험 분석 |
| **Codex** | 이미지 이전 스크립트 · Git 관리 · 빌드/자동 테스트 · 브라우저 검증 | 코드, 테스트, 스크립트, 검증 리포트 |
| **Antigravity** | PC·태블릿·모바일 UI · 사용성 점검·개선 | 반응형 UI, 화면 개선, UX 리포트 |

역할은 "기본 책임"이며 고정 권한이 아니다. 단, **다른 역할 영역을 건드릴 땐 아래 인터페이스 규칙을 따른다.**

### 영역 간 인터페이스 (충돌 방지의 핵심)

- **DB 스키마·RLS·키 관련 변경은 Claude만 실행한다.** Codex/Antigravity가 컬럼·테이블·정책이 필요하면 코드를 직접 바꾸지 말고 "Claude에게 요청"으로 남긴다.
- 보안에 닿는 코드(키 사용, 인증, 결제, 외부 fetch)는 완성 후 **Claude의 보안 검토 1회**를 거친다.
- UI 컴포넌트·화면 파일의 대량 변경은 Antigravity 영역 — 다른 도구는 버그 수정 등 최소 변경만.

## 2. 작업 절차 (모든 도구 공통, 순서 엄수)

1. **시작 전 `git pull`** — 다른 도구의 최신 작업을 반드시 받는다.
2. **한 작업 = 한 도구.** 같은 작업·같은 파일 영역을 두 도구가 동시에 작업하지 않는다. (사용자가 같은 명령을 여러 도구에 주더라도, 자기 역할 밖이면 구현하지 말고 의견만 답한다)
3. 작업 단위가 크면 **브랜치**를 만들고, 작으면 main에서 진행.
4. **커밋 전 `bun run build` 통과 필수.** 실패 시 커밋 금지.
5. 커밋 메시지 끝에 **도구 태그**: `(claude)` / `(codex)` / `(antigravity)`
6. **종료 시 즉시 커밋·push** — 미커밋 상태로 방치하지 않는다 (다음 도구가 덮어쓸 수 있음).
7. 의미 있는 작업은 `docs/`에 기록 + 아래 **작업 전달 형식**으로 마무리 보고:

```text
목표:
담당 에이전트:
변경 파일:
DB 변경 여부: (있으면 Claude 요청 사항 명시)
실행한 검사: (build/테스트 등)
남은 위험 또는 후속 작업:
```

## 3. 보안 규칙 (위반 시 즉시 작업 중단 사유)

- **`.env` 파일 커밋 절대 금지.** 모든 키는 `.env.local` / `.dev.vars` (gitignore됨)에만. 양식은 [.env.example](./.env.example).
- 관리자 키 환경변수는 **`SUPABASE_SERVICE_ROLE_KEY` 하나만 사용** (신형 `sb_secret_...` 키도 이 자리에 그대로). `SUPABASE_SECRET_KEY` 변수를 코드에 추가하지 말 것.
- 키·시크릿 값을 코드, 문서, 커밋 메시지, 로그 출력에 쓰지 않는다.
- 기존 Lovable DB(`tgybttphkmesgfbtgftt`)는 테스터 운영 중인 **원본** — 읽기(이관용)만 허용, 쓰기·삭제 금지.

## 4. 현재 진행 중인 핸드오프 (2026-06-10 기준)

| 작업 | 담당 | 상태 |
|---|---|---|
| 이미지 이관 스크립트 완성·실행 | **Codex** | Antigravity가 작성한 초안 `scripts/migrate-images.ts` 인수. 옛 버킷 → 새 버킷 증분 복사 + `cards.image_url` 재작성. 완료 후 Claude 보안 검토 |
| DB 행 데이터 동기화 스크립트 (옛 DB→새 DB, 재실행 가능) | **Claude** | 설계 예정 |
| 반응형/터치 UX 전수 점검 (PC·태블릿·모바일) | **Antigravity** | `docs/MULTI_DEVICE_APP_GUIDE.md`, `SIMULATOR_UI_RESPONSIVE_CHECKLIST.md` 기준 |
| Cloudflare 배포 연결 | Claude(설계) + 사용자(계정 연결) | 대기 |

- ⚠️ **Codex 전용 선행 조건**: 기존 클론은 옛 히스토리(유출 포함)이므로 **삭제 후 재클론**. 기존 `codex/*` 원격 브랜치는 정리됨.

## 5. 참고 문서

- [docs/OPERATIONS_PLAN.md](./docs/OPERATIONS_PLAN.md) — 운영 방향 결정사항 (서버·비용·플랫폼 전략)
- [docs/DEPLOY_PROCESS_INDEPENDENT.md](./docs/DEPLOY_PROCESS_INDEPENDENT.md) — 독립 배포 상세 가이드
- [docs/IMAGE_MIGRATION_GUIDE.md](./docs/IMAGE_MIGRATION_GUIDE.md) — 이미지 이관 상세
- [docs/REALTIME_TESTING_GUIDE.md](./docs/REALTIME_TESTING_GUIDE.md) — 실시간 테스트 환경
- [docs/MULTI_DEVICE_APP_GUIDE.md](./docs/MULTI_DEVICE_APP_GUIDE.md) — PWA/Capacitor 멀티 디바이스
- [docs/SUPABASE_MIGRATION_LOG.md](./docs/SUPABASE_MIGRATION_LOG.md) — 스키마 이관 기록
