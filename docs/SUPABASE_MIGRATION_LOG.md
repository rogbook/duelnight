# Supabase 독립 전환 — 2단계(스키마 이관) 작업 기록

작업일: 2026-06-10 (Claude Code)
근거 문서: [INDEPENDENCE_GUIDE.md](./INDEPENDENCE_GUIDE.md) 2단계

## 요약

Lovable Cloud Supabase(`tgybttphkmesgfbtgftt`) → **내 Supabase 프로젝트**(`nrtdhkjeziknmafauypv`, ap-south-1)로 스키마 이관 완료.

- 저장소 `supabase/migrations/*.sql` **61개 파일 전부** 새 프로젝트에 적용 (날짜별 7개 배치로 묶어 순서대로 실행)
- 결과: **테이블 41개**, 전부 RLS 활성화. 시드 데이터(테스트 계정 3개, OP12 카드 12장, 샘플 덱/공지/티어리스트) 포함
- 검증: 카드 REST 조회 ✅ / `admin@lovable.test` 로그인 ✅ / `bun run dev` 로컬 기동 후 새 프로젝트로 연결 확인 ✅
- Supabase 보안 advisor: 치명적(ERROR) 0건. WARN은 기존 DB와 동일 패턴(SECURITY DEFINER 함수 EXECUTE 권한 47건, 공개 버킷 목록 노출 1건, 유출 비밀번호 보호 비활성 1건)

## 마이그레이션 파일에 없어서 복원한 객체 (types.ts 기준 재구성)

기존 DB에는 있었지만 마이그레이션 파일이 누락된 것들. **컬럼 구조는 `src/integrations/supabase/types.ts`와 일치**하지만, RLS 정책과 함수 본문은 프로젝트 패턴을 따라 재구성한 것이므로 기존 DB와 다를 수 있음:

| 객체 | 종류 | 비고 |
|---|---|---|
| `ai_usage` | 테이블 | 본인 조회만, 쓰기는 `log_ai_usage()` 경유 |
| `subscriptions` | 테이블 | `user_id` UNIQUE 포함(`activate_subscription`의 ON CONFLICT에 필요). billing_key는 이후 마이그레이션이 분리·제거 |
| `lfg_comments` | 테이블 | authenticated 읽기/본인 쓰기 정책 |
| `lfg_comment_reports` | 테이블 | 신고자+관리자 조회 정책 |
| `grant_credits(uuid,int,uuid)` | 함수 | 크레딧 지급, service_role 전용 |
| `process_successful_payment(…10인자)` | 함수 | 구독/크레딧 통합 처리 버전 — **본문은 추정 재구성. 결제 기능 사용 전 반드시 동작 검토 필요** |

## 적용 순서 보정 (파일 타임스탬프 ≠ 실제 적용 순서였던 것들)

- `20260513120000_init_payments`(초기) → `20260513040946`(보강) 순으로 적용
- `20260608120000_direct_messages`(원본) → `20260608115226`(grants 추가판) 순으로 적용
- `lfg_messages`, `lfg_comments`를 realtime publication에 선 추가 (이후 마이그레이션이 DROP하므로)

## 로컬 환경 구성

- `.env.local` + `.dev.vars` 생성 (둘 다 gitignore 대상, **커밋 안 됨**)
- 새 프로젝트 URL/anon 키 입력 완료. **`SUPABASE_SERVICE_ROLE_KEY`만 비어 있음** → 대시보드 Settings → API Keys에서 복사해 채울 것 (관리자 콘솔·서버 API에 필요)
- 커밋된 `.env`는 운영(Lovable/Cloudflare) 안전망 유지를 위해 **변경하지 않음**

## 남은 일 (가이드 2단계 후반 ~ 4단계)

1. **[나]** `.env.local`에 service_role 키 채우기
2. **[나/클로드]** 기존 Lovable DB의 실데이터 이관 (현재는 시드 데이터만 있음) — 카드 DB, 사용자 데이터 등. CSV export/import 또는 스크립트
3. **[나]** Storage `card-images` 버킷 파일 복사
4. **[나]** Google OAuth 리다이렉트 URL을 새 프로젝트에 등록 (이메일 로그인은 이미 동작)
5. **[클로드]** 3단계: AI 키 교체 (coach/card-ocr/card-import → Gemini 직접 호출)
6. **[나]** 4단계: Cloudflare 연결 + 환경변수 등록
7. (선택) 대시보드 Auth 설정에서 Leaked password protection 활성화 권장

## 참고

- 새 프로젝트 리전이 ap-south-1(뭄바이)임. 한국 사용자 대상이면 ap-northeast-2(서울)/ap-northeast-1(도쿄)이 지연시간에 유리 — 데이터 이관 전인 지금이 리전 변경(프로젝트 재생성)의 마지막 적기. 재생성 시 이 스키마 적용은 자동화돼 있으므로 부담 없음.
- 테스트 계정: `admin@lovable.test / Admin123!`, `user1@lovable.test / User1234!`, `user2@lovable.test / User1234!`
