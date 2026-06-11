# 외부 테스터 운영 가이드

> Preview URL을 외부 테스터에게 공유할 때 **실서비스 데이터를 보호**하기 위한 운영 규칙.
> Preview와 Published(`duelnight.app`)는 **같은 DB를 공유**하므로, 코드 격리가 아닌 **운영 규칙(컨벤션)** 으로 분리한다.

---

## 1. 테스트 URL 발급 절차

### Share Preview 링크 생성

1. Lovable 에디터 우측 상단 **Share** 버튼 클릭 (모바일은 우측 하단 `...`)
2. **Share preview** 선택 → 공개 링크 생성
3. 링크 형태: `https://preview--<id>.lovable.app/...`
4. **유효기간: 7일** (만료 시 같은 절차로 재발급)

### 테스터 안내 템플릿

```
안녕하세요, DuelNight 베타 테스트에 참여해주셔서 감사합니다.

▶ 테스트 URL: <공개 링크>
▶ 유효기간: YYYY-MM-DD 까지 (7일)
▶ 테스트 계정 규칙: 아래 '계정 생성 규칙' 준수 필수
▶ 버그 리포트: <노션/구글폼/디스코드 채널 링크>

⚠️ 본 테스트 환경은 실서비스와 DB를 공유합니다.
   실유저 데이터 수정/삭제, 결제 기능 실행은 절대 금지입니다.
```

---

## 2. 테스터 계정 생성 규칙 (필수)

| 항목          | 규칙                                                    | 예시                        |
| ------------- | ------------------------------------------------------- | --------------------------- |
| 이메일        | `test+<닉네임>@duelnight.app` 또는 `qa_<번호>@<도메인>` | `test+alice@duelnight.app`  |
| 닉네임        | `[TEST]` 또는 `qa_` prefix                              | `[TEST]앨리스`, `qa_user01` |
| 카드덱/대회명 | `TEST_` prefix                                          | `TEST_엘드라조 데모`        |

→ 실유저와 시각적으로 구분되며, 테스트 종료 후 prefix로 **일괄 식별/정리** 가능.

---

## 3. 테스터 금지 행위

- ❌ **결제/유료 기능 실행** (실결제 위험)
- ❌ **실유저 프로필/덱/대회 수정·삭제**
- ❌ **관리자 권한이 필요한 기능 시도**
- ❌ **대량 데이터 입력** (부하 테스트 금지)
- ❌ **외설/불법 콘텐츠 업로드**

위반 시 테스터 권한 즉시 회수 및 데이터 삭제.

---

## 4. 운영자 사전 체크리스트 (테스트 오픈 전)

- [ ] 결제 모듈이 **테스트 모드**로 설정되어 있는지 확인
- [ ] 관리자 계정 비밀번호 점검 및 2FA 활성화
- [ ] **DB 백업 시점 기록** (Lovable Cloud → Database → Backups)
- [ ] 테스트 시작/종료 예정 시각 문서화
- [ ] 버그 리포트 수집 채널 준비 (노션/구글폼/디스코드)
- [ ] 현재 Preview 빌드가 최신인지 확인 (Preview URL 직접 접속)

---

## 5. 테스트 종료 후 정리 절차

### 5-1. 테스트 데이터 조회 (SQL 예시)

Lovable Cloud → SQL Editor에서 실행:

```sql
-- 테스트 계정 조회
SELECT id, email, created_at
FROM auth.users
WHERE email LIKE 'test+%@duelnight.app'
   OR email LIKE 'qa_%';

-- 테스트 프로필 조회
SELECT id, nickname, created_at
FROM public.profiles
WHERE nickname LIKE '[TEST]%'
   OR nickname LIKE 'qa_%';

-- 테스트 카드덱/대회 조회 (테이블명은 실제에 맞춰 조정)
SELECT * FROM public.decks       WHERE name LIKE 'TEST\_%' ESCAPE '\';
SELECT * FROM public.tournaments WHERE name LIKE 'TEST\_%' ESCAPE '\';
```

### 5-2. 일괄 삭제

1. 위 조회 결과를 백업 (CSV export)
2. **참조 관계가 있는 자식 테이블부터 삭제** (덱 → 프로필 → auth.users 순)
3. 삭제는 마이그레이션을 통해 진행 (실DB 직접 DELETE 지양)

### 5-3. 사후 리뷰

- 발견된 이슈를 GitHub Issues 또는 노션에 정리
- 우선순위 분류 (Critical / High / Normal / Nice-to-have)
- 다음 빌드 일정에 반영

---

## 6. 버그 리포트 양식

```markdown
**제목**: [영역] 한 줄 요약

**테스터 계정**: test+alice@duelnight.app
**발생 시각**: 2026-05-22 14:30 KST
**브라우저/기기**: Chrome 125 / iPhone 15 Safari

**재현 경로**:

1. 로그인 → 대회 페이지 이동
2. '참가하기' 버튼 클릭
3. ...

**기대 동작**: 참가 확인 모달이 뜬다
**실제 동작**: 빈 화면이 뜨고 콘솔에 에러 발생

**스크린샷/영상**: <첨부>
**콘솔 에러**: <복붙>
```

---

## 관련 문서

- [배포 프로세스](./DEPLOY_PROCESS.md)
- [협업 가이드](./COLLABORATION_GUIDE.md)
