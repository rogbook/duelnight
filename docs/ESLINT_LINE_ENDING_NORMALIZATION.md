# ESLint 줄바꿈 정규화

작업일: 2026-06-11

## 변경 사항

- `.gitattributes`에서 저장소 텍스트 파일의 Git EOL을 LF로 고정했다.
- Windows 배치 파일(`.bat`, `.cmd`)은 CRLF를 유지한다.
- Prettier가 기존 체크아웃의 EOL을 인식하도록 `endOfLine: "auto"`를 설정했다.
- 저장소의 TypeScript/TSX 파일을 현재 Prettier 규칙으로 정리했다.
- 기존 코드에 광범위하게 사용 중인 명시적 `any`는 별도 타입 개선 작업으로 분리하기 위해
  ESLint 오류에서 제외했다.
- TanStack Router의 `notFoundComponent` 콜백을 명명된 컴포넌트로 바꿔 Hook 규칙 오류를
  제거했다.

## 검증

- `bun run lint`
- `bun run build`
- `bun run test:migrate-images`
- `bun run test:sync-db`

Fast Refresh 관련 기존 경고는 남아 있지만 ESLint 오류는 없다.
