# TCG Hub 프로젝트 현황 문서화

협업자(특히 Antigravity)가 빠르게 프로젝트를 파악할 수 있도록 **Markdown(저장소 관리용) + DOCX(공유/인쇄용)** 두 형식의 현황 문서를 생성합니다.

## 산출물

1. **`docs/PROJECT_STATUS.md`** — 기존 파일 전면 갱신 (Git 추적, Lovable↔Antigravity 동기화)
2. **`/mnt/documents/TCG_Hub_프로젝트_현황.docx`** — 동일 내용의 워드 문서 (다운로드 제공)

두 문서 내용은 동일하며, Markdown이 원본(single source of truth) 역할을 하고 DOCX는 이를 변환한 결과물입니다.

## 문서 구조 (4개 섹션)

### 1. 프로젝트 개요
- 서비스 한 줄 소개, 타깃 게임(원피스 TCG 외), 핵심 가치 제안
- 도메인: tcg-hub.lovable.app
- 협업 모델 요약 (Lovable=UI/DB/배포, Antigravity=로직/리팩토링)

### 2. 기능 목록 (라우트별)
현재 `src/routes/` 기준으로 카테고리별 정리:

- **공개 페이지**: `/` (홈), `/announcements`, `/cards`, `/decks`, `/leaderboard`, `/tier`, `/calendar`, `/stores`, `/lfg`, `/packs`, `/login`
- **상세 페이지**: `/cards/:code`, `/decks/:id`, `/announcements/:id`, `/events/:id`, `/stores/:id`, `/tier/:id`, `/lfg/:id`
- **인증 필요**: `/profile`, `/collection`, `/matches`, `/messages`, `/notifications`, `/friends`, `/cards/upload`, `/reset-password`
- **관리자**: `/admin`, `/admin/cards`, `/admin/cards/review`, `/admin/reports`
- **API/시스템**: `/sitemap.xml`, `/api/coach`, `/api/card-ocr`, `/api/drive/auth`, `/auth/google-drive/callback`

각 항목 옆에 **상태 표시**: ✅ 정상 / 🟡 진행 중 / 🔴 이슈 (최근 LFG 댓글 신고/관리자 검토 추가 등 반영)

### 3. DB 스키마 요약
27개 테이블을 도메인별로 묶어 표로 정리:

- **사용자/인증**: `profiles`, `user_roles`, `user_credits`, `user_drive_tokens`, `friendships`
- **카드 도메인**: `cards`, `card_favorites`, `card_reviews`, `card_audit_logs`, `user_collection`
- **덱**: `decks`, `deck_cards`, `tier_lists`
- **매칭/전적**: `matches`, `user_ratings`
- **LFG (오프라인 매칭)**: `lfg_posts`, `lfg_comments`, `lfg_comment_reports`, `lfg_messages`, `lfg_participants`
- **이벤트/매장**: `events`, `event_favorites`, `stores`, `store_favorites`
- **공지/알림/결제**: `announcements`, `notifications`, `payments`

각 테이블에 대해 **주요 컬럼 + 접근 권한(RLS 요약, 평문)** 만 기재. 표준 컬럼(id, created_at 등)은 생략.

### 4. 기술 스택 & 아키텍처
- **프레임워크**: TanStack Start v1 (React 19, Vite 7, SSR)
- **백엔드**: Lovable Cloud (Supabase 기반) — DB, 인증, 스토리지, RLS
- **서버 로직**: TanStack `createServerFn` (Edge Functions 미사용 원칙)
- **AI**: Lovable AI Gateway (Gemini/GPT 모델, API 키 불필요) — `/api/coach`, OCR 등
- **결제**: 포트원(import) 연동 (`payments` 테이블)
- **외부 연동**: Google Drive OAuth (사용자별 토큰 저장)
- **배포**: Cloudflare Workers (워커 런타임 제약 주의)
- **금지 파일**: `supabase/types.ts`, `supabase/client.ts`, `.env`, lock 파일

### 5. 남은 작업 / 향후 로드맵
- **단기 (현재 검증 중)**: LFG 댓글/신고/관리자 검토 플로우 end-to-end 안정화
- **중기 후보**:
  - 매칭/전적 기록 UX 다듬기
  - 카드 검수 플로우 자동화
  - 알림 트리거 보강 (현재 `notifications` INSERT 권한 없음 → 서버 함수 경유 필요)
  - 결제 영수증 처리 검증
- **장기**: SEO 최적화, 다국어, PWA 강화 (manifest는 이미 존재)
- **기술 부채**: TODO 문서들(`docs/TODO_*`, `docs/COLLABORATION_GUIDE.md`) 통합

## 기술 세부사항 (구현 방법)

```text
1. docs/PROJECT_STATUS.md 작성 (기존 파일 덮어쓰기)
   - 위 5개 섹션을 한국어 마크다운으로

2. DOCX 생성 스크립트 (/tmp/gen_status_docx.js)
   - npm: docx 패키지 사용
   - US Letter, Arial, 한국어 본문
   - Heading1/2 스타일 정의, 표는 DXA 단위, ShadingType.CLEAR
   - 출력: /mnt/documents/TCG_Hub_프로젝트_현황.docx

3. QA: docx → pdf → png 변환 후 페이지별 시각 검증

4. <presentation-artifact> 태그로 DOCX 다운로드 제공
```

## 확인 사항

- 기존 `docs/PROJECT_STATUS.md`와 `docs/COLLABORATION_GUIDE.md` 내용을 먼저 읽어 **중복/충돌**을 피하고, 새 문서가 상위 인덱스 역할을 하도록 구성합니다.
- 라우트별 "정상/이슈" 상태는 코드 존재 여부로만 표기하며, **동작 검증이 필요한 항목은 별도 표시**(주관적 판단 금지).
