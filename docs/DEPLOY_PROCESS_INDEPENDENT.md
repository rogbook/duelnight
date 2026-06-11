# DuelNight 독립 서버 배포 및 운영 가이드

본 문서는 Lovable 의존성에서 벗어나 **개발자 소유의 독립적인 인프라(Cloudflare Pages + Supabase)**를 구축하고 운영하기 위한 표준 가이드라인입니다.

---

## 1. 인프라 구조 개요

독립된 인프라는 서버가 없는 **서버리스 에지 아키텍처**로 동작하며, 고성능과 저비용을 동시에 보장합니다.

| 레이어                 | 기술 스택                  | 운영 목적                                  | 비용 기준        |
| :--------------------- | :------------------------- | :----------------------------------------- | :--------------- |
| **프론트엔드/API**     | Cloudflare Pages / Workers | SSR 페이지 렌더링, 라우팅, 서버 함수 실행  | 무료 또는 월 $5  |
| **백엔드 (DB/Auth)**   | Supabase (PostgreSQL)      | 사용자 데이터, 권한 제어(RLS), 파일 업로드 | 무료 또는 월 $25 |
| **AI (코치/가져오기)** | Google Gemini Pro          | 덱 및 전적 분석 피드백, OCR 카드 자동 리딩 | 호출당 약 2원    |

---

## 2. Supabase 독립 프로젝트 설정

기존 Lovable DB에서 완전히 분리된 전용 데이터베이스를 생성하고 초기 구조를 설정합니다.

### 2.1. 신규 프로젝트 생성

1. [Supabase 대시보드](https://supabase.com/)에 로그인하고 **New Project**를 클릭합니다.
2. 프로젝트 세부 정보를 입력합니다:
   - **Name**: `duelnight` (또는 원하는 이름)
   - **Database Password**: 관리자 비밀번호 입력 (보안에 주의하고 기록해 둡니다.)
   - **Region**: 사용자층이 가장 가까운 지역 선택 (예: `Tokyo` 또는 `Seoul`)
3. 프로젝트가 생성될 때까지 대기합니다.

### 2.2. API 키 및 설정 복사

프로젝트가 생성되면 **Settings > API** 메뉴로 이동하여 다음 값을 복사하고 로컬 `.env.local` 파일 및 Cloudflare 환경변수에 설정합니다.

```ini
# Supabase 대시보드 API 정보
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR_ANON_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY`는 행 레벨 보안(RLS)을 우회할 수 있는 강력한 관리자 권한 키입니다. 절대 프론트엔드 클라이언트 코드나 GitHub 저장소에 커밋/노출되어서는 안 됩니다.

### 2.3. 데이터베이스 스키마 및 마이그레이션 적용

프로젝트 폴더 내 `supabase/migrations/` 디렉토리에 있는 SQL 마이그레이션 파일들을 새 Supabase DB에 적용합니다.

1. **로컬 CLI를 사용하는 방법 (권한 권장)**:
   ```bash
   # supabase CLI가 설치되어 있는 경우
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
2. **SQL Editor를 사용하는 방법**:
   - `supabase/migrations` 하위의 `.sql` 파일들을 순서대로(타임스탬프 순) 복사하여 Supabase 웹 대시보드의 **SQL Editor**에 붙여넣고 **Run**을 실행합니다.

---

## 3. Cloudflare Pages 배포 및 자동화 (CI/CD)

Cloudflare Pages를 사용하여 GitHub 저장소에 코드가 푸시될 때마다 자동으로 배포가 이루어지는 파이프라인을 설정합니다.

### 3.1. Cloudflare Pages 생성 및 연동

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인 후 **Workers & Pages** 메뉴로 이동합니다.
2. **Create application** > **Pages** 탭 > **Connect to Git**을 선택합니다.
3. GitHub 계정을 연동하고 `rogbook/duelnight` 저장소를 지정합니다.
4. **Build settings**을 다음과 같이 설정합니다:
   - **Framework preset**: `None` (또는 `Vite` 자동 인식)
   - **Build command**: `npm run build` (또는 `bun run build`)
   - **Build output directory**: `dist` (또는 빌드 후 생성되는 디렉토리)
   - **Node.js version**: `20` 이상 권장

### 3.2. 환경 변수(Environment Variables) 등록

빌드 및 런타임에 필요한 환경 변수를 Cloudflare Pages 설정에 입력합니다.
**Pages 프로젝트 > Settings > Variables**에서 아래 항목들을 등록합니다.

| 변수명 (Variables)              | 값 예시                                | 노출 구분        | 비고                   |
| :------------------------------ | :------------------------------------- | :--------------- | :--------------------- |
| `SUPABASE_URL`                  | `https://YOUR_PROJECT_REF.supabase.co` | 공개             | 서버 함수용            |
| `SUPABASE_SERVICE_ROLE_KEY`     | `sb_secret_...`                        | **Secret(비밀)** | 서버 함수용 (RLS 우회) |
| `VITE_SUPABASE_URL`             | `https://YOUR_PROJECT_REF.supabase.co` | 공개             | 브라우저 클라이언트용  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGc...`                           | 공개             | 브라우저 클라이언트용  |
| `GEMINI_API_KEY`                | `AIzaSy...`                            | **Secret(비밀)** | AI 코칭용 구글 API 키  |

> [!TIP]
> 배포 설정을 완료하고 **Save and Deploy**를 누르면 최초 배포 빌드가 시작됩니다. 이후 `main` 브랜치에 코드를 `git push`할 때마다 자동으로 빌드되어 즉시 배포됩니다.

---

## 4. 로컬 및 Staging(Preview) 환경 운영 가이드

독립 배포 체제에서는 개발 과정에서 실사용자 DB를 건드리지 않도록 환경을 격리하여 운영합니다.

```
[로컬 개발] (Localhost)
  - 로컬 환경변수 사용 (.env.local)
  - 안전하게 코드 수정 및 실시간 반영 확인
      ↓
[GitHub Pull Request] (Preview Deploy)
  - Cloudflare가 생성하는 고유의 임시 주소에서 멀티 디바이스 기능 검증
  - 실사용자에게 영향 없이 실시간 피드백
      ↓
[GitHub Merge to main] (Production Deploy)
  - main 브랜치 머지 시 duelnight.app 도메인에 실시간 반영
```

### 4.1. 정기 데이터 백업

중요한 사용자 전적 및 카드 데이터는 Supabase 대시보드에서 주기적으로 백업 스냅샷을 생성할 수 있습니다.

- **경로**: Supabase 대시보드 > Database > Backups (Pro 플랜의 경우 매일 자동 백업 지원)
- **수동 백업**: CLI를 통해 `supabase db dump --clean > backup.sql` 명령어로 수동 덤프 파일을 다운로드하여 로컬에 안전하게 보관할 수 있습니다.
