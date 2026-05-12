# Lovable ↔ Antigravity 협업 개발 프로세스 가이드 (Universal)

이 문서는 Lovable(UI/프로토타이핑)과 Antigravity(로직/리팩토링) 간의 원활한 협업을 위해 작성된 표준 워크플로우입니다. 프로젝트 소스 코드에 포함하여 어떤 환경에서도 개발 수칙을 확인할 수 있도록 합니다.

---

## 🔧 1. 초기 세팅 (프로젝트당 1회)

### 1-1. GitHub 연동 (필수)
- Lovable과 GitHub 저장소 간의 양방향 자동 동기화 활성화 확인.

### 1-2. 로컬(Antigravity) 클론
- 저장소를 로컬로 클론하고 의존성 설치 (`npm install` / `bun install` 등).

### 1-3. 환경변수 관리
- `.env`: Lovable 관리 대상. 로컬에서는 **읽기 전용**으로 사용.
- `.env.local`: 로컬 전용 변수는 이곳에 별도 관리.

---

## 🔄 2. 표준 개발 사이클 (3단계 프로세스)

### **STAGE 1 — Lovable: 기초 개발**
> 목적: UI 구조, DB 스키마, 인증, 라우팅 정의

- 페이지 및 컴포넌트 생성.
- Supabase 테이블/RLS/Edge Function 관리.
- **npm 패키지 추가** (패키지 관리 및 lock 파일 안정성 목적).
- 디자인 토큰(`index.css`, `tailwind.config.ts`) 정의.

### **STAGE 2 — Antigravity: 정밀 개발**
> 목적: 복잡한 비즈니스 로직, 대규모 리팩토링, 디버깅

#### **시작 전 필수 체크**:
1. `git checkout main`
2. `git pull origin main` (Lovable 변경분 반드시 가져오기)
3. `git checkout -b feature/<name>` (새 브랜치 권장)

#### **🛠️ Antigravity 주요 작업**:
- 복잡한 로직 및 알고리즘 구현.
- 대규모 리팩토링 및 단위 테스트 작성.
- 로컬 개발 도구를 활용한 정밀 디버깅.

#### **⚠️ 수정 금지 파일 (Lovable 관리)**:
- `src/integrations/supabase/types.ts`
- `src/integrations/supabase/client.ts`
- `.env`
- `package-lock.json` / `bun.lockb`
- `supabase/config.toml` 의 `project_id`

#### **종료 및 동기화**:
- `git add .` -> `git commit` -> `git push`
- GitHub에서 PR 생성 후 `main`에 머지.

### **STAGE 3 — Lovable: 최종 정리 및 배포**
> 목적: 시각적 검증 및 최종 배포

- Lovable 프리뷰에서 최신 변경 내용 확인 (새로고침).
- UI 미세 조정 (Visual Edits).
- **Publish** 버튼으로 최종 배포.

---

## ⚠️ 3. 충돌 방지 핵심 원칙

### 황금률: **"한 번에 한 곳에서만 작업"**
- Lovable과 Antigravity에서 **동시 편집 절대 금지**.
- 한쪽 작업이 완전히 완료되어 Push/Sync된 후 다른 쪽으로 전환.

### 동기화 체크리스트
- **Antigravity 시작 전**: 무조건 `git pull`.
- **Lovable 전환 전**: 무조건 `git push` 완료 확인.
- **충돌 시**: 자동 생성 파일 보호를 위해 Lovable 버전을 우선시.

---

## 📋 4. 프로젝트별 도구 선택 가이드

| 작업 유형 | 권장 도구 | 이유 |
|-----------|-----------|------|
| 새 페이지/DB 설계 | **Lovable** | 자동화 및 시각적 도구 |
| 패키지 추가 | **Lovable** | lock 파일 무결성 유지 |
| 복잡한 비즈니스 로직 | **Antigravity** | 강력한 IDE 기능/자동완성 |
| 대규모 리팩토링 | **Antigravity** | 일괄 검색 및 구조 변경 용이 |
| UI 미세 조정 | **Lovable** | 실시간 시각적 피드백 |

---

## 🚨 5. 문제 발생 시 복구

- **빌드 실패/캐시 오류**: 프리뷰 강제 새로고침(Ctrl+Shift+R) 또는 빌드 재실행.
- **로컬 작업 유실**: `git reflog`를 이용해 시점 복구.

---

*이 가이드는 프로젝트 소스 내 `docs/COLLABORATION_GUIDE.md`에 보관되며, 모든 개발 작업의 우선 지침이 됩니다.*
