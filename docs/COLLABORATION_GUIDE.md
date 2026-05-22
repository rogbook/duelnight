# TCG Hub 협업 개발 가이드 — Lovable + Antigravity + Claude

> **최종 수정**: 2026-05-22
> **적용 대상**: 프로젝트에 참여하는 모든 도구와 개발자
>
> 이 문서는 **Lovable**(UI/프로토타이핑) · **Antigravity**(로직/리팩토링) · **Claude Cowork**(분석/버그수정/문서화)
> 세 도구가 충돌 없이 협력하기 위한 표준 워크플로우를 정의합니다.
> GitHub를 중심 허브로 삼아 모든 변경이 공유됩니다.

---

## 1. 각 도구의 역할 정의

| 도구 | 주요 역할 | 하지 말아야 할 것 |
|------|----------|-----------------|
| **Lovable** | UI 컴포넌트 생성, Supabase 스키마/RLS/마이그레이션, 패키지 추가, 배포(Publish) | 복잡한 비즈니스 로직 직접 구현, 서버 함수 대규모 수정 |
| **Antigravity** | 복잡한 알고리즘 구현, 대규모 리팩토링, 로컬 디버깅, 단위 테스트 작성 | Lovable 관리 파일 수정 (아래 목록 참고), 무단 패키지 추가 |
| **Claude Cowork** | 버그 분석·수정, 코드 리뷰, 보안 취약점 탐지, 문서 작성·갱신 | DB 스키마 직접 변경, 배포(Publish) 직접 실행 |

### 각 도구별 강점 요약

```
Lovable      → 빠른 UI 생성 + Supabase 자동 연동
Antigravity  → 에디터 수준의 정밀 코딩 + 멀티파일 리팩토링
Claude       → 전체 코드베이스 분석 + 버그 탐지 + 문서 자동화
```

---

## 2. 협업 흐름도 (표준 개발 사이클)

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub (main)                          │
│          ↑ push/PR          ↑ push/PR        ↑ push/PR     │
│          │                  │                │              │
│    [Lovable]          [Antigravity]       [Claude]          │
│  UI · DB · 배포       로직 · 테스트      분석 · 수정 · 문서   │
└─────────────────────────────────────────────────────────────┘
                              ↓ Publish
                      duelnight.app (실운영)
```

### STAGE 1 — Lovable: 기초 개발 및 UI 프로토타이핑

> 새 기능의 시작점. 빠른 UI 구현과 DB 구조 정의.

- 새 페이지·컴포넌트 생성 (React + Tailwind)
- Supabase 테이블 · RLS 정책 · Edge Function 관리
- npm/bun 패키지 추가 (lock 파일 무결성 유지)
- 디자인 토큰 (`styles.css`, Tailwind config) 정의
- 작업 완료 후 **GitHub에 자동 Push** → 다른 도구가 pull 가능

### STAGE 2 — Antigravity: 정밀 개발 및 로직 구현

> Lovable이 만든 UI 위에 복잡한 비즈니스 로직 추가.

**시작 전 필수 체크:**
```bash
git checkout main
git pull origin main        # Lovable 변경분 반드시 동기화
git checkout -b feature/<작업명>
```

**주요 작업:**
- 복잡한 알고리즘 구현 (통계 계산, 데이터 처리 등)
- 대규모 리팩토링 및 단위 테스트 작성
- 로컬 개발 환경에서 정밀 디버깅
- 서버 함수(TanStack Server Functions) 고도화

**완료 후:**
```bash
git add .
git commit -m "feat: 작업 내용 요약"
git push origin feature/<작업명>
# GitHub에서 PR 생성 → main 머지
```

### STAGE 3 — Claude Cowork: 분석·수정·문서화

> 코드베이스 전반 분석, 버그 탐지 및 수정, 문서 최신화.

**투입 시점:**
- 기능 구현 후 배포 전 버그 검토 요청 시
- 보안/성능 이슈 발생 시
- 문서 갱신이 필요할 때

**주요 작업:**
- 전체 코드 정적 분석 → 버그 리스트 도출
- Critical/High 버그 즉시 수정 (직접 파일 편집)
- `docs/BUGFIX_LOG.md` 수정 이력 기록
- `docs/RELEASES.md` 릴리스 노트 갱신
- 협업 문서(`COLLABORATION_GUIDE.md` 등) 최신화

**완료 후:**
- 수정된 파일 목록과 이유를 `docs/BUGFIX_LOG.md`에 기록
- 로컬에서 `git pull` → `git push`로 GitHub 반영

### STAGE 4 — Lovable: 최종 검증 및 배포

> QA 통과 후 실운영 배포.

- Preview URL에서 전체 기능 QA (`docs/QA_CHECKLIST.md` 기준)
- UI 미세 조정 (Visual Edits)
- 이상 없으면 **Publish** 버튼으로 실운영 반영
- `docs/RELEASES.md`에 릴리스 노트 추가

---

## 3. 충돌 방지 핵심 원칙

### 황금률: "한 번에 한 곳에서만 같은 파일을 수정"

- **동시 편집 금지**: 같은 파일을 두 도구가 동시에 수정하면 충돌 발생
- **전환 전 반드시 push**: 도구를 바꾸기 전에 작업 내용을 GitHub에 반영
- **시작 전 반드시 pull**: 어떤 도구든 작업 시작 전 최신 코드 동기화

### 도구 전환 체크리스트

```
Lovable → Antigravity:  Lovable에서 모든 변경이 GitHub에 Sync됐는지 확인 후 git pull
Lovable → Claude:       위와 동일
Antigravity → Lovable:  git push 완료 확인 + PR 머지 후 전환
Antigravity → Claude:   git push 완료 확인
Claude → Lovable:       Claude 수정사항 commit+push 완료 확인
Claude → Antigravity:   위와 동일
```

### 충돌 발생 시 우선순위

```
자동생성 파일 (types.ts, routeTree.gen.ts 등)  → Lovable 버전 우선
비즈니스 로직 파일                              → 최신 커밋 기준 수동 머지
문서 파일 (docs/*.md)                          → 두 버전 내용 합산 후 수동 머지
```

---

## 4. Lovable 관리 파일 — 수정 금지 목록

아래 파일은 Lovable이 자동 관리합니다. Antigravity와 Claude는 **절대 수정하지 마세요.**

| 파일 | 이유 |
|------|------|
| `src/integrations/supabase/types.ts` | Supabase 스키마 자동 생성 |
| `src/integrations/supabase/client.ts` | Lovable Cloud 인증 연동 |
| `src/routeTree.gen.ts` | TanStack Router 자동 생성 |
| `.env` | Lovable Secrets 관리 |
| `package-lock.json` / `bun.lock` | 패키지 lock 무결성 |
| `supabase/config.toml` (project_id) | 프로젝트 ID 고정값 |

> GitHub Actions `.github/workflows/guard-lovable-files.yml`이 PR에서 위 파일 변경을 감지하면 자동으로 경고 코멘트를 남기고 체크를 실패시킵니다.

---

## 5. 작업 유형별 도구 선택 가이드

| 작업 유형 | 담당 도구 | 이유 |
|-----------|----------|------|
| 새 페이지 / 새 컴포넌트 생성 | **Lovable** | UI 자동화, Supabase 연동 |
| Supabase 테이블·RLS·마이그레이션 | **Lovable** | 스키마 타입 자동 생성 연동 |
| npm 패키지 추가 | **Lovable** | lock 파일 무결성 유지 |
| 복잡한 비즈니스 로직 구현 | **Antigravity** | IDE 자동완성, 멀티파일 편집 |
| 대규모 리팩토링 | **Antigravity** | 전체 검색·치환 용이 |
| 단위 테스트 작성 | **Antigravity** | 로컬 실행 환경 |
| 버그 분석 및 탐지 | **Claude** | 전체 코드 정적 분석 능력 |
| 보안 취약점 수정 | **Claude** | 패턴 기반 취약점 탐지 |
| 코드 리뷰 | **Claude** | 다각도 분석, 즉시 수정 가능 |
| 문서 작성·갱신 | **Claude** | 코드 기반 자동 문서화 |
| UI 미세 조정 | **Lovable** | 실시간 시각적 피드백 |
| 최종 배포 (Publish) | **Lovable** | 배포 권한 및 프리뷰 연동 |

---

## 6. 수정 이력 관리 (필수)

모든 도구는 작업 완료 후 아래 문서를 반드시 갱신합니다.

| 문서 | 목적 | 갱신 주체 | 갱신 시점 |
|------|------|----------|----------|
| [`docs/BUGFIX_LOG.md`](./BUGFIX_LOG.md) | 버그 수정 전체 이력 | Claude / Antigravity | 버그 수정 직후 |
| [`docs/RELEASES.md`](./RELEASES.md) | 배포 단위 릴리스 노트 | Lovable / Claude | Publish 직후 |
| [`docs/PROJECT_STATUS.md`](./PROJECT_STATUS.md) | 전체 기능 현황 및 이슈 | 모든 도구 | 주요 기능 추가·변경 시 |
| [`docs/QA_CHECKLIST.md`](./QA_CHECKLIST.md) | 배포 전 테스트 항목 | Lovable / Antigravity | 새 기능 추가 시 |

### BUGFIX_LOG.md 작성 규칙
1. **최신 항목을 파일 상단에 추가** (역순 유지)
2. 심각도 레이블 필수: 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low
3. 수정된 파일 경로, 원인, 수정 내용 명시
4. 환경변수 추가 시 `⚙️ ENV 필요` 섹션 포함
5. **수정 주체 반드시 기록** (Lovable / Antigravity / Claude)

---

## 7. 환경변수 관리

| 변수 위치 | 관리 주체 | 용도 |
|-----------|----------|------|
| Lovable Secrets | **Lovable** | 실운영 환경변수 (SUPABASE_URL 등) |
| `.env.local` | **Antigravity** | 로컬 개발 전용 변수 |
| `.env` | **Lovable (읽기 전용)** | 공유 환경변수 — Antigravity·Claude는 수정 금지 |

> 새 환경변수 추가 시 반드시 `docs/BUGFIX_LOG.md` 또는 `docs/RELEASES.md`의 `⚙️ ENV 필요` 섹션에 명시하여 다른 도구가 누락 없이 설정할 수 있게 합니다.

---

## 8. 문제 발생 시 복구

| 상황 | 조치 |
|------|------|
| 빌드 실패 / 캐시 오류 | Lovable 프리뷰 강제 새로고침 (Ctrl+Shift+R) 또는 빌드 재실행 |
| 로컬 작업 유실 | `git reflog`로 시점 복구 |
| 잘못된 코드가 main에 머지됨 | `git revert <커밋해시>` 후 push → Lovable에서 재배포 |
| DB 마이그레이션 실수 | `docs/DEPLOY_PROCESS.md` 롤백 절차 참고 |
| Claude 수정 후 빌드 오류 | `docs/BUGFIX_LOG.md` 최신 항목 확인 → Antigravity에서 로컬 검증 후 재수정 |

---

## 9. 작업 시작 전 빠른 체크리스트

```
□ GitHub main 최신 상태인지 확인 (git pull)
□ 작업하려는 파일이 다른 도구가 편집 중인지 확인
□ Lovable 관리 파일 목록 확인 (섹션 4)
□ 환경변수가 최신 상태인지 확인 (docs/RELEASES.md ENV 섹션)
□ 작업 완료 후 docs/BUGFIX_LOG.md 또는 RELEASES.md 갱신 예정인지 확인
```

---

*이 가이드는 `docs/COLLABORATION_GUIDE.md`에 보관되며 GitHub를 통해 모든 도구에서 공유됩니다.
변경이 필요하면 Claude Cowork 또는 Antigravity에서 수정 후 push하세요.*
