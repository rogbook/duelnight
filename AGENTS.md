# AGENTS.md — Codex · Antigravity 공통 지침

이 프로젝트의 모든 AI 도구(Claude, Codex, Antigravity)는 **[CLAUDE.md](./CLAUDE.md)의 규칙을 동일하게 따른다.**
운영 계획·역할 분담은 [docs/OPERATIONS_PLAN.md](./docs/OPERATIONS_PLAN.md) 참고.

## 핵심 규칙 요약 (상세는 CLAUDE.md)

1. **이 저장소는 Lovable과 동기화되지 않는 독립 저장소다.** 테스터 운영 중인 Lovable 서비스(duelnight.app)와는 별개이며, Lovable 쪽 수정은 여기서 하지 않는다.
2. **DB**: 사용자 소유 Supabase `nrtdhkjeziknmafauypv`. 스키마 변경 SQL은 `supabase/migrations/`에 파일로 보관한다.
3. **비밀 키**: `.env` 커밋 절대 금지(과거 유출로 히스토리까지 정리했음). 로컬 키는 `.env.local`/`.dev.vars`(gitignore됨). 관리자 키 환경변수는 `SUPABASE_SERVICE_ROLE_KEY` 하나만 사용 — `SUPABASE_SECRET_KEY` 변수를 코드에 추가하지 말 것.
4. **검증 게이트**: 커밋 전 `bun run build` 통과 필수. 실패 시 커밋 금지.
5. **git 규율**: 작업 시작 전 `git pull`, 종료 시 즉시 커밋·push. 다른 도구와 같은 영역 동시 작업 금지. 커밋 메시지에 도구 표기 권장 (예: `fix: ... (codex)`).
6. **문서화**: 의미 있는 작업 완료 시 `docs/`에 기록을 남긴다.
7. 코드 품질·에러 방지 체크리스트는 CLAUDE.md §1~2를 그대로 적용한다.
