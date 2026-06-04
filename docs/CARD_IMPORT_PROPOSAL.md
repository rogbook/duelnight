# 카드 자동 등록(URL 가져오기) 기능 제안서

> 상태: **제안(검토 대기)** — 대표님 확인 후 진행 여부/방향 결정
> 작성 맥락: 관리자가 카드를 수기로 등록하기 어려워, 공식 카드리스트 페이지 URL을 입력하면
> 해당 카드의 이미지·내용을 자동 추출해 쉽게 등록하도록 하는 기능.
> 예시 대상: 디지몬 공식 카드리스트 `https://digimoncard.co.kr/index.php?mid=cardlist&category=47744`

---

## ⚠️ 0. 저작권 / 약관 (가장 먼저 결정 필요)

digimoncard.co.kr 하단 고지:
> "이 홈페이지에 게재된 모든 그림, 텍스트, 데이터의 무단 사용 및 전재를 금합니다."
> 이미지: `SAMPLE` 워터마크 + `©Akiyoshi Hongo, Toei Animation` / 대원미디어·반다이 저작권.

- **텍스트 메타데이터(코드/스탯/효과 등)**: 사실 데이터에 가까워 저작 대상성이 낮은 편 → 입력 보조용 추출은 상대적으로 안전.
- **이미지 재호스팅**: 저작권/약관 리스크 큼 → 기본 비활성화 권장. 자체 촬영/공식 라이선스 이미지로 대체하거나 사전 승인 필요.
- 크롤링 예절: robots.txt 준수, 요청 속도 제한(rate limit), User-Agent 식별.

→ **대표님 결정 항목**: 이미지 처리 방식(아래 3안 중 택1).

---

## 1. 결정이 필요한 항목 (대표 보고용)

| # | 항목 | 선택지 |
|---|------|--------|
| 1 | **이미지/저작권** | (A) 텍스트만 추출·이미지는 보류(자체/공식 라이선스) **〈권장〉** / (B) 원본 URL 핫링크+출처표기(재호스팅 X) / (C) 스토리지에 복사(리스크 감수) |
| 2 | **디지몬 전용 스키마** | (A) `extra JSONB` 컬럼 1개 추가 **〈권장〉** / (B) 전용 nullable 컬럼(level/form/evolution_cost/sub_type) / (C) 기존 컬럼에 매핑 |
| 3 | **진행 범위** | (A) Phase 1(단일 URL) / (B) Phase 1+2(대량) / (C) 설계만 |

---

## 2. 추천 아키텍처 (기존 인프라 재사용)

```
관리자: "URL로 가져오기"에 주소 입력 (목록 URL 또는 카드 상세 URL)
            │
            ▼
[신규] 서버 라우트  src/routes/api/card-import.ts  (TanStack Start, 서버사이드)
   1) 대상 페이지 HTML을 서버에서 fetch (CORS 회피·UA 지정)
   2) HTML 파싱 → 카드 필드 구조화
        · Cloudflare 배포 → 내장 HTMLRewriter로 의존성 없이 파싱 가능
        · 파싱 실패/구조 변동 시 기존 Gemini 게이트웨이로 텍스트→JSON 보정(폴백)
   3) cards 스키마로 매핑 후 반환
            │
            ▼
[재사용] 검수 큐: status='pending' 으로 upsert (code UNIQUE 기준 중복방지·멱등)
            │
            ▼
관리자: admin.cards.review 에서 미리보기·수정·일괄 승인 → status='approved'
```

### 재사용 가능한 기존 자산
- `cards` 테이블 + `card_status` enum(`pending`/`approved`/`rejected`, 기본 `approved`)
- 검수 큐 UI: `src/routes/admin.cards.review.tsx`, 관리: `admin.cards.manage.tsx`
- AI 게이트웨이: `src/routes/api/card-ocr.ts` (Lovable AI Gateway · `google/gemini-2.5-flash`)
- 서버 라우트 패턴: `src/routes/api/*.ts` (`server.handlers.POST`, Bearer 인증, env: `LOVABLE_API_KEY`/`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`)

### 신규로 필요한 것
- 서버 라우트 1개: `src/routes/api/card-import.ts`
- 관리자 UI 1개: "URL로 가져오기" 패널(또는 `cards.upload.tsx`에 탭 추가)
- (스키마 확장 선택 시) 마이그레이션 1개

---

## 3. 필드 매핑 (디지몬 상세 → `cards`)

| 사이트 필드 | cards 컬럼 | 비고 |
|---|---|---|
| 카드번호 `BT14-012` | `code` | UNIQUE 키(멱등 upsert 기준) |
| 입수정보 `BTK-21` | `set_code` | 코드 접두(BT14)와 수록 부스터(BTK-21)가 다를 수 있음 |
| 카드명 `그레이몬` | `name` | 한국어 |
| 색(프레임) 적색 | `colors[]` | red/blue/... 매핑 |
| DP `5000` | `power` | 디지몬 DP = power 재사용 |
| 등장 코스트 `5` | `cost` | |
| 레어도 `R` | `rarity` | |
| 속성 `백신종` | `attribute` | |
| 상단+하단 텍스트 | `effect` | 결합 저장 |
| 이미지 | `image_url` | ※ 저작권 결정에 종속 |
| game | `game='dtcg'` | 고정 |

### ⚠️ 스키마 갭 — 디지몬 고유 항목
현재 `cards`/`card_type` enum은 **원피스(OPTCG) 기준**. 다음 디지몬 항목이 들어갈 자리가 없음:
- **형태**(성숙기/완전체…), **레벨**(Lv.4), **진화 코스트**(Lv.3~2), **유형**(공룡형 등), 카드 분류(디지몬/테이머/옵션/디지타마)

→ `extra JSONB`(권장) 또는 전용 nullable 컬럼 추가 필요. (마이그레이션 1개)

---

## 4. 도전 과제 / 리스크

- **상세가 AJAX 모달**일 가능성: XE/Rhymix 내부 엔드포인트(`document_srl`)를 찾아야 함.
  *현재 개발 샌드박스는 외부 네트워크가 차단돼 실제 페이지 구조 확인 불가* → 구현 착수 시 페이지 1건 실측 선행 필요.
- 사이트 HTML 변경 시 파서 깨짐 → Gemini 폴백 + 실패 로깅으로 완충.
- 다국어: 이 사이트는 한국어만 → en/ja 카드명은 별도 소스 필요.
- 저작권(상기 0번).

---

## 5. 단계별 로드맵

- **Phase 1** — 상세 URL 1건 → 검수 폼 자동 채우기 (가장 작고 즉효)
- **Phase 2** — 목록 URL → 페이지네이션 전체 대량 가져오기 → 검수 큐 적재
- **Phase 3** — 신규 세트 자동 감지 / 주기 동기화

---

## 6. 다음 단계

1. 대표님이 §1의 3개 항목(특히 이미지/저작권) 결정
2. (네트워크 가능 환경에서) 대상 페이지 1건 실측 → 목록/상세 파싱 방식 확정
3. 결정·확정 후 Phase 1 구현 착수

> 본 문서는 검토용 자료이며, 구현 코드는 포함하지 않음.
