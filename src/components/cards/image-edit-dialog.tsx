import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, RotateCw, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { rotateAndCropToWebp } from "@/lib/image-utils";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  imageUrl: string | null;
  setCode?: string;
  cardCode?: string;
  onClose: () => void;
  onSaved: (newUrl: string) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

/** 카드 이미지 회전·크롭 후 card-images 버킷에 새 WebP 업로드. */
export function ImageEditDialog({ open, imageUrl, setCode, cardCode, onClose, onSaved }: Props) {
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  // 이미지 로드
  useEffect(() => {
    if (!open || !imageUrl) return;
    let alive = true;
    setRotation(0); setCrop(null); setBmp(null);
    (async () => {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const b = await createImageBitmap(blob);
        if (alive) setBmp(b);
      } catch {
        toast.error("이미지를 불러올 수 없습니다");
      }
    })();
    return () => { alive = false; };
  }, [open, imageUrl]);

  // 회전 시 캔버스에 그리기
  useEffect(() => {
    if (!bmp || !canvasRef.current) return;
    const rotated = rotation % 180 !== 0;
    const w = rotated ? bmp.height : bmp.width;
    const h = rotated ? bmp.width : bmp.height;
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  }, [bmp, rotation]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    dragRef.current = { startX: x, startY: y };
    setCrop({ x, y, w: 0, h: 0 });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const { startX, startY } = dragRef.current;
    setCrop({
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      w: Math.abs(x - startX),
      h: Math.abs(y - startY),
    });
  };
  const onMouseUp = () => {
    dragRef.current = null;
    if (crop && (crop.w < 0.02 || crop.h < 0.02)) setCrop(null);
  };

  const save = async () => {
    if (!imageUrl) return;
    setBusy(true);
    try {
      const file = await rotateAndCropToWebp(imageUrl, rotation, crop, {
        maxWidth: 1024,
        quality: 0.85,
        filename: `${cardCode || "card"}-${Date.now()}.webp`,
      });
      const folder = setCode || cardCode?.split("-")[0] || "misc";
      const path = `${folder}/${cardCode || "card"}-${Date.now()}.webp`;
      const { error } = await supabase.storage.from("card-images").upload(path, file, {
        contentType: "image/webp", cacheControl: "3600", upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
      onSaved(pub.publicUrl);
      toast.success("이미지 저장됨");
      onClose();
    } catch (e) {
      toast.error("저장 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>이미지 회전 · 크롭</DialogTitle>
          <DialogDescription>
            마우스로 드래그해 자를 영역을 선택하세요. 비우면 전체 이미지가 저장됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270)} disabled={!bmp}>
            <RotateCcw className="h-4 w-4 mr-1" />좌 90°
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)} disabled={!bmp}>
            <RotateCw className="h-4 w-4 mr-1" />우 90°
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCrop(null)} disabled={!crop}>
            <X className="h-4 w-4 mr-1" />크롭 해제
          </Button>
          <span className="text-xs text-muted-foreground self-center ml-auto">
            회전 {rotation}°{crop && ` · 크롭 ${(crop.w * 100).toFixed(0)}×${(crop.h * 100).toFixed(0)}%`}
          </span>
        </div>

        <div className="flex justify-center bg-muted/30 rounded-md p-4 min-h-[300px]">
          {!bmp ? (
            <div className="self-center text-sm text-muted-foreground">이미지 로딩 중…</div>
          ) : (
            <div
              ref={wrapRef}
              className="relative inline-block select-none cursor-crosshair"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <canvas
                ref={canvasRef}
                className="max-h-[60vh] max-w-full block pointer-events-none"
              />
              {crop && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={save} disabled={busy || !bmp}>
            <Save className="h-4 w-4 mr-1" />{busy ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
