import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";

/**
 * 이미지 프록시 — 핫링크(referer) 차단 우회용.
 * 외부 카드 이미지를 우리 서버가 대신 받아 스트리밍한다.
 * (원본 사이트가 우리 도메인 직접 참조를 막을 때 깨짐 방지)
 *
 * 사용: <img src="/api/img-proxy?url=<인코딩된 원본 URL>" />
 * 보안: http/https만, 사설/내부 IP 차단(SSRF), 이미지 콘텐츠만 통과.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function hostBlocked(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "169.254.169.254") return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export const Route = createFileRoute("/api/img-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const raw = reqUrl.searchParams.get("url");
        if (!raw) return new Response("missing url", { status: 400 });

        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("invalid url", { status: 400 });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return new Response("unsupported protocol", { status: 400 });
        }
        if (hostBlocked(target.hostname)) {
          return new Response("blocked host", { status: 400 });
        }

        try {
          const res = await fetch(target.toString(), {
            headers: {
              "User-Agent": BROWSER_UA,
              Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
              // 같은 출처에서 온 것처럼 보이게 해 referer 핫링크 차단을 우회
              Referer: target.origin + "/",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            return new Response("upstream error", { status: 502 });
          }
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.toLowerCase().startsWith("image/")) {
            // 오픈 프록시 악용 방지 — 이미지만 통과
            return new Response("not an image", { status: 415 });
          }

          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
              "Content-Disposition": "inline",
            },
          });
        } catch (e) {
          console.error("img-proxy error", e);
          return new Response("fetch failed", { status: 502 });
        }
      },
    },
  },
});
