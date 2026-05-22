## 목표

외부 테스터가 Preview URL로 접근해 QA할 때, **실서비스 데이터를 오염시키지 않도록 운영 규칙을 docs에 정리**합니다. 코드/DB 변경은 없습니다 (현재 구조 유지).

## 배경

- Preview와 Published는 **같은 DB(Lovable Cloud)를 공유**
- 외부 공유는 **Share → Share preview**로 7일 공개 링크 발급
- 따라서 격리는 **운영 규칙(컨벤션)** 으로 달성

## 작성할 문서

### 1. `docs/EXTERNAL_TESTING_GUIDE.md` (신규)

**섹션 구성:**

1. **테스트 URL 발급 절차**
   - Share preview 7일 링크 생성 방법
   - 만료 시 재발급 절차
   - 테스터에게 전달할 안내 템플릿

2. **테스터용 계정 규칙 (필수)**
   - 이메일 prefix: `test+<닉네임>@duelnight.app` 또는 `qa_<번호>@...`
   - 닉네임 prefix: `[TEST]` 또는 `qa_`
   - 데모 카드덱/대회명 prefix: `TEST_`
   - → 실유저와 시각적으로 구분 + 추후 일괄 정리 가능

3. **테스터 금지 행위**
   - 결제/유료 기능 실행 (실결제 위험)
   - 실유저 프로필/덱 수정·삭제
   - 운영자 권한이 필요한 기능 시도
   - 대량 데이터 입력 (부하 테스트 금지)

4. **운영자 사전 체크리스트 (테스트 오픈 전)**
   - 결제 모듈 테스트 모드 확인
   - 관리자 계정 비밀번호 점검
   - DB 백업 시점 기록
   - 테스트 시작/종료 시각 기록

5. **테스트 종료 후 정리 절차**
   - `test_`/`qa_` prefix 데이터 SQL 조회 쿼리 예시
   - Lovable Cloud 백엔드에서 일괄 삭제 방법
   - 이슈 리포트 수집 양식

6. **버그 리포트 양식**
   - 재현 경로 / 기대 / 실제 / 스크린샷 / 테스터 계정

### 2. `mem://workflow/external-testing` (신규 메모리)

핵심 규칙 1줄 요약 + 위 문서 참조 링크.

### 3. `mem://index.md` 업데이트

Memories 섹션에 `external-testing` 항목 추가.

## 변경하지 않는 것

- 소스 코드, DB 스키마, RLS 정책
- 인증 흐름
- 배포 파이프라인

## 산출물

- `docs/EXTERNAL_TESTING_GUIDE.md` 1개 신규
- `mem://workflow/external-testing` 1개 신규
- `mem://index.md` 1줄 추가
