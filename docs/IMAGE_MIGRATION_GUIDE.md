# DuelNight DB 이미지 이관 가이드

기존 Supabase Storage에 저장된 카드 일러스트 및 이미지들을 새로 독립 가동할 Supabase Storage로 가져오는 자동 이관 방법 설명서입니다.

---

## 1. 작동 원리

이관 스크립트(`scripts/migrate-images.ts`)는 다음 단계로 실행됩니다:

1. **테이블 스캔**: 새 Supabase DB의 `cards` 및 `card_illustrations` 테이블에서 이전 Supabase 스토리지(예: `tgybttphkmesgfbtgftt.supabase.co`)를 가리키는 이미지 URL 목록을 수집합니다.
2. **버킷 확인**: 새 Supabase에 `card-images` 버킷이 없는 경우 퍼블릭 버킷으로 자동 생성합니다.
3. **다운로드 및 업로드**: 예전 URL을 통해 퍼블릭 인터넷 망을 통해 원본 이미지를 다운로드하고, 이를 새 Supabase `card-images` 버킷으로 동일 경로에 실시간으로 업로드합니다.
4. **URL 업데이트**: 업로드가 완료되면 데이터베이스 레코드의 `image_url`을 신규 Supabase 퍼블릭 URL로 일괄 업데이트합니다.

이 방식은 이전 Supabase의 관리자 비밀키가 없더라도, **공개 노출된 기존 이미지 링크를 활용하여 이관하므로 안전하고 간편**합니다.

---

## 2. 사전 요구 사항

1. **데이터베이스 데이터 이관 완료**:
   * SQL Editor 복사/붙여넣기 또는 CSV 등을 이용해 예전 테이블의 텍스트 데이터(스키마 포함)가 새 Supabase DB로 복제되어 있어야 합니다.
2. **환경 변수 구성**:
   * 프로젝트 루트의 `.env.local` 파일에 새 Supabase 프로젝트 정보가 입력되어야 합니다.
   ```ini
   SUPABASE_URL="https://YOUR_NEW_PROJECT_REF.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="YOUR_NEW_SERVICE_ROLE_KEY"
   ```

---

## 3. 이관 실행 방법

프로젝트 루트 폴더 터미널에서 다음 명령어를 실행합니다.

### Bun 환경 (권장)
```bash
bun run migrate-images
```

### Node.js 환경
```bash
npm run migrate-images
```

---

## 4. 이관 후 확인 및 검증

1. **데이터베이스 확인**:
   * [Supabase 대시보드](https://supabase.com/) -> SQL Editor 또는 Table Editor에서 `cards` 테이블을 확인하여 `image_url`에 새 프로젝트 Reference(`nrtdhkjeziknmafauypv`)가 정상적으로 포함되어 있는지 확인합니다.
2. **스토리지 확인**:
   * Supabase 대시보드 -> **Storage > card-images** 버킷을 열어 이관된 이미지 폴더와 파일들이 잘 업로드되었는지 확인합니다.
3. **앱 구동 테스트**:
   * `npm run dev`를 실행하고 브라우저에서 카드 데이터와 이미지가 깨짐 없이 올바르게 출력되는지 최종 확인합니다.
