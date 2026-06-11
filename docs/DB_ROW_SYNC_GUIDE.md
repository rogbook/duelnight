# DB 행 동기화 가이드 (옛 Lovable DB → 새 DB)

작성일: 2026-06-11 | 담당: Claude | 스크립트: [scripts/sync-from-lovable.ts](../scripts/sync-from-lovable.ts)

> 옛 Lovable DB(`tgybttphkmesgfbtgftt`)의 행 데이터를 새 DB(`nrtdhkjeziknmafauypv`)로 복사하는
> **재실행 가능한** 동기화 도구. upsert 기반이라 몇 번을 실행해도 안전하며,
> 전환(컷오버) 시점에 마지막 1회 실행해 최종 데이터를 확보한다.

## 사용법

```bash
bun run sync-db                    # dry-run (쓰기 없음, 계획만 출력)
bun run sync-db --execute          # 실제 반영
bun run sync-db --execute --prune  # + 카탈로그 테이블의 시드 잔여물 정리
bun run sync-db --tables cards,card_illustrations  # 일부 테이블만
bun run test:sync-db               # 단위 테스트 (17건)
```

필수 환경 변수(`.env.local`): `SOURCE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
선택: `SOURCE_SUPABASE_SERVICE_ROLE_KEY` — 원본의 비공개(RLS) 테이블까지 읽을 때.

## 동작 방식

- **대상 39개 테이블**을 FK 의존 순서대로 처리. 제외 2개: `oauth_states`(만료성), `user_drive_tokens`(OAuth 시크릿).
- **upsert 식별자**: 기본 PK. 단 `cards`는 시드 데이터와 id가 달라 unique한 `code` 사용.
- **URL 재작성**: 모든 문자열·JSONB 필드에서 옛 프로젝트 Storage URL → 새 프로젝트로 치환.
- **사용자 보류(deferred-no-user)**: `auth.users` FK가 있는 테이블(profiles, decks, payments 등 12개)은
  대상에 해당 사용자가 없으면 그 행을 보류하고 보고서에 기록. **Auth 사용자 이관 후 재실행하면 자동 반영.**
- **FK 보류(deferred-fk)**: 부모 행이 아직 없어 실패한 행도 보류로 분류(실패 아님).
- **--prune**: 카탈로그 테이블(games, card_sets, cards, card_illustrations, announcements, tier_lists)에서
  원본에 없는 대상 행(시드 잔여물)을 삭제. 원본 조회가 0건이면 안전을 위해 prune하지 않음.
- 보고서: `backups/db-sync/report-*.json` (gitignore 대상).

## 2026-06-11 1차 실행 결과

| 항목        | 결과                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| 반영        | **4,212건** (cards 3,841 / card_sets 108 / card_illustrations 212 / stores 24 / events 11 등)                              |
| 사용자 보류 | 13건 (실사용자 profiles 3, decks 10 — Auth 이관 후 재실행 시 반영)                                                         |
| FK 보류     | 1건 (lfg_comments 1 — 부모 lfg_post가 anon 읽기 불가)                                                                      |
| 시드 정리   | 16건 + 시드 일러스트 4건은 시드 카드 삭제 시 cascade 정리                                                                  |
| 실패        | **0건**                                                                                                                    |
| 검증        | 옛 URL 잔존 0건 / 카드 이미지 호스트: digimoncard.co.kr 3,097 · 자체 Storage 629 · Google Drive 115 / 샘플 이미지 HTTP 200 |

## 전환(컷오버) 시점 절차

1. Auth 사용자 이관 (별도 절차 — 또는 테스터 재가입 안내)
2. `.env.local`에 `SOURCE_SUPABASE_SERVICE_ROLE_KEY` 설정 (비공개 테이블: matches, user_collection, payments 등)
3. `bun run migrate-images --execute` (신규 이미지 증분)
4. `bun run sync-db --execute --prune` → 보고서에서 보류·실패 0건 확인
