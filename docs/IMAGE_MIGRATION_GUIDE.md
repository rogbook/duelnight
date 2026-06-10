# DuelNight 이미지 이관 가이드

기존 Lovable Supabase의 공개 `card-images` 버킷을 새 독립 Supabase로 증분 복사하고, 새 DB의 이전 프로젝트 `image_url`을 새 공개 URL로 변경한다.

## 안전 원칙

- 기본 실행은 쓰기 없는 dry-run이다.
- 원본 프로젝트는 목록 조회와 다운로드만 수행한다.
- 대상 버킷은 자동 생성하지 않는다. 버킷/RLS 변경은 Claude 담당 작업이다.
- `--execute`에서만 대상 Storage와 DB를 변경한다.
- 업로드한 파일과 기존 동일 크기 파일은 SHA-256으로 검증한다.
- 파일 처리 실패가 하나라도 있으면 DB URL을 변경하지 않는다.
- DB 갱신은 기존 `image_url`이 그대로인 행만 변경해 동시 작업을 덮어쓰지 않는다.
- 모든 실행 결과는 `backups/image-migration/`의 JSON 보고서로 남는다.

## 환경 변수

새 클론의 `.env.local`에 다음 값을 설정한다. 실제 키를 채팅, 문서, 커밋 또는 로그에 출력하지 않는다.

```ini
SUPABASE_URL=https://nrtdhkjeziknmafauypv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=새_프로젝트_관리자_키

# 생략하면 기존 Lovable 프로젝트 URL을 사용한다.
SOURCE_SUPABASE_URL=https://tgybttphkmesgfbtgftt.supabase.co
SOURCE_SUPABASE_PUBLISHABLE_KEY=기존_프로젝트_공개_키
```

`SOURCE_SUPABASE_PUBLISHABLE_KEY`는 원본 버킷 목록과 공개 파일 다운로드에만 사용한다. 원본 관리자 키는 사용하지 않는다.

## 실행 순서

### 1. 도움말과 단위 테스트

```bash
bun run migrate-images --help
bun run test:migrate-images
```

### 2. Dry-run

원본과 대상의 파일 경로·크기를 비교한다. 파일이나 DB를 변경하지 않는다.

```bash
bun run migrate-images
```

소량만 점검하려면:

```bash
bun run migrate-images --limit 20
```

기존 동일 크기 파일까지 다운로드해 SHA-256을 비교하려면:

```bash
bun run migrate-images --verify-existing
```

### 3. 시험 복사

DB URL을 건드리지 않고 Storage 파일 20개만 복사·검증한다.

```bash
bun run migrate-images --execute --skip-db-update --limit 20
```

### 4. 전체 실행

원본 전체를 증분 복사하고 검증을 통과한 경로에 한해 `cards.image_url`과 `card_illustrations.image_url`을 변경한다.

```bash
bun run migrate-images --execute
```

실행 모드에서는 대상에 같은 경로와 크기의 파일이 있어도 SHA-256을 비교한다. 파일이 없으면 복사하고, 크기가 다르면 덮어쓴 뒤 다시 다운로드해 검증한다.

## 옵션

| 옵션 | 설명 |
|---|---|
| `--execute` | 실제 Storage 복사와 DB URL 갱신 |
| `--verify-existing` | dry-run에서도 동일 크기 파일 SHA-256 검증 |
| `--skip-db-update` | Storage만 처리 |
| `--limit <n>` | 앞에서부터 n개 객체만 처리 |
| `--concurrency <n>` | 동시 다운로드·업로드 수, 기본 4 |
| `--max-bytes <n>` | 파일당 최대 바이트, 기본 20 MiB |
| `--report <path>` | JSON 보고서 경로 지정 |

## 완료 판정

1. JSON 보고서에서 `failed=0`, `databaseFailed=0` 확인
2. 원본 파일 수와 대상 파일 수 비교
3. 두 번째 `--execute` 실행에서 신규 복사 없이 기존 파일 검증만 수행되는지 확인
4. 새 DB의 이전 프로젝트 URL 잔여 행이 0인지 확인
5. 앱의 카드 목록·상세·일러스트 화면에서 이미지 확인
6. 완료 후 Claude 보안 검토 수행

원본 버킷과 기존 Lovable DB는 전환 안정화가 끝날 때까지 삭제하거나 수정하지 않는다.
