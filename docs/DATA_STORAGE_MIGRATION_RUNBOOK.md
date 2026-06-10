# DuelNight DB·이미지 이전 실행 가이드

작성일: 2026-06-09
대상: 개발자가 아닌 운영자
목표: 기존 Supabase의 **DB, 로그인 사용자, 이미지 파일**을 새 Supabase 프로젝트로 안전하게 옮깁니다.

> 가장 중요한 원칙: **복사가 끝나고 새 환경 검증이 완료될 때까지 기존 프로젝트를 삭제하거나 중지하지 않습니다.**

---

## 현재 준비 상태

- 새 Supabase 프로젝트 URL: `https://nrtdhkjeziknmafauypv.supabase.co`
- 새 프로젝트 Ref: `nrtdhkjeziknmafauypv`
- 기존 프로젝트 Ref(저장소 기준): `tgybttphkmesgfbtgftt`
- 현재 단계: **새 프로젝트 생성 완료, 키·DB 연결 문자열 준비 전**

저장소에는 안전한 입력 양식인 `.env.example`과 `.env.migration.example`을 둡니다. 실제 키와 DB 비밀번호는 이 파일들을 복사한 로컬 파일에만 입력하고 Git에는 올리지 않습니다.

### 새 프로젝트에서 지금 확인할 위치

1. Supabase Dashboard에서 새 프로젝트를 엽니다.
2. 상단의 **Connect**를 눌러 **Session pooler 연결 문자열**을 확인합니다. 이 값은 `NEW_SUPABASE_DB_URL`에 들어갑니다.
3. **Project Settings → API Keys**에서 Publishable key를 확인합니다.
4. **Project Settings → API Keys → Secret keys**에서 `sb_secret_...` 키를 새로 만들거나 복사합니다. 이 키는 브라우저용이 아니며 절대 공개하면 안 됩니다.
5. Google 로그인을 사용할 예정이면 **Authentication → URL Configuration**과 Google OAuth 설정은 DB 복원 후 새 주소로 설정합니다.

> 새 Supabase는 `sb_secret_...` 형식의 Secret key 사용을 권장합니다. DuelNight 서버도 이제 `SUPABASE_SECRET_KEY`를 우선 사용하고 기존 `SUPABASE_SERVICE_ROLE_KEY`는 호환용 fallback으로만 사용합니다.

### 2026-06-09 입력 상태 자동 점검 결과

- 새 프로젝트 URL: 정상
- Publishable key: 정상
- `VITE_SUPABASE_PUBLISHABLE_KEY`: 동일한 Publishable key로 자동 정리
- `SUPABASE_SERVICE_ROLE_KEY`: Publishable key가 잘못 들어가 있었으므로 로컬 설정에서 제거
- 남은 필수 항목: 새 프로젝트의 `sb_secret_...` Secret key

다음 명령은 비밀 값을 출력하지 않고 설정 종류와 누락만 검사합니다.

```bash
npm run check:supabase
```

실제 인터넷 연결까지 확인하려면 다음 명령을 사용합니다.

```bash
npm run check:supabase:online
```

---

## 1. 무엇부터 해야 하나요?

첫 작업은 “이전 실행”이 아니라 **접근 권한과 백업 가능 여부 확인**입니다.

아래 5가지를 먼저 준비합니다.

- [ ] 기존 Supabase Dashboard에 로그인할 수 있다.
- [ ] 기존 프로젝트의 DB 비밀번호를 확인하거나 재설정할 수 있다.
- [ ] 기존 프로젝트의 `service_role` 키를 확인할 수 있다.
- [ ] 새 Supabase 프로젝트를 만들 수 있다.
- [ ] 이전 시간 동안 사용자 입력을 잠시 멈출 수 있다.

하나라도 불가능하면 실제 이전을 시작하지 않습니다. 특히 `service_role` 키와 DB 비밀번호는 채팅, GitHub, 문서에 붙여넣지 않습니다.

---

## 2. 이번 프로젝트에서 옮겨야 하는 것

Supabase 이전은 한 덩어리가 아니라 다음 네 부분으로 나뉩니다.

| 구분 | 쉬운 설명 | 이전 필요 |
|------|-----------|-----------|
| DB 구조 | 테이블, 함수, RLS 권한 규칙 | 필수 |
| DB 데이터 | 카드, 덱, 전적, 프로필, 결제 기록 등 | 필수 |
| Auth | 로그인 사용자와 비밀번호 해시 | 사용자 계정을 유지하려면 필수 |
| Storage | 실제 이미지 파일 | 필수 |

DuelNight 저장소에는 `card-images` 버킷 생성과 접근 정책이 마이그레이션으로 기록되어 있습니다. 앱에서도 카드 업로드·편집 기능이 이 버킷을 사용합니다.

DB의 `cards.image_url`, `card_illustrations.image_url`, `profiles.avatar_url` 같은 값은 이미지 주소를 저장할 수 있습니다. 파일을 복사해도 주소가 기존 프로젝트 URL을 가리키면 화면에 이미지가 안 보일 수 있으므로 마지막에 URL 점검이 필요합니다.

---

## 3. 가장 안전한 전체 순서

다음 순서를 바꾸지 않는 것을 권장합니다.

1. **기존 환경 목록 작성**
2. **기존 DB 전체 백업**
3. **기존 이미지 파일 목록·개수 기록**
4. **새 Supabase 프로젝트 생성**
5. **DB 복원**
6. **Auth 사용자 확인**
7. **Storage 이미지 복사**
8. **이미지 URL 교체 여부 확인**
9. **새 환경에서 기능 테스트**
10. **최종 동기화 후 앱 환경 변수 변경**
11. **일정 기간 기존 환경 보관**

---

## 4. 1단계 — 기존 환경 목록 작성

기존 Supabase Dashboard에서 아래 내용을 메모합니다. 비밀 키 값 자체는 문서에 적지 않습니다.

### Project Settings
- 프로젝트 이름
- 프로젝트 Ref
- 리전
- Postgres 버전
- 사용 중인 확장 기능

### Authentication
- 이메일 로그인 사용 여부
- Google 로그인 사용 여부
- Redirect URL 목록
- Site URL
- 이메일 템플릿 또는 SMTP 설정

### Storage
- 버킷 이름
- Public/Private 여부
- 파일 개수
- 전체 용량

현재 저장소에서 확인되는 핵심 버킷은 `card-images`입니다. Dashboard에 다른 버킷이 있다면 그 버킷도 반드시 목록에 추가합니다.

---

## 5. 2단계 — DB와 Auth 백업

### 추천 A: Supabase 유료 백업 복원 기능

기존 프로젝트가 유료 플랜이고 “다른 프로젝트로 복원” 기능을 사용할 수 있다면 이것이 가장 단순합니다.

1. 기존 Supabase Dashboard에서 Backups 메뉴를 엽니다.
2. 새 프로젝트로 복원 가능한 백업이 있는지 확인합니다.
3. Supabase 공식 “Restore to another project” 절차로 복원합니다.
4. 복원 완료 후 테이블 수와 사용자 수를 비교합니다.

### 추천 B: CLI 전체 백업·복원

유료 복원 기능을 쓸 수 없다면 Supabase 공식 CLI 절차를 사용합니다.

필요한 프로그램:

- Supabase CLI
- Docker Desktop
- PostgreSQL의 `psql`

백업은 역할, 구조, 데이터를 각각 파일로 만듭니다.

```bash
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"
```

새 프로젝트 복원은 하나의 트랜잭션으로 실행해 중간 실패 시 일부만 들어가는 문제를 줄입니다.

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

> 위 명령은 DB 주소와 비밀번호가 준비된 뒤 Codex와 함께 실행하는 것을 권장합니다. 비밀번호가 포함된 연결 문자열은 Git에 커밋하지 않습니다.

### 왜 저장소의 마이그레이션 파일만 실행하면 안 되나요?

`supabase/migrations/*.sql`은 구조 변경 이력을 재현하는 데 유용하지만, 현재 운영 데이터와 Auth 사용자, 실제 Storage 파일까지 모두 보장하지는 않습니다. 이번 이전은 **전체 백업·복원**을 우선하고, 저장소 마이그레이션은 복원 결과 비교용으로 사용합니다.

---

## 6. 3단계 — 로그인 사용자 확인

Auth를 함께 이전하면 사용자 ID와 비밀번호 해시를 유지할 수 있습니다. 하지만 새 프로젝트는 기본적으로 JWT 서명 키가 다르므로 기존 로그인 세션은 끊길 수 있습니다.

안전한 기본 방침은 다음과 같습니다.

- 사용자 계정과 비밀번호 해시는 이전합니다.
- 전환 후 사용자는 한 번 다시 로그인하도록 안내합니다.
- 기존 JWT Secret을 새 프로젝트에 복사하는 작업은 보안 영향이 있으므로 별도 검토 없이 진행하지 않습니다.
- Google 로그인을 사용한다면 새 프로젝트의 Callback URL을 Google Cloud Console에 추가합니다.

확인할 숫자:

- 기존 `auth.users` 사용자 수
- 새 `auth.users` 사용자 수
- 기존 `public.profiles` 행 수
- 새 `public.profiles` 행 수

사용자 수와 프로필 수가 반드시 같을 필요는 없지만, 이전 전후 같은 테이블의 숫자는 같아야 합니다.

---

## 7. 4단계 — 이미지 파일 이전

### 소량일 때

파일이 몇십 개 정도라면 Dashboard의 Storage에서 직접 내려받고 새 프로젝트에 같은 경로로 올릴 수 있습니다.

### 파일이 많을 때 — 권장

파일이 많다면 수동 다운로드보다 다음 중 하나를 사용합니다.

1. Supabase 공식 Storage migration Node.js 스크립트
2. Supabase S3 호환 기능 + `rclone` 또는 Cyberduck

DuelNight에서는 **기존 경로를 그대로 유지**해야 합니다. 예를 들어 기존 파일이 아래 경로라면 새 프로젝트에도 같은 경로로 올립니다.

```text
card-images/사용자ID/파일명.webp
```

안전한 이전 흐름:

1. 기존 `card-images`의 전체 파일 목록을 가져옵니다.
2. 파일 경로와 개수를 저장합니다.
3. 새 프로젝트에 `card-images` 버킷을 Public으로 생성합니다.
4. 기존 파일을 다운로드합니다.
5. 새 프로젝트의 동일 경로에 업로드합니다.
6. 실패한 파일 목록을 따로 저장합니다.
7. 기존/새 프로젝트 파일 개수를 비교합니다.
8. 무작위로 10개 이상 열어 이미지가 정상인지 확인합니다.

> DB 백업 안의 `storage.objects` 메타데이터와 실제 이미지 파일은 별개입니다. DB만 복원했다고 이미지 파일까지 복사된 것으로 판단하면 안 됩니다.

---

## 8. 5단계 — 이미지 URL 확인 및 교체

공개 Storage URL에는 보통 Supabase 프로젝트 주소가 포함됩니다.

```text
https://OLD_PROJECT_REF.supabase.co/storage/v1/object/public/card-images/경로
```

새 프로젝트로 파일을 복사한 뒤 DB에 위와 같은 전체 URL이 저장되어 있으면 새 프로젝트 주소로 바꿔야 합니다.

먼저 조회만 합니다.

```sql
select count(*)
from public.cards
where image_url like '%/storage/v1/object/public/card-images/%';

select count(*)
from public.card_illustrations
where image_url like '%/storage/v1/object/public/card-images/%';

select count(*)
from public.profiles
where avatar_url like '%/storage/v1/object/public/%';
```

실제 변경 SQL은 기존 URL과 새 URL을 정확히 확인한 뒤 작성합니다. 바로 `UPDATE`를 실행하지 말고 다음 순서를 지킵니다.

1. 변경 대상 행 수 조회
2. 해당 테이블 별도 백업
3. 1~3개 행으로 테스트
4. 이미지 표시 확인
5. 전체 변경
6. 변경 후 이전 URL이 남았는지 재조회

---

## 9. 6단계 — 이전 결과 검증

### DB 검증

주요 테이블의 행 수를 이전 전후 비교합니다.

```sql
select 'cards' as table_name, count(*) from public.cards
union all select 'card_illustrations', count(*) from public.card_illustrations
union all select 'profiles', count(*) from public.profiles
union all select 'decks', count(*) from public.decks
union all select 'deck_cards', count(*) from public.deck_cards
union all select 'matches', count(*) from public.matches
union all select 'user_collection', count(*) from public.user_collection
union all select 'payments', count(*) from public.payments;
```

### Storage 검증

- `card-images` 버킷 Public 설정이 기존과 같은가?
- 기존과 새 프로젝트의 파일 개수가 같은가?
- 하위 폴더 경로가 유지됐는가?
- 실패 목록이 0개인가?
- 카드 이미지 10개 이상이 정상 표시되는가?

### 앱 검증

- 이메일 로그인
- Google 로그인
- 관리자 권한 확인
- 카드 목록과 카드 상세 이미지
- 카드 업로드
- 덱 조회·저장
- 전적 조회·등록
- 컬렉션 조회
- 결제 기록 조회(실제 결제 실행은 별도 테스트 환경에서만)

---

## 10. 최종 전환 방법

검증이 끝난 뒤에만 앱 환경 변수를 새 프로젝트 값으로 바꿉니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

권장 전환 절차:

1. 사용자 입력을 잠시 중단합니다.
2. 마지막 DB 백업과 마지막 이미지 증분 복사를 실행합니다.
3. 새 프로젝트의 최종 개수를 다시 확인합니다.
4. Preview 환경 변수를 먼저 변경합니다.
5. Preview QA를 통과합니다.
6. Production 환경 변수를 변경합니다.
7. 로그인과 카드 이미지부터 즉시 확인합니다.
8. 최소 1~2주 동안 기존 프로젝트를 삭제하지 않습니다.

---

## 11. 지금 운영자가 해야 할 일

새 Supabase 프로젝트 생성은 완료되었습니다. 이제 아래 세 가지만 진행하면 됩니다.

1. **새 프로젝트 Dashboard의 Connect에서 새 DB 연결 문자열을 확인합니다.**
2. **기존 프로젝트에서 DB 연결 문자열과 서버용 `service_role` 키를 확인할 수 있는지 확인합니다.**
3. **기존 Storage 화면에서 버킷 이름, 파일 개수, 전체 용량을 메모합니다.**

그 다음 Codex에 아래처럼 요청하면 됩니다.

> 기존/새 Supabase 접근 정보는 준비했습니다. 비밀 값은 채팅에 보내지 않고 로컬 `.env`에 넣겠습니다. DB 전체 백업·복원 명령과 `card-images` 복사 스크립트를 이 프로젝트에 안전하게 만들어 주세요. 먼저 dry-run과 파일 개수 비교 기능부터 구현해 주세요.

---

## 12. 절대 하지 말아야 할 것

- 새 환경이 검증되기 전에 기존 Supabase 프로젝트 삭제
- `service_role` 키를 GitHub나 채팅에 공개
- 운영 중인 상태에서 마지막 동기화 없이 환경 변수 변경
- DB 행 수와 Storage 파일 개수를 비교하지 않고 완료 처리
- 이미지 파일을 복사하지 않고 DB URL만 변경
- 백업 없이 대량 `UPDATE` 실행

---

## 13. 공식 참고 문서

- Supabase 프로젝트 간 이전: https://supabase.com/docs/guides/platform/migrating-within-supabase
- CLI 백업·복원과 Storage 이전: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Auth 사용자 이전 주의사항: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- Storage 파일 다운로드 방법: https://supabase.com/docs/guides/storage/management/download-objects
