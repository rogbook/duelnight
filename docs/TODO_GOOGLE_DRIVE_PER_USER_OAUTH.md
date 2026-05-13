# [보류] 사용자별 Google Drive 연동 (per-user OAuth)

> 상태: **보류 (Phase 2 후속)**
> 결정일: 2026-05-13
> 결정 사유: 구현 비용이 크고, 우선 다른 Phase(검수 큐·감사 로그 등)부터 진행하기로 함.
> 재개 시점: 카드 등록 워크플로우가 안정화되어 일반 사용자도 본인 드라이브에서 카드 이미지를 가져올 필요가 생겼을 때.

---

## 1. 목표

`/cards/upload` 페이지에서 **각 사용자가 본인 Google Drive 계정**을 연결해, 본인 드라이브 폴더에 있는 카드 이미지들을 일괄 가져오기.

- 관리자 1명만 쓰는 경우(= Lovable Google Drive 커넥터)와 다름.
- 사용자마다 OAuth로 인증 → 본인 토큰을 DB에 저장 → 본인 파일만 접근.

## 2. 사용자(운영자) 사전 준비

Lovable이 대신 못 하므로 **운영자가 Google Cloud Console에서 직접** 수행해야 함.

1. https://console.cloud.google.com 에서 프로젝트 생성/선택
2. **APIs & Services → Library** → "Google Drive API" → **Enable**
3. **OAuth consent screen** 구성
   - User Type: **External**
   - 앱 이름, 지원 이메일, 개발자 이메일 입력
   - **Scopes 추가**: `https://www.googleapis.com/auth/drive.readonly`
   - 배포 전이면 **Test users**에 사용할 이메일 등록 (배포 후에는 publish 필요)
4. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs**:
     - `https://tcg-hub.lovable.app/auth/google-drive/callback`
     - `https://id-preview--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app/auth/google-drive/callback`
     - (커스텀 도메인 추가 시 함께 등록)
5. 발급된 **Client ID**, **Client Secret** 확보

## 3. Lovable 시크릿 등록 (재개 시)

```
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
```

## 4. 구현 체크리스트

### 4-1. DB 마이그레이션
- [ ] `user_drive_tokens` 테이블 생성
  - `user_id uuid PK references auth.users on delete cascade`
  - `access_token text not null`
  - `refresh_token text not null`
  - `expires_at timestamptz not null`
  - `scope text`
  - `connected_email text` (UI 표시용)
  - `created_at`, `updated_at`
- [ ] RLS 활성화: 본인 행만 select / insert / update / delete
- [ ] `touch_updated_at` 트리거 부착
- [ ] **보안 메모**: 토큰은 평문 저장됨. 가능하면 `pgsodium` 또는 KMS로 암호화 검토.

### 4-2. 서버 라우트 (TanStack Start, `src/routes/api/drive/`)
- [ ] `auth.ts` — `GET /api/drive/auth` : `state`(CSRF 방지) 생성 후 Google authorize URL로 redirect
- [ ] `callback.ts` — `GET /auth/google-drive/callback` : `code` → token 교환, `user_drive_tokens` upsert, `/cards/upload?drive=connected` 로 redirect
- [ ] `list-folder.ts` — `POST /api/drive/list-folder` : `{ folder_url }` 받아 folderId 추출, Drive API `files.list` 호출 (image/* 필터, pageSize 100), 만료 시 refresh
- [ ] `import.ts` — `POST /api/drive/import` : `{ file_ids[] }` 받아 각 파일 다운로드(`alt=media`) → WebP 변환 → `card-images` 버킷 업로드 → `{ rows: [{ code, set_code, image_url }] }` 반환
- [ ] `disconnect.ts` — `POST /api/drive/disconnect` : 본인 토큰 행 삭제 + Google `revoke` 호출

### 4-3. 공통 헬퍼 (`src/lib/google-drive.server.ts`)
- [ ] `getValidAccessToken(userId)` : 만료 시 refresh, DB 갱신
- [ ] `extractFolderId(url)` : `/folders/{id}` / `?id={id}` 패턴 파싱
- [ ] `driveFetch(token, path, init?)` : 공통 fetch 래퍼

### 4-4. UI 통합 (`src/components/cards/card-uploader.tsx`)
- [ ] Tabs에 **"Google Drive"** 탭 추가
- [ ] 미연결 상태: "내 Google Drive 연결" 버튼 → `/api/drive/auth` 이동
- [ ] 연결 상태: 연결된 이메일 표시 + "연결 해제" 버튼
- [ ] 폴더 URL 입력 → "미리보기" → 썸네일 그리드 + 파일별 체크박스 + "전체 선택"
- [ ] "선택 가져오기" → 진행률 표시 → 행 자동 추가 → 기존 OCR 흐름과 자연스럽게 연동
- [ ] `?drive=connected` 쿼리 파라미터 도착 시 toast 표시 + 쿼리 정리

### 4-5. 보안·UX 체크
- [ ] OAuth `state`로 CSRF 방어 (서명된 JWT 또는 short-lived 쿠키)
- [ ] Refresh token 회전 시 새 값 저장
- [ ] 한 번에 가져오는 파일 수 제한 (50건/요청)
- [ ] Drive 다운로드 후 즉시 WebP 변환 (현재 `compressToWebp` 재사용 가능 — 단 서버 환경에서 동작하도록 sharp 또는 가능하면 클라이언트에서 변환)
- [ ] Token revoke 실패해도 DB에서는 삭제

### 4-6. 테스트 시나리오
- [ ] 신규 연결 → 폴더 미리보기 → 5건 가져오기 → 행 추가 확인
- [ ] 토큰 만료 시 refresh 자동 동작
- [ ] 비공개 파일도 본인 권한이면 가져와짐 (커넥터 방식과의 차별점)
- [ ] 연결 해제 후 미리보기 호출 시 "재연결 필요" 응답
- [ ] 다른 사용자의 token으로 접근 불가 (RLS 검증)

## 5. 대안

구현 비용이 계속 부담된다면:
- **A안 (관리자 전용)**: Lovable `google_drive` 커넥터로 전환 — 운영자 1명의 드라이브만 쓸 수 있지만 구현 30분.
- **B안 (단순 업로드)**: Drive 연동을 포기하고 현재의 "이미지 대량 업로드" + OCR 흐름만 유지.

## 6. 참고 자료

- Google Drive API v3: https://developers.google.com/drive/api/v3/reference/files
- OAuth 2.0 for Web Server Apps: https://developers.google.com/identity/protocols/oauth2/web-server
- 프로젝트 내 관련 파일:
  - `src/components/cards/card-uploader.tsx` (통합 지점)
  - `src/lib/image-utils.ts` (`compressToWebp` 재사용)
  - `src/routes/api/card-ocr.ts` (서버 라우트 패턴 참고)
