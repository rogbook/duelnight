/**
 * 현재 호스트를 보고 Preview(테스트) 환경이면 상단에 경고 배너를 띄운다.
 * - Published(duelnight.app, 커스텀 도메인)에서는 표시 안 함.
 * - 사용자가 닫으면 세션 동안 다시 뜨지 않음.
 */
export function EnvBanner() {
  // 사용자 요청: 상단 "테스트 환경" 배너는 항상 숨김.
  return null;
}
