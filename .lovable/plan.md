# duelnight 2단계 배포 운영 셋업 (Preview = 테스트, Published = 실운영)

## 핵심 구조

```text
[개발자 / Lovable 편집]
        │ 코드 푸시 (자동)
        ▼
┌──────────────────────────┐
│  Preview URL (테스트 서버) │  ← 관리자들이 검증
│  id-preview--…lovable.app│  ← 항상 최신 빌드 즉시 반영
└──────────┬───────────────┘
           │ 검증 OK → Publish 버튼
           ▼
┌──────────────────────────┐
│  Published URL (실운영)   │  ← 실사용자
│  duelnight.app     │  ← Publish 눌러야 갱신
└──────────────────────────┘

⚠ 백엔드(Cloud DB/Auth/Storage)는 두 환경이 공유
   → 데이터 보호 장치를 코드/운영 규칙으로 보완
```

## 1. Preview를 "테스트 서버"로 운영하는 규칙

### 1-1. 접근 제어
- **Publish 가시성은 `public` 유지** (실사용자용 도메인은 누구나 접근).
- **Preview URL은 Lovable 워크스페이스 멤버에게만 공개** (현재 기본 동작). 관리자만 워크스페이스에 초대하면 자동으로 테스트 권한이 됨.
- 외부 관리자(워크스페이스 멤버 아님)에게는 **Share → Share preview**로 7일짜리 공개 링크 발급.

### 1-2. "여기는 테스트입니다" 시각적 표시
- `import.meta.env.MODE` 또는 `window.location.hostname` 기반으로 Preview일 때 상단에 **노란 배너**(`⚠ 테스트 환경 — 실데이터에 영향 갈 수 있음`)를 띄움.
- `src/components/app-sidebar.tsx` 헤더 옆 Admin 배지 옆에 환경 배지(STAGING/PROD) 추가.

## 2. 백엔드 공유로 인한 위험 완화

Preview와 Published가 같은 Cloud DB를 보기 때문에, **테스트 행위가 실데이터를 오염시키지 않도록** 다음을 추가:

### 2-1. 테스트 데이터 격리 컬럼
주요 사용자 작성 테이블(`matches`, `decks`, `lfg_posts` 등)에 `is_test BOOLEAN DEFAULT false` 컬럼 추가.
- Preview 환경에서 생성되는 모든 레코드는 `is_test = true`로 저장.
- 실사용자 화면(Published) 쿼리는 `WHERE is_test = false`로 필터.
- 관리자 페이지에는 "테스트 데이터 보기" 토글.

### 2-2. 파괴적 작업 가드
- 카드 DB 일괄 삭제/대량 수정 같은 위험 작업은 **Published 환경에서만 차단되는 confirm 단계**가 아니라, 항상 "운영 데이터에 영향" 경고 + 관리자 비밀번호 재입력.
- 마이그레이션(스키마 변경)은 영향 큰 경우 미리 공지 + 점검 시간 활용.

### 2-3. 결제/외부 연동 키 분리
- Stripe/PG 등은 `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_LIVE`를 둘 다 Secrets에 저장.
- 서버 함수에서 `process.env.NODE_ENV` 또는 요청 origin으로 분기.

## 3. 운영 DB 스냅샷 → 로컬 검증용 복제 워크플로

> 같은 Cloud를 쓰므로 "스냅샷 복제"는 **별도 staging DB**가 아니라 **로컬/임시 환경에서 데이터를 검증**하는 용도로 사용합니다. (방식 B 한계)

### 3-1. 정기 백업
- Cloud → Database → Tables에서 매주 CSV export (또는 `pg_dump` via Antigravity 로컬).
- `/mnt/documents/backups/duelnight-YYYY-MM-DD.sql` 형식 보관.

### 3-2. 마이그레이션 사전 검증 절차
1. Antigravity에서 로컬 Supabase 인스턴스 띄우기.
2. 최신 prod 스냅샷 import.
3. 새 마이그레이션 SQL을 로컬에서 먼저 실행 → 에러/데이터 손상 확인.
4. 문제 없으면 Lovable에서 `supabase--migration` 도구로 실 적용.

### 3-3. PII 마스킹
- 스냅샷을 외부 관리자에게 공유할 때는 `profiles.email`, `auth.users` 정보 마스킹 스크립트 (`scripts/anonymize-snapshot.ts`) 작성.

## 4. 배포 절차 (운영 룰)

```text
[1] 개발 작업 (Lovable 또는 Antigravity)
      ↓
[2] GitHub main에 머지 → Preview 자동 빌드
      ↓
[3] 관리자 테스트 (Preview URL)
    - 체크리스트: 카드 등록, 덱빌더, 매칭, 결제 sandbox
    - is_test=true로 데이터 생성/삭제
      ↓
[4] 통과 → Lovable에서 "Publish" 클릭
      ↓
[5] 실사용자에게 반영 (duelnight.app)
      ↓
[6] 릴리스 노트 작성 (docs/RELEASES.md)
```

### 체크리스트 문서
- `docs/QA_CHECKLIST.md` 신규 작성: Publish 전 관리자가 Preview에서 확인할 항목 표준화.
- `docs/RELEASES.md`: 배포 일자 / 변경 요약 / 롤백 방법.

## 5. 롤백 전략

- **프론트엔드 롤백**: Lovable 버전 히스토리에서 이전 빌드 선택 → Publish.
- **DB 롤백**: 마이그레이션은 항상 reversible하게 작성 (UP/DOWN). 직전 스냅샷으로 복구 가능하게 보관.

---

## 구현 작업 목록 (다음 빌드 모드에서 수행)

1. **환경 배너 컴포넌트** 추가 (`src/components/env-badge.tsx`) — Preview면 상단 띄움.
2. **`is_test` 컬럼 마이그레이션** — 핵심 테이블에 추가 + 기본 쿼리 필터 적용.
3. **관리자용 "테스트 데이터 보기" 토글** — 관리자 콘솔에 추가.
4. **`docs/DEPLOY_PROCESS.md`** 신규 — 위 4번 절차 + 체크리스트.
5. **`docs/QA_CHECKLIST.md`** — 카드/덱/매칭/결제/공지 핵심 플로우 항목.
6. **`docs/RELEASES.md`** 템플릿 + 첫 항목.
7. **`scripts/anonymize-snapshot.ts`** — PII 마스킹 스크립트 스켈레톤.
8. **`mem://workflow/deployment`** 메모리 저장 — 향후 AI 작업 시 자동 준수.

## 기술 메모

- Preview/Published 구분은 `import.meta.env.DEV`가 아니라 `window.location.hostname.includes('id-preview')`로 판단 (Published 빌드도 production mode).
- `is_test` 필터는 RLS 정책에 직접 넣는 것보다 **쿼리 레이어**(클라이언트 훅)에서 처리 권장 — 관리자가 테스트 데이터도 보려면 토글 가능해야 하므로.
- Lovable Cloud는 단일 인스턴스이므로 부하 분리는 불가. Preview에서 부하 테스트 금지.

## 한계 및 향후 승격 경로

방식 B는 **데이터/스키마는 완전 격리가 안 됩니다**. 사용자/매출이 일정 규모를 넘으면 방식 A(프로젝트 2개) 승격을 권장합니다. 그때까지의 가드레일이 이 계획의 핵심입니다.
