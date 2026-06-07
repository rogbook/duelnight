# DB 작업 관리 규칙 (Lovable · Claude · Antigravity)

> 본 문서는 DuelNight 프로젝트에서 **데이터베이스(Supabase) 변경**을 다룰 때
> 세 도구(Lovable / Claude / Antigravity)가 어떻게 역할을 나누고 동기화하는지 정의합니다.
> 모든 DB 변경은 이 문서의 규칙을 따릅니다.

---

## 0. 한 줄 요약

- **DB(스키마·데이터·RLS·함수·트리거) = Lovable이 단독으로 관리·적용**
- **Claude / Antigravity = "적용할 SQL/마이그레이션을 작성해 사용자에게 전달"만 함**
- **앱 코드(프론트엔드, API 라우트, 컴포넌트, i18n 등) = Claude/Antigravity가 GitHub에 직접 커밋·푸시**

> 즉, **DB는 항상 한 곳(Lovable)에서만 실제로 변경**되고, 다른 두 도구는 SQL을 "준비"만 합니다.

---

## 1. 역할 분담 매트릭스

| 작업 종류 | Lovable | Claude | Antigravity |
|---|:---:|:---:|:---:|
| Supabase 스키마/RLS/함수/트리거 적용 | ✅ 단독 | ❌ | ❌ |
| 마이그레이션 SQL 초안 작성 | ✅ | ✅ | ✅ |
| `supabase/migrations/*.sql` 파일 커밋 | ✅ (자동) | ✅ (전달용) | ✅ (전달용) |
| `src/integrations/supabase/types.ts` 갱신 | ✅ 단독 (자동 재생성) | ❌ 수정 금지 | ❌ 수정 금지 |
| `src/integrations/supabase/client.ts` | ✅ 단독 | ❌ 수정 금지 | ❌ 수정 금지 |
| `.env` / lock 파일 / `supabase/config.toml`의 project_id | ✅ 단독 | ❌ 수정 금지 | ❌ 수정 금지 |
| 패키지 설치/제거 (`bun add` 등) | ✅ | ⚠️ 가능하나 Lovable 우선 | ⚠️ 가능하나 Lovable 우선 |
| 프론트엔드/컴포넌트/라우트/유틸 코드 | ⚠️ 가능 | ✅ 주력 | ✅ 주력 |
| 외부 API 연동, 결제, AI 로직 등 고도화 | ⚠️ 기본만 | ✅ | ✅ 주력 |
| 문서(`docs/*.md`) | ✅ | ✅ | ✅ |
| GitHub `main` 푸시 | ✅ (자동 sync) | ✅ | ✅ |

---

## 2. DB 변경 표준 절차

모든 DB 변경은 아래 4단계를 **반드시** 거칩니다.

### Step 1. 변경 요구 정리 (Claude 또는 Antigravity)

- 어떤 테이블/컬럼/RLS/함수를 왜 바꾸는지 한 문장으로 정리
- 영향 범위: 새 테이블인가, 기존 컬럼 추가인가, RLS 수정인가
- **파괴적 변경**(DROP COLUMN, DROP TABLE, RLS 완화 등)은 반드시 사용자에게 사전 확인

### Step 2. 마이그레이션 SQL 초안 작성 (Claude / Antigravity)

다음 산출물을 만듭니다.

1. **Lovable 채팅에 바로 붙여넣을 한국어 지시문 + SQL 블록**
2. (선택) repo에 기록용 파일 커밋: `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`
   - 실제 적용은 Lovable이 자기 마이그레이션 시스템으로 다시 수행하므로,
     이 파일은 **단일 진실(Source of Truth) 기록·리뷰용**입니다.

#### SQL 작성 체크리스트
- [ ] `CREATE TABLE public.*` 직후 `GRANT` 문 포함 (anon/authenticated/service_role)
- [ ] 새 테이블은 `ENABLE ROW LEVEL SECURITY` + 정책 명시
- [ ] 시간 의존 규칙은 CHECK 대신 트리거 사용
- [ ] `IF NOT EXISTS` / `IF EXISTS`로 멱등성 확보
- [ ] 기존 데이터/RLS/다른 테이블은 **건드리지 않음**을 명시
- [ ] `auth`, `storage`, `realtime`, `supabase_functions`, `vault` 스키마는 절대 수정 금지

### Step 3. Lovable에서 실제 적용 (사용자 + Lovable)

1. 사용자가 Step 2의 SQL/문구를 Lovable 채팅에 붙여넣음
2. Lovable이 마이그레이션 승인 요청 → 사용자 승인
3. Lovable이 DB에 적용하고 `src/integrations/supabase/types.ts` 자동 재생성
4. GitHub `main`에 자동 sync

### Step 4. 코드 정합성 작업 (Claude / Antigravity)

- Lovable 적용이 끝난 뒤 **fetch → pull**로 변경 가져오기
- 새 컬럼/테이블을 사용하는 프론트/API 코드 작업 (직접 커밋·푸시)
- 절대 `types.ts`를 수동으로 수정하지 않음 (Lovable이 다시 덮어씀)

---

## 3. Claude / Antigravity가 사용자에게 전달하는 표준 포맷

DB 변경이 필요할 때 다음 양식으로 출력합니다.

```markdown
### 🗄️ Lovable에 적용할 DB 변경

**목적**: <한 문장 요약>
**영향 범위**: <테이블/RLS/함수>
**파괴적 변경 여부**: 없음 / 있음(상세)

**Lovable 채팅에 그대로 붙여넣기:**

> 아래 마이그레이션을 적용해줘. 기존 데이터/RLS/다른 테이블은 건드리지 말 것.
>
> ```sql
> ALTER TABLE public.cards
>   ADD COLUMN IF NOT EXISTS extra jsonb;
> ```
>
> 적용 후 types.ts도 재생성해줘.
```

사용자는 이 블록을 복사 → Lovable 채팅에 붙여넣기만 하면 됩니다.

---

## 4. 동기화 워크플로우 (코드 작업 시 공통)

Claude와 Antigravity는 **항상** 다음 순서를 지킵니다.

```
[작업 시작]
  └─ git fetch
      └─ 원격 변경 있음? ──Yes──> git pull (rebase)
      └─                  ──No───> 계속
[작업 수행]
  └─ DB 변경 필요?
      ├─ Yes → §2 Step 2~3 따라 Lovable에 위임, 완료까지 대기
      └─ No  → 코드만 수정
[작업 종료]
  └─ git push (main)
```

**금지 사항**
- Lovable이 DB 적용 중일 때 동일 영역의 마이그레이션 파일을 동시에 푸시
- `types.ts`, `client.ts`, `.env`, lock 파일, `supabase/config.toml`의 `project_id` 수정
- Supabase Dashboard에서 직접 SQL 실행 (단일 진실 깨짐)

---

## 5. 도구별 진입점 요약

### Lovable
- 진입: 브라우저 에디터 채팅
- 권한: **DB + 코드 모두 적용 가능** (그러나 본 규칙에서는 DB 전담)
- 산출: 마이그레이션 적용, `types.ts` 재생성, GitHub auto-sync

### Claude (본 채팅)
- 권한: 로컬/원격 코드 직접 수정 + GitHub 커밋
- DB 작업: SQL **작성만**, 적용은 사용자에게 위임
- 산출: 코드 PR/커밋, Lovable에 붙여넣을 SQL 블록, 문서 업데이트

### Antigravity
- 권한: 에이전트 기반 코드 리팩토링·고도화, GitHub 커밋
- DB 작업: SQL **작성만**, 적용은 사용자에게 위임
- 산출: 코드 리팩토링, 외부 API 연동, 백그라운드 자동화

---

## 6. 예시 시나리오

### 예시 A. 컬럼 추가 (`cards.extra jsonb`)
1. Claude/Antigravity: §3 포맷으로 SQL 블록 출력
2. 사용자: Lovable 채팅에 붙여넣기 → 승인
3. Lovable: 마이그레이션 적용 + `types.ts` 재생성 + GitHub sync
4. Claude/Antigravity: `git pull` 후 새 `extra` 필드 사용하는 UI/폼 코드 작성·푸시

### 예시 B. RLS 정책 보강
1. Claude/Antigravity: 보안 스캔 결과 + 수정 SQL 정리
2. 사용자: Lovable에 SQL 전달 → 승인
3. Lovable: 정책 적용
4. Claude/Antigravity: 영향받는 쿼리 동작 확인, 필요 시 클라이언트 코드 보정

### 예시 C. 순수 UI 수정
- DB 변경 없음 → Claude/Antigravity가 단독으로 처리 (fetch → 수정 → push)

---

## 7. 위반 시 발생하는 문제

| 위반 | 결과 |
|---|---|
| `types.ts` 수동 수정 | 다음 Lovable 적용 시 덮어쓰기, 머지 충돌 |
| Antigravity가 Supabase Dashboard에서 직접 SQL 실행 | repo migration과 실DB 불일치, 다른 도구가 깨짐 |
| 동시에 두 곳에서 DB 변경 | 마이그레이션 충돌, 데이터 손실 위험 |
| `.env`/lock 파일 수동 변경 | Lovable 빌드 실패 |

---

## 8. 관련 문서

- [`docs/COLLABORATION_GUIDE.md`](./COLLABORATION_GUIDE.md) — Lovable↔Antigravity 협업 전반
- [`docs/DEPLOY_PROCESS.md`](./DEPLOY_PROCESS.md) — Preview/Published 2단계 배포
- [`docs/ENVIRONMENT_SEPARATION_PLAN.md`](./ENVIRONMENT_SEPARATION_PLAN.md) — 향후 Staging/Production 분리 로드맵

---

_최종 갱신: 2026-06-07_
