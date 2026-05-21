# Release Notes

> Publish 할 때마다 상단에 새 항목 추가. 형식 유지.

---

## 템플릿

```markdown
## YYYY-MM-DD — vX.Y.Z

**릴리스 매니저**: @handle

### 변경 요약
- (UI) ...
- (기능) ...
- (DB) ...

### QA 결과
- 체크리스트: PASS (실패 항목 없음 / 또는 #이슈 링크)
- 마이그레이션: 없음 / 적용됨 (요약)

### 롤백 방법
- 프론트: 버전 히스토리에서 YYYY-MM-DD HH:MM 시점 복원
- DB: (해당 시) `migrations/down/xxxx.sql`
```

---

## 2026-05-21 — 배포 운영 프로세스 도입

**릴리스 매니저**: 운영팀

### 변경 요약
- (운영) Preview = 테스트, Published = 실운영 2단계 배포 워크플로 정의
- (UI) Preview 환경 상단 노란 경고 배너 추가 (`src/components/env-banner.tsx`)
- (문서) `DEPLOY_PROCESS.md`, `QA_CHECKLIST.md`, `RELEASES.md` 신규

### QA 결과
- 체크리스트: 신규 적용 — 다음 배포부터 전체 실행
- 마이그레이션: 없음

### 롤백 방법
- 프론트: 본 커밋 이전으로 복원
- DB: 해당 없음
