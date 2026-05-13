/** 이미지 파일을 WebP로 변환하고 최대 가로폭으로 리사이즈합니다. */
export async function compressToWebp(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 800;
  const quality = opts.quality ?? 0.82;
  if (!file.type.startsWith("image/")) return file;

  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;

  const scale = Math.min(1, maxWidth / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality),
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

/** 이미지 URL을 base64 data URL로 변환 (OCR 입력용). 8MB 초과 시 거부. */
export async function urlToDataUrl(url: string, maxBytes = 8 * 1024 * 1024): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 로드 실패 (${res.status})`);
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error("이미지가 너무 큽니다 (8MB 초과)");
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `data:${ct};base64,${b64}`;
}
