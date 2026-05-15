
## 배경 (어제 테스트 피드백)
1. **`/intro` 페이지 404** — `src/routes/intro.tsx` 파일이 사라져 있음(Antigravity 푸시 과정에서 누락된 것으로 추정). 라우트 파일 자체가 없어 라우터가 매칭하지 못함.
2. **동일 카드인데 일러스트가 다른 카드가 업로드되지 않음** — `cards.code`가 UNIQUE라 "DB 중복"으로 모두 건너뜀. 얼터아트/패러랠 등 같은 카드의 다른 일러스트는 허용되어야 함.
3. **리더 카드의 표기** — 현재 "코스트"로 표기되는 값이 실제로는 "라이프". 리더에 한해 "라이프"로만 표기.

---

## 변경안

### 1. `/intro` 라우트 복원
- `src/routes/intro.tsx` 재생성. 이전 회차에서 만든 인트로 페이지(브랜드/네이밍 샘플 + 가격/요금 정책 안내 + CTA → /login, /pricing) 동일 구성으로 복원.
- `__root.tsx`의 bare layout 분기는 이미 `pathname === "/intro"`을 처리하므로 그대로 사용 (사이드바·헤더 숨김 유지).
- `head()`에 별도 `title`/`description`/`og:` 메타 포함.
- `src/routes/index.tsx`에서 비로그인 사용자를 `/intro`로 리다이렉트하는 기존 로직이 유지되는지 확인.
- `routeTree.gen.ts`는 자동 재생성되므로 손대지 않음.

### 2. 동일 카드 · 다중 일러스트 허용

DB는 카드 메타(이름/효과/스탯)는 코드 단위로 유지하고, 일러스트만 분리.

**마이그레이션 (신규)**
- 테이블 `public.card_illustrations`
  - `card_code text` (FK → cards.code, ON DELETE CASCADE)
  - `image_url text NOT NULL`
  - `variant_label text` (자유 텍스트, 기본값 NULL — 예: "기본"/"얼터"/"패러랠"/"프로모")
  - `is_primary boolean default false` (카드별 partial unique index로 1장만 true)
  - `status card_status default 'pending'`, `submitted_by uuid`, `reviewed_by`, `reviewed_at`, `review_note`
  - 표준 timestamp + `updated_at` 트리거
  - UNIQUE `(card_code, image_url)` — 완전히 동일한 URL만 차단
- 백필: 기존 `cards.image_url`이 있는 행을 `card_illustrations`에 `is_primary=true, status='approved'`로 INSERT.
- RLS: 기존 cards 정책과 동일 패턴
  - 승인된 일러스트는 모두 조회 가능
  - 본인 제출분 조회/생성, 관리자 전체 권한
- `cards.image_url`은 호환 위해 남겨두되, 신규 흐름은 illustrations에 기록.

**업로더 (`src/components/cards/card-uploader.tsx`)**
- 중복 검사 결과 분기:
  - 코드가 DB에 있고 신규 행에 image_url 있음 → "추가 일러스트로 등록" 후보 (배지 색/문구 변경, 행에 `variant_label` 입력칸 노출, 기본값 "얼터")
  - 코드가 DB에 있고 image_url 없음 → 기존처럼 건너뜀 (관리자는 메타 덮어쓰기 옵션)
  - 신규 코드 → cards INSERT + 첫 일러스트 = primary
- `submit()` 분기:
  - 일반 카드 → cards upsert (현재 로직)
  - 추가 일러스트 행 → `card_illustrations`에 INSERT (사용자=pending, 관리자=approved)
- 결과 토스트: "X장 등록 · Y장 추가 일러스트 · Z장 건너뜀"

**카드 상세 (`src/routes/cards_.$code.tsx`)**
- 승인된 `card_illustrations` 목록을 썸네일 갤러리로 노출. 클릭 시 메인 이미지 교체.
  (이게 없으면 추가 일러스트가 보이지 않아 기능 의미가 없음.)

**관리자 검수 (`src/routes/admin.cards.review.tsx`)**
- 검수 대기 일러스트 탭 추가 — pending 일러스트를 카드 메타 옆에 미리보기로 노출하고 승인/반려.

### 3. 리더 카드 = "라이프" 표기 통일

DB 컬럼은 그대로(`cost` 재사용). 표시·입력 라벨만 `type === 'leader'`일 때 분기.
- `src/routes/cards.index.tsx` L490 — `Stat label` 동적 분기.
- `src/routes/cards_.$code.tsx` L145 — 동일 분기.
- `src/components/cards/card-uploader.tsx`
  - 단일 입력 폼: type=leader면 입력 라벨을 "라이프"로.
  - 엑셀 헤더 별칭(L62~)에 `라이프: "cost"` 추가.
  - 샘플/가이드 표(L208~)에 "리더는 코스트(=라이프) 칸에 라이프 값 입력" 안내 한 줄.
- `src/routes/api/card-ocr.ts` 시스템 프롬프트에 "리더 카드의 라이프 값은 cost 필드에 채운다"라고 명시.

---

## 영향 파일
- `src/routes/intro.tsx` (재생성)
- 신규 마이그레이션 1개 (card_illustrations + 백필 + RLS + 트리거)
- `src/components/cards/card-uploader.tsx` (중복 분기 + 변형 라벨 + 라이프 라벨)
- `src/routes/cards.index.tsx`, `src/routes/cards_.$code.tsx` (라이프 라벨 + 갤러리)
- `src/routes/admin.cards.review.tsx` (일러스트 검수 추가)
- `src/routes/api/card-ocr.ts` (프롬프트 보강)

## 결정 필요
1. 일반 사용자가 추가 일러스트를 올릴 때 **검수 대기** 가 기본인지(스팸 방지), **자동 승인** 인지? (권장: pending)
2. `variant_label`을 자유 텍스트로 둘지 enum(기본/얼터/패러랠/프로모/SP)로 강제할지? (권장: 자유 텍스트 + suggestion datalist)
3. 카드 상세 갤러리에서 "이 일러스트로 기본 변경" 버튼은 관리자만 노출하면 되는지? (권장: 예)
