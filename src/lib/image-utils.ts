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

/** 회전(0/90/180/270)과 정규화 좌표(0~1) crop을 적용해 WebP File로 반환. */
export async function rotateAndCropToWebp(
  src: string | Blob,
  rotation: 0 | 90 | 180 | 270,
  crop: { x: number; y: number; w: number; h: number } | null,
  opts: { maxWidth?: number; quality?: number; filename?: string } = {},
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1024;
  const quality = opts.quality ?? 0.85;
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob);

  // 회전 후 기준 가로/세로
  const rotated = rotation % 180 !== 0;
  const rW = rotated ? bmp.height : bmp.width;
  const rH = rotated ? bmp.width : bmp.height;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cropPxW = Math.max(1, Math.round(c.w * rW));
  const cropPxH = Math.max(1, Math.round(c.h * rH));

  const scale = Math.min(1, maxWidth / cropPxW);
  const outW = Math.max(1, Math.round(cropPxW * scale));
  const outH = Math.max(1, Math.round(cropPxH * scale));

  // 회전된 전체 이미지를 그릴 임시 캔버스
  const stage = document.createElement("canvas");
  stage.width = rW;
  stage.height = rH;
  const sctx = stage.getContext("2d")!;
  sctx.translate(rW / 2, rH / 2);
  sctx.rotate((rotation * Math.PI) / 180);
  sctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close?.();

  // crop + resize
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  out.getContext("2d")!.drawImage(
    stage,
    Math.round(c.x * rW), Math.round(c.y * rH), cropPxW, cropPxH,
    0, 0, outW, outH,
  );

  const outBlob: Blob | null = await new Promise((res) =>
    out.toBlob((b) => res(b), "image/webp", quality),
  );
  if (!outBlob) throw new Error("이미지 변환 실패");
  return new File([outBlob], opts.filename ?? `edited-${Date.now()}.webp`, { type: "image/webp" });
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
