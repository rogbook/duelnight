/**
 * 표시용 이미지 src 변환 — 외부(핫링크 차단 가능) 카드 이미지는 /api/img-proxy 경유.
 * 우리 스토리지(supabase)·구글 드라이브·자체 CDN·상대경로/데이터URI는 원본 그대로 사용.
 */
export function displayImageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const s = String(url).trim();
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) return s; // 상대경로 / data:
  try {
    const h = new URL(s).hostname.toLowerCase();
    // 우리/신뢰 출처는 프록시 불필요
    if (h.endsWith("supabase.co")) return s;
    if (h.endsWith("google.com") || h.endsWith("googleusercontent.com") || h.endsWith("ggpht.com"))
      return s;
    if (h.endsWith("r2.dev") || h.endsWith("cloudflarestorage.com")) return s;
  } catch {
    return s;
  }
  return `/api/img-proxy?url=${encodeURIComponent(s)}`;
}
