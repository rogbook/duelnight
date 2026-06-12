# 관리자 페이지 — 회원관리·요금관리 설계 (2026-06-12, Claude)

> 스타일: **현행 SaaS 유지** (디자인 대원칙 — 관리자 화면 예외). 기존 admin.index/admin.cards 패턴 재사용.
> 보안: 모든 데이터 접근은 **admin 검증을 내장한 SECURITY DEFINER RPC**로만 (기존 list_admins 관례).

## 화면 2개

### /admin/members — 회원관리
- 검색(이메일·닉네임) + 목록: 이메일, 닉네임, 가입일, 최근 로그인, 역할, 구독, 크레딧, 상태(정지 여부)
- 행 동작: ① 관리자 부여/해제(기존 grantAdmin/revokeAdmin 재사용) ② 정지/해제 ③ 크레딧 지급·차감
- 페이지네이션 20행

### /admin/billing — 요금관리
- 요약 카드: 이번 달 결제액 · 누적 결제액 · 활성 구독 수
- 결제 내역 테이블(일시·이메일·금액·수단·상태) + 구독 현황 테이블(이메일·플랜·상태·만료일)

## 신규 RPC (마이그레이션 `20260612xxxxxx_admin_member_billing_rpcs.sql`)

| 함수 | 역할 | 가드 |
|---|---|---|
| `admin_list_members(_search, _limit, _offset)` | auth.users+profiles+roles+credits+subscriptions 조인 목록(+total_count) | admin only |
| `admin_set_ban(_user_id, _banned)` | auth.users.banned_until 설정/해제 | admin only, 본인·다른 admin 정지 불가 |
| `admin_adjust_credits(_user_id, _delta)` | user_credits 잔액 증감(0 미만 방지), 새 잔액 반환 | admin only, delta ±100000 한도 |
| `admin_list_payments(_limit, _offset)` | 결제 내역+이메일(+total_count) | admin only |
| `admin_list_subscriptions()` | 구독 현황+이메일 | admin only |

## 비범위 (이번에 안 함)
- 환불 처리(결제사 API 필요 — 정식 오픈 전 별도), 회원 삭제, 메일 발송, 통계 차트
