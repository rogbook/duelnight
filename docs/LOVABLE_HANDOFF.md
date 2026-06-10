# Lovable 작업 정리 및 독립 전환 메모

작성일: 2026-06-09
상태: **Lovable은 신규 작업 도구에서 제외**합니다. 또한 기존 협업 도구 분담 방식은 중단하고, 앞으로의 개발·배포·DB 운영은 Codex 중심 새 환경에서 진행합니다.

---

## 1. 결정 사항

DuelNight는 Lovable로 만든 기존 산출물을 참고 자료로 보관하되, **새 기능 개발·DB 변경·배포를 Lovable에서 계속 진행하지 않습니다.**

운영자가 이해하기 쉽게 말하면 다음과 같습니다.

- Lovable은 지금까지 “초기 제작 도구” 역할을 했습니다.
- 이제부터는 Lovable을 “작업 도구”가 아니라 “기존 이력”으로만 봅니다.
- 새 환경이 완전히 준비되기 전까지는 기존 코드를 함부로 삭제하지 않고, 의존성을 하나씩 확인하며 안전하게 교체합니다.

---

## 2. Lovable로 진행했던 주요 범위

| 범위 | Lovable에서 맡았던 역할 | 새 환경에서 필요한 대체 항목 |
|------|--------------------------|-------------------------------|
| 화면/라우팅 | React/TanStack 기반 화면 초안 생성 | 로컬 개발 환경 + GitHub PR 기준 개발 |
| 인증 | Lovable Cloud Auth 래퍼와 Supabase Auth 연결 | Supabase Auth 직접 연결 또는 새 인증 방식 확정 |
| DB/스토리지 | Supabase 프로젝트, RLS, Storage 연결 | 별도 Supabase 프로젝트와 마이그레이션 관리 |
| AI 기능 | Lovable AI Gateway를 통한 Gemini 호출 | Google Gemini API 키 직접 호출 |
| 미리보기 | Lovable Preview URL | 로컬 `npm run dev` 또는 새 Preview 배포 환경 |
| 운영 배포 | Lovable Publish 흐름 | Cloudflare/Vercel 등 새 배포 파이프라인 |
| 시크릿 | Lovable Secrets | 새 호스팅 환경의 Environment Variables |

---

## 3. 저장소에 남아 있는 Lovable 흔적

아래 항목은 **바로 삭제하지 말고** 새 대체 구현이 준비된 뒤 제거합니다. 이유는 로그인, AI, 배포, 환경 변수에 직접 연결되어 있어 성급히 지우면 앱이 깨질 수 있기 때문입니다.

| 위치 | 현재 의미 | 처리 방향 |
|------|-----------|-----------|
| `src/integrations/lovable/index.ts` | Lovable Auth 래퍼 | 새 인증 방식 확정 후 제거 |
| `@lovable.dev/cloud-auth-js` | Lovable Auth 패키지 | 로그인 교체 후 제거 |
| `@lovable.dev/vite-tanstack-config` | Lovable/TanStack 빌드 설정 패키지 | 새 빌드 설정 확정 후 제거 여부 판단 |
| `src/routes/api/card-ocr.ts` | Lovable AI Gateway 호출 | Gemini 직접 호출로 교체 |
| `src/routes/api/card-import.ts` | Lovable AI Gateway 호출 | Gemini 직접 호출로 교체 |
| `src/routes/api/coach.ts` | Lovable AI Gateway 호출 | Gemini 직접 호출로 교체 |
| `src/integrations/supabase/*` | Lovable 환경 기준 안내 문구 포함 | 새 환경 변수 안내 문구로 교체 |
| 문서의 Lovable 배포/DB 절차 | 과거 운영 절차 | 새 운영 절차로 개정 또는 보관 처리 |

---

## 4. 당장 지켜야 할 원칙

새 환경 전환이 완료될 때까지 아래 원칙을 지킵니다.

1. **Lovable에서 새 작업을 시작하지 않습니다.**
   - 새 기능, UI 수정, DB 변경, 배포 모두 GitHub 기준으로 관리합니다.
2. **Lovable Publish를 운영 배포 수단으로 사용하지 않습니다.**
   - 새 배포 파이프라인이 확정될 때까지 운영 배포는 별도 승인 후 진행합니다.
3. **DB 변경을 Lovable에 위임하지 않습니다.**
   - 앞으로 DB 변경은 SQL 마이그레이션 파일/절차로 남기고, 새 Supabase 환경에서 적용합니다.
4. **기존 Lovable 의존 코드는 한 번에 제거하지 않습니다.**
   - 인증, AI, 배포처럼 앱 실행에 중요한 부분부터 대체 구현을 만든 뒤 제거합니다.
5. **변경은 작게 나누어 검증합니다.**
   - “로그인 교체”, “AI 교체”, “배포 교체”를 각각 독립 작업으로 진행합니다.

---

## 5. 새 환경 전환 순서

추천 순서는 다음과 같습니다.

1. **로컬 개발 환경 고정**
   - Node 버전, 패키지 매니저, 설치 명령, 실행 명령을 확정합니다.
   - 현재 `package.json`과 lock 파일 동기화 문제를 먼저 정리합니다.
2. **새 Supabase 프로젝트 준비**
   - 테이블, RLS, 함수, Storage를 새 프로젝트로 복제합니다.
   - 운영 데이터 이전 여부와 사용자 Auth 이전 방식을 결정합니다.
3. **인증 교체**
   - Lovable Auth 래퍼를 걷어내고 Supabase Auth 직접 호출로 전환합니다.
4. **AI Gateway 교체**
   - Lovable AI Gateway 호출을 Google Gemini 직접 호출로 교체합니다.
5. **새 Preview/Production 배포 구성**
   - Cloudflare 또는 Vercel 중 하나로 Preview와 Production을 분리합니다.
6. **Lovable 의존성 제거**
   - 새 환경 검증이 끝난 뒤 패키지, import, 문서의 Lovable 의존을 제거합니다.

---

## 6. 다음 작업 카드 후보

새 프로젝트 보드에 아래 작업을 우선 등록하는 것을 권장합니다.

### P0 후보
- `package.json`과 lock 파일 동기화
- Node 버전 기준 확정
- 새 환경 변수 목록 확정

### P1 후보
- Supabase 새 프로젝트 생성 및 스키마 복제 계획 작성
- Lovable Auth 제거 전 영향 범위 조사
- Lovable AI Gateway 제거 전 영향 범위 조사
- 새 Preview 배포 환경 선택 및 설정

### P2 후보
- 기존 Lovable 관련 문서 정리
- 배포/QA 문서를 새 환경 기준으로 재작성
- 운영자용 새 환경 실행 가이드 보강

---

## 7. 관련 문서

- `docs/CODEX_WORKFLOW.md` — 앞으로 Codex 중심으로 작업을 요청·검증·커밋하는 기준
- `docs/INDEPENDENCE_GUIDE.md` — Lovable 없이 개발·배포·DB 운영으로 전환하는 큰 흐름
- `docs/PROJECT_MANAGEMENT.md` — 앞으로의 작업 관리 기준
- `docs/DEPLOY_PROCESS.md` — 기존 배포 절차 문서. 새 환경 확정 후 개정 필요
- `docs/DB_WORKFLOW.md` — 기존 DB 작업 규칙 문서. Lovable 제외 원칙에 맞게 개정 필요
