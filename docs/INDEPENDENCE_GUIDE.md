# DuelNight 독립 전환 가이드 (Lovable → 내 인프라)

> 대상: **비개발자**. 목표: Lovable 없이 **내 컴퓨터 + 내 계정**으로 개발·배포·DB 운영.
> 원칙: **새 환경이 완전히 동작하는 걸 확인할 때까지 Lovable은 끄지 않는다**(안전망).
> 표기: **[나]** = 내가 직접(클릭/계정), **[클로드]** = 클로드가 코드로 처리.

---

## 0. 한눈에 보기

지금 Lovable이 묶어서 해주던 것 → 독립하면 이렇게 나뉩니다.

| 기능 | 지금(Lovable) | 독립 후 |
|---|---|---|
| 코드 보관 | GitHub(이미 내 것) | 그대로 |
| 화면 미리보기 | Lovable 옆창 | **내 컴퓨터 `npm run dev`** → 브라우저 localhost |
| 배포(라이브) | Lovable 자동 | **Cloudflare**(GitHub 연결 시 자동) |
| DB·로그인 | Lovable Cloud의 Supabase | **내 Supabase 프로젝트** |
| AI 기능 | Lovable AI 게이트웨이 | **구글 Gemini 키** 직접 |

총 4단계: **① 내 컴퓨터 셋업 → ② Supabase 이관 → ③ AI 키 교체 → ④ Cloudflare 연결**.
계정 만들기·버튼 누르기는 [나], 코드·설정 파일은 [클로드]가 합니다.

---

## 사전 준비 — 만들 계정 (전부 무료 구간 있음)
- [ ] **GitHub** 계정 (이미 있음: `rogbook/tcg-hub`)
- [ ] **Cloudflare** 계정 — 배포용 (dash.cloudflare.com)
- [ ] **Supabase** 계정 — DB/로그인용 (supabase.com)
- [ ] **Google AI Studio** — Gemini 키용 (aistudio.google.com)
- [ ] (선택) 결제 쓰면: **Stripe** / **PortOne(포트원)** 계정

---

## 1단계 — 내 컴퓨터 셋업 (미리보기 가능하게)

> 한 번만 하면 됩니다. 이게 되면 "Lovable 프리뷰"처럼 **화면 보면서 작업** 가능.

1. **[나] Node.js 설치** — https://nodejs.org 에서 LTS 버전 다운로드·설치(다음다음 클릭).
2. **[나] Claude Code 설치** — 데스크톱 앱 또는 VS Code 확장(클로드를 내 컴퓨터에서 쓰는 것).
3. **[나] 프로젝트 내려받기** — 터미널에 한 줄:
   ```
   git clone https://github.com/rogbook/tcg-hub.git
   cd tcg-hub
   ```
4. **[나] 설치 + 실행**:
   ```
   npm install
   npm run dev
   ```
   → 터미널에 뜨는 주소(예 `http://localhost:5173`)를 브라우저에서 열면 **앱이 보입니다.** 코드를 고치면 자동 새로고침.
   - 단, 이 단계에선 아직 **DB/로그인이 비어** 있어 일부 화면만 보일 수 있음(아래 2단계 후 정상).
5. **[나] `.env` 파일 만들기** — 프로젝트 폴더에 `.env` 파일을 만들고 키들을 넣음(값은 2~3단계에서 받음). **[클로드]가 어떤 키가 필요한지 빈 양식을 만들어 드림.**

> 필요한 키 목록(미리 참고):
> - 화면용(VITE_): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (필수) / `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PORTONE_USER_CODE`(결제 시)
> - 서버용(비밀): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (필수) / `GEMINI_API_KEY`(AI) / `STRIPE_SECRET_KEY`, `PORTONE_API_KEY`, `PORTONE_API_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `APP_URL`(선택)

---

## 2단계 — Supabase 이관 (내 DB로 복제)

> Lovable의 Supabase를 통째 이전은 막혀 있지만, **내 새 Supabase로 복제**는 됩니다.

1. **[나] 새 프로젝트 생성** — supabase.com → New project. 지역은 한국 가까운 곳(예: Tokyo). 비밀번호 메모.
2. **[나] 키 복사** — 프로젝트 Settings → API 에서:
   - `Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public` 키 → `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `service_role` 키(비밀!) → `SUPABASE_SERVICE_ROLE_KEY`
   → `.env`에 붙여넣기.
3. **[클로드/나] 구조 만들기** — 우리 저장소의 `supabase/migrations/*.sql`을 새 프로젝트에 실행하면 테이블·RLS·함수가 그대로 생깁니다.
   - 쉬운 방법: Supabase 대시보드 **SQL Editor**에 마이그레이션 내용을 순서대로 붙여 실행. **[클로드]가 "하나로 합친 설치용 SQL"을 만들어 드리면** 복붙 한 번이면 됩니다.
4. **[나] 데이터 옮기기** — 기존(Lovable) Supabase에서 데이터 내보내 새 프로젝트로 가져오기.
   - Lovable Supabase 접근이 되면 테이블별 CSV export → 새 프로젝트 import.
   - **[클로드]가 어떤 테이블을 어떤 순서로 옮길지 목록**을 만들어 드림(외래키 순서 주의).
5. **[나] 카드 이미지(스토리지) 복사** — Storage 버킷의 파일을 새 프로젝트 버킷으로 복사. (양이 많으면 [클로드]가 복사 스크립트 제공)
6. **[나] 로그인 사용자(Auth) 이관** — 가장 손이 가는 부분.
   - 사용자 수가 적으면: **새로 가입 안내**가 가장 간단.
   - 그대로 옮기려면: Supabase Auth 사용자 export/import 절차 필요(비밀번호 해시 포함). [클로드]가 절차서 제공.

> 팁: **2단계까지 끝나면 `npm run dev`로 로그인·데이터가 정상 동작**합니다. 여기서 충분히 테스트하세요.

---

## 3단계 — AI 키 교체 (Lovable 게이트웨이 → 구글 Gemini)

> AI(카드 OCR·코치·가져오기)가 지금은 Lovable 게이트웨이를 씁니다. 독립하면 구글 직접.

1. **[나] Gemini 키 발급** — aistudio.google.com → "Get API key" → 키 복사 → `.env`에 `GEMINI_API_KEY=...`
2. **[클로드] 코드 3곳 수정** — `src/routes/api/coach.ts`, `card-ocr.ts`, `card-import.ts`의 호출 주소·키·모델명을 구글 OpenAI 호환 엔드포인트로 교체(거의 그대로, 전에 정리해 둠).
   - 단가도 구글 정가(=호출당 약 2원)로 확정됨.

---

## 4단계 — Cloudflare 연결 (라이브 배포, 자동화)

> 이 앱은 이미 **Cloudflare용으로 설정**돼 있습니다(`wrangler.jsonc`). 서버를 직접 운영할 필요 없음(serverless).

1. **[나] Cloudflare 로그인** → Workers & Pages.
2. **[나] GitHub 연결** — "Create application → Connect to Git" → `rogbook/tcg-hub` 선택. 빌드 명령은 `npm run build`(자동 감지될 수 있음).
3. **[나] 환경변수 등록** — Cloudflare 프로젝트 Settings → Variables/Secrets 에 위 `.env`의 키들을 등록(비밀 키는 Secret로).
4. **[나] 배포** — 저장하면 자동 빌드·배포. 이후 **GitHub에 코드가 올라갈 때마다 자동 재배포**(push → 몇 분 뒤 라이브).
5. **[나] (선택) 내 도메인 연결** — Cloudflare에서 도메인 추가(없으면 무료 `*.workers.dev` 주소 사용).

> Vercel을 더 선호하면 가능하지만, 지금은 Cloudflare 설정이 이미 있어 **Cloudflare가 가장 빠릅니다.** Vercel로 가려면 어댑터 변경이 필요해 [클로드]가 처리해야 합니다.

---

## 5. 전환 후 일상 운영 (비개발자 기준)
- **수정**: 내 컴퓨터에서 클로드와 작업 → `npm run dev`로 확인 → GitHub에 올리면(push) **자동 배포**.
- **DB 변경**: 이제 내가 주인이라 Supabase 대시보드/SQL로 직접(또는 [클로드]가 SQL 작성).
- **비용**: 초기엔 대부분 **무료 구간**. 트래픽/사용량 늘면 Supabase·Cloudflare·Gemini 각각 소액 과금(전에 만든 `AI_GATEWAY_COST_SIMULATION.md` 참고).
- **확인 위치**: 배포 상태=Cloudflare, DB/로그인=Supabase, AI 사용량=Google.

## 6. 주의/리스크 (미리 알고 가기)
- **로그인 사용자·스토리지 이관**이 가장 번거롭다 → 사용자 적을 때 옮기는 게 유리.
- **결제(Stripe/PortOne)**: 키를 새로 넣고 웹훅 주소를 새 도메인으로 다시 등록해야 함.
- **AI**: Lovable 무료 크레딧($1/월)은 사라짐 → Gemini 정가 적용(여전히 매우 저렴).
- **프리뷰**: Lovable 옆창 같은 즉시 미리보기는 없음 → 내 컴퓨터 `npm run dev`로 대체.

## 7. 안전한 순서(롤백 대비)
1. 1~3단계까지 **내 컴퓨터에서만** 완성·테스트(Lovable은 그대로 운영).
2. 4단계로 **새 도메인에 배포**해 한동안 병행 운영하며 확인.
3. 문제없으면 그때 Lovable 의존을 정리.

---

## 클로드가 바로 만들어 줄 수 있는 것 (요청만 하세요)
- `.env` **빈 양식 파일**(필요한 키 주석 포함)
- 마이그레이션을 **하나로 합친 "설치용 SQL"**(복붙 한 번)
- 데이터 **이관 순서 목록** + (필요시) 스토리지 복사 스크립트
- AI 키 교체 **코드 수정**(coach/ocr/card-import)
- Auth 사용자 **이관 절차서**

> 어디서 막히면 그 단계만 알려주세요. 화면 캡처 주시면 단계별로 같이 풀어드립니다.
