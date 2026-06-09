# DuelNight 디자인 방향 (개인 유저용 · 친근 · 심플)

> 목표: "기업용 SaaS 대시보드" → **개인 유저용 게임 컴패니언 앱**. 심플하면서 친근.
> 참조 무드: 게임 컴패니언(예: untapped.gg). 복잡한 카드 업체 스타일 지양.
> 인사 히어로("안녕하세요 OOO") 같은 요소는 **넣지 않음**.

## 핵심 토큰 (src/styles.css) — 이 값들이 앱 전체 톤을 결정
- **메인 컬러(primary) = 친근한 인디고** `oklch(0.55 0.2 277)` (라이트) / `oklch(0.62 0.19 277)` (다크).
  - 기존의 거의-검정(`0.22`) primary가 가장 큰 "기업 SaaS" 신호였음 → 컬러 CTA로 전환.
  - brand / ring / sidebar-primary / accent도 같은 인디고 계열로 통일.
- **라운드(radius) = 0.85rem** (기존 0.5rem) → 더 말랑·친근.
- **본문 폰트 = Pretendard Variable** (CDN, 실패 시 시스템 폰트 폴백) → 한국어 친근 톤.
- 다크/라이트 모두 유지. 색은 반드시 **oklch**.

## 컴포넌트 톤 규칙
- 카드/패널: `rounded-2xl`, 부드러운 그림자, hover 시 살짝 lift(`hover:-translate-y-0.5 hover:shadow-md`).
- 아이콘은 **컬러 칩**(예: `bg-violet-500/10 text-violet-500`)으로 — 회색 일색 지양.
- 게임별 액센트: 원피스=red, 포켓몬=yellow, 디지몬=blue (배지/칩에 사용).
- 버튼/터치 타깃 충분히 크게(min h-10), 작은 회색 텍스트 버튼 지양.
- 빈 상태: 아이콘 + 다정한 카피 + 한 번에 시작 버튼.

## 적용 현황
- [x] 전역 토큰(primary/radius/font/accent/ring/sidebar) — `src/styles.css`
- [x] 대시보드(`src/routes/index.tsx`): KPI 카드 + 바로가기를 컬러 칩·라운드·hover lift로 재구성 (인사 히어로 없음)
- [ ] 나머지 페이지: 토큰으로 자동 반영되되, 페이지별 카드/빈상태 톤 점진 정리
- [ ] (선택) untapped.gg를 로컬에서 `npx designlang` 추출 → `*-tailwind.config.js`/`*-shadcn-theme.css` 반영으로 색/모션 정밀 튜닝

## 주의
- 토큰은 앱 전체에 영향 → Lovable 작업 시 `styles.css`의 primary/radius/font를 임의로 기업톤(검정 primary, 작은 라운드)으로 되돌리지 말 것.
- 색 추가 시 :root + .dark 양쪽 + @theme inline 등록(파일 상단 주석 규칙 준수).
