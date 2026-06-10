# DuelNight 운영 계획 (독립 환경)

작성일: 2026-06-10 | 작성: Claude | 대상: 멀티 AI 협업 체제 (Claude · Codex · Antigravity)

> 전제: 현 코드는 기초 단계. Lovable 서비스(duelnight.app)는 테스터 운영 중이므로 유지하고,
> 이 저장소에서 새 시스템을 병행 개발한 뒤 전환한다.

---

## 1. 서버 운영 제안

### 권장 구성 (추가 서버 구축 불필요 — 서버리스)

| 역할 | 서비스 | 근거 | 비용 |
|---|---|---|---|
| 앱 호스팅 (SSR+API) | **Cloudflare Workers** | 이미 코드가 Cloudflare용으로 설정됨(`wrangler.jsonc`). GitHub 연동 시 push마다 자동 배포 | 무료(10만 요청/일) → 성장 시 $5/월 |
| DB·로그인·스토리지·실시간 | **Supabase** (`nrtdhkjeziknmafauypv`) | 이미 스키마 이관 완료 | 무료 → 운영 본격화 시 Pro $25/월 (자동백업·복구 때문에 **정식 오픈 전 Pro 전환 권장**) |
| AI (코치·OCR·카드 가져오기) | **Google Gemini 직접 호출** | Lovable 게이트웨이 대체. 호출당 ~2원 (AI_GATEWAY_COST_SIMULATION.md) | 사용량 과금 |
| 도메인 | 병행 기간: `*.workers.dev` 또는 `beta.duelnight.app` → 전환 시 `duelnight.app` 이전 | 테스터 서비스와 충돌 없음 | — |

- **환경 2단계**: `main` push → 자동 배포(베타) / 운영 도메인 전환은 수동 승인 후. Cloudflare는 브랜치별 프리뷰 URL도 자동 생성.
- **모니터링**: Cloudflare 대시보드(트래픽/에러) + Supabase Logs/Advisors. 오류 추적 필요해지면 Sentry 무료 플랜 추가.
- **초기 비용 합계: 0원/월** (전부 무료 구간에서 시작 가능)
- ⚠️ **리전 결정 필요**: 현 Supabase가 뭄바이(ap-south-1). 한국 사용자 위주면 서울/도쿄로 재생성 권장 — **실데이터 이관 전인 지금이 마지막 적기** (스키마 재적용은 자동화되어 있어 부담 없음).

### 비권장
- 자체 VPS/EC2 운영: 1인 운영에 관리 부담 과다, 현 단계 이점 없음.
- Vercel: 가능하나 어댑터 교체 필요. Cloudflare 설정이 이미 있어 우회 이유 없음.

---

## 2. 기존 DB 이미지(스토리지) 이관

- 대상: 옛 Lovable Supabase `card-images` 버킷 (공개 버킷, 폴더: BTK-*, EB01, misc, user-uploads 등)
- **접근성 확인 완료**: 옛 anon 키로 목록·다운로드 가능(공개 읽기 정책) → 추가 키 불필요
- 방식: **재실행 가능한 동기화 스크립트** (`scripts/sync-from-lovable.ts`)
  1. 옛 버킷 재귀 목록 → 새 버킷과 비교 → 없는 파일만 복사 (증분)
  2. DB 행 데이터(카드·사용자 콘텐츠)도 같은 스크립트에서 테이블별 동기화 (FK 순서 준수)
  3. `cards.image_url` 등이 옛 프로젝트 URL을 가리키면 새 URL로 재작성
  4. 전환일에 마지막 1회 실행 → 최종 데이터 확보
- Auth 사용자(비밀번호 포함) 이관은 전환 직전에 별도 절차로 (테스터에게 재가입 안내가 가장 단순한 대안)

---

## 3. 실시간 화면 확인·테스트 워크플로우

| 상황 | 방법 |
|---|---|
| 코드 수정 즉시 확인 | `bun run dev` → **http://localhost:8080** (저장하면 자동 새로고침 — Lovable 옆창 프리뷰의 대체물) |
| 태블릿·폰에서 확인 | 같은 와이파이에서 터미널에 표시되는 **Network 주소**(예: `http://192.168.219.106:8080`) 접속 |
| AI가 직접 화면 검증 | Claude가 브라우저 도구로 앱을 띄워 스크린샷·클릭 테스트 후 결과 보고 (`verify`/`run`) |
| 외부 테스터 공유 | Cloudflare 연결 후 브랜치 프리뷰 URL 공유 |

- 참고: 프로젝트가 Google Drive 폴더에 있어 빌드·설치가 느림(예: 의존성 설치 15분). 코드는 git이 이미 보관하므로 **로컬 디스크(C:\dev 등)로 이동을 권장** — 체감 속도 수 배 개선. (이동 시 Claude가 처리 가능)

---

## 4. 멀티 플랫폼 (PC · 태블릿 · 앱)

**단계적 접근 권장 — 코드베이스 하나로 전부 커버:**

1. **[지금] 반응형 웹** — PC·태블릿·모바일 브라우저. 이미 반응형 기반(Tailwind) + `SIMULATOR_UI_RESPONSIVE_CHECKLIST.md` 존재. 터치 UX 점검 추가.
2. **[전환 시점] PWA** — "홈 화면에 추가"로 앱처럼 설치, 푸시 알림, 오프라인 캐시. 코드 수정 소폭, 비용 0, 스토어 심사 없음.
3. **[필요해지면] Capacitor 포장** — 같은 웹 코드를 iOS/Android 네이티브 앱으로 감싸 **앱스토어/플레이스토어 출시**. 별도 앱 개발 불필요.

- ❌ React Native 등 별도 앱 재작성은 비권장: 코드베이스가 2개가 되어 1인+AI 운영에 유지비 과다.

---

## 5. 멀티 AI 협업 규칙 (Claude · Codex · Antigravity)

- **공통 지침**: 세 도구 모두 `CLAUDE.md`를 따른다. Codex/Antigravity용 진입점으로 `AGENTS.md`가 `CLAUDE.md`를 가리킴.
- **git 규율 (충돌 방지의 핵심)**:
  - 작업 시작 전 반드시 `git pull` / 작업 종료 시 즉시 커밋·push
  - **두 도구가 동시에 같은 영역을 작업하지 않는다** (한 번에 한 도구 원칙, 또는 도구별 브랜치)
  - 커밋 메시지에 도구 표기 권장 (예: `feat: ... (codex)`)
- **검증 게이트 공통**: 커밋 전 `bun run build` 통과 필수. DB 변경은 `supabase/migrations/`에 SQL 보관.
- **비밀 관리**: `.env` 커밋 금지(히스토리에서 제거됨). 키는 `.env.local`/`.dev.vars`(gitignore)만.
- 역할 분담(제안, 사용자가 조정): Claude=설계·DB·보안·검증 / Codex=구현·리팩터링 / Antigravity=백그라운드 대량 작업·자동화
