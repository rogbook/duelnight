# duelnight 배포 운영 절차

> 본 문서는 **개발 → 테스트(Preview) → 실운영(Published)** 2단계 배포 워크플로를 정의합니다.
> 과거 협업 절차는 `docs/COLLABORATION_GUIDE.md`에 보관되어 있습니다. 신규 작업은 `docs/CODEX_WORKFLOW.md`를 우선합니다.

> **전환 공지(2026-06-09):** 앞으로 Lovable에서는 신규 작업·Publish를 진행하지 않습니다. 아래 내용은 기존 운영 이력으로 보관하며, 새 배포 환경 전환 기준은 `docs/CODEX_WORKFLOW.md`, `docs/LOVABLE_HANDOFF.md`, `docs/INDEPENDENCE_GUIDE.md`를 우선합니다.

---

## 환경 구조

| 환경 | URL | 갱신 방식 | 접근 권한 |
|------|-----|----------|----------|
| **Preview (테스트)** | `id-preview--91f6cdde-…lovable.app` | 코드 변경 시 자동 빌드 | 워크스페이스 멤버 (관리자 전용) |
| **Published (실운영)** | `duelnight.app` | Lovable **Publish** 버튼 클릭 시에만 | 누구나 |

⚠ **백엔드(Cloud DB / Auth / Storage)는 두 환경이 공유합니다.**
→ Preview에서 한 마이그레이션·삭제 작업은 실 데이터에 즉시 반영됩니다.
→ 가드레일은 운영 규칙과 코드 양쪽에서 함께 지켜야 합니다.

---

## 표준 배포 사이클

```text
[1] 개발/수정 (Lovable 또는 Antigravity)
        ↓
[2] GitHub main 브랜치에 머지 (양방향 자동 동기화)
        ↓
[3] Preview URL에서 관리자 QA  ─── docs/QA_CHECKLIST.md
        ↓
[4] 통과 → Lovable에서 "Publish" 클릭
        ↓
[5] 실사용자에게 반영 (duelnight.app)
        ↓
[6] docs/RELEASES.md 에 변경 내역 기록
```

### 단계별 책임자
- **[1]~[2]** 개발자
- **[3]** 운영 관리자 (관리자 권한 보유 멤버)
- **[4]** 릴리스 매니저 (지정된 관리자 1인)
- **[6]** 릴리스 매니저

---

## 운영 규칙

### Publish 전 필수 체크
1. `docs/QA_CHECKLIST.md` 의 모든 항목 통과
2. 콘솔/네트워크 에러 0건
3. DB 마이그레이션이 포함된 변경이면 → **마이그레이션 사전 검증**(아래) 완료
4. 외부 결제·연동 키 변경이 있으면 → Secrets에서 LIVE 키 적용 확인
5. **Lovable 관리 파일 무결성** → `src/integrations/supabase/*`, `routeTree.gen.ts`, lock 파일이 수동 수정되지 않았는지 확인 (`docs/COLLABORATION_GUIDE.md` §4)
6. **서버 Secrets 확인** → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 Lovable Secrets에 설정됨 (미설정 시 서버 함수 런타임 throw, `COLLABORATION_GUIDE.md` §7)
7. **퍼블리싱 불변식 보존** → `start.ts`의 `functionMiddleware: [attachSupabaseAuth]`, `__root.tsx`의 `onAuthChange` 무효화 로직이 유지됨 (`COLLABORATION_GUIDE.md` §4-1)
8. **로그인 회귀 점검** → 로그인 후 `/stores` 이동·새로고침 시 로그인 상태가 풀리지 않는지 확인 (2026-06-02 핫픽스 회귀 방지)

### 마이그레이션 사전 검증
1. Antigravity에서 로컬 Supabase 인스턴스 기동
2. 최신 운영 스냅샷(`/mnt/documents/backups/duelnight-YYYY-MM-DD.sql`) import
3. 새 마이그레이션 SQL 실행 → 오류·데이터 손상 점검
4. 문제 없으면 Lovable `supabase--migration` 도구로 실 적용
5. 적용 직후 Preview에서 기능 동작 재확인

### 정기 백업
- **주기**: 매주 1회 (월요일 오전 권장)
- **방법**: Cloud → Database → Tables → Export, 또는 Antigravity에서 `pg_dump`
- **보관 위치**: `/mnt/documents/backups/duelnight-YYYY-MM-DD.sql`
- **보존**: 최소 4주

### PII 마스킹
스냅샷을 외부 관리자/개발자에게 공유할 때는 반드시 `scripts/anonymize-snapshot.ts`(추후 작성 예정)로 다음 컬럼을 마스킹:
- `profiles.username`, `profiles.display_name`
- `auth.users.email`
- `payments.imp_uid`, `payments.receipt_url`

---

## 롤백

### 프론트엔드 롤백
1. Lovable → 우상단 버전 히스토리
2. 정상 동작 시점 선택 → "Restore"
3. 곧바로 **Publish** 클릭

### 백엔드 롤백
- 마이그레이션은 항상 **reversible**하게 작성 (UP/DOWN SQL 둘 다 PR에 첨부)
- 데이터 손상 시 직전 백업 스냅샷으로 복구

---

## 한계 및 향후 승격

현재 방식은 **단일 Cloud 백엔드**를 공유하므로 다음 한계가 있습니다:

- 스키마 변경의 격리가 불가능
- 부하 테스트 시 실사용자 영향 가능
- 결제 연동을 두 환경이 동일 키로 사용할 위험

사용자/매출이 일정 규모를 넘으면 **별도 Lovable 프로젝트(duelnight-staging)** 를
생성해 백엔드까지 완전 분리하는 방식으로 승격하세요. 그때까지는 본 문서의
가드레일을 엄격히 준수하는 것이 곧 운영 안정성입니다.
