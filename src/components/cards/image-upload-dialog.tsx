import { useEffect, useRef, useState } from "react";
import { UploadCloud, Link2, Plus, X, Star, ArrowUp, Image as ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { compressToWebp } from "@/lib/image-utils";
import { normalizeImageUrl } from "./card-uploader-utils";
import {
  getDriveAuthUrlFn,
  getDriveConnectionFn,
  listDriveFolderFn,
  importDriveFilesFn,
} from "@/lib/google-drive.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialImages: string[];
  /** 스토리지 업로드 경로 prefix용 */
  setCode?: string;
  cardCode?: string;
  onCommit: (images: string[]) => void;
};

const safeSegment = (s: string, fallback: string) =>
  (s || "").trim().replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || fallback;

export function ImageUploadDialog({
  open, onOpenChange, initialImages, setCode, cardCode, onCommit,
}: Props) {
  const [staged, setStaged] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragHover, setDragHover] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drive
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; thumbnailLink?: string }>>([]);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [driveLoading, setDriveLoading] = useState(false);

  // 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setStaged(initialImages.filter(Boolean));
      setUrlInput("");
      setDriveFiles([]);
      setSelectedDriveFiles(new Set());
      // 드라이브 연결 확인
      getDriveConnectionFn()
        .then(res => {
          if (res) {
            setDriveConnected(res.connected);
            if (res.email) setDriveEmail(res.email);
          }
        })
        .catch(() => { /* ignore */ });
    }
  }, [open, initialImages]);

  // ===== 파일 업로드 =====
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const uploaded: string[] = [];
    let done = 0;
    try {
      for (const original of files) {
        if (!original.type.startsWith("image/")) {
          toast.error(`${original.name}: 이미지가 아닙니다`);
          done++; setProgress({ done, total: files.length });
          continue;
        }
        try {
          const f = await compressToWebp(original, { maxWidth: 1024, quality: 0.85 });
          const setSeg = safeSegment(setCode ?? "", "misc");
          const codeSeg = safeSegment(cardCode ?? "", "card");
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${setSeg}/${codeSeg}-${Date.now()}-${rand}.webp`;
          const { error } = await supabase.storage
            .from("card-images")
            .upload(path, f, { cacheControl: "3600", upsert: false, contentType: "image/webp" });
          if (error) {
            toast.error(`${original.name}: ${error.message}`);
          } else {
            const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
            if (pub?.publicUrl) uploaded.push(pub.publicUrl);
          }
        } catch (err) {
          toast.error(`${original.name}: ${(err as Error).message}`);
        }
        done++;
        setProgress({ done, total: files.length });
      }
      if (uploaded.length) {
        setStaged(prev => [...prev, ...uploaded]);
        toast.success(`${uploaded.length}장 추가됨`);
      }
    } finally {
      setUploading(false);
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    uploadFiles(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragHover(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    uploadFiles(files);
  };

  // ===== URL 추가 =====
  const addUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    const normalized = normalizeImageUrl(v);
    if (!normalized) return;
    setStaged(prev => [...prev, normalized]);
    setUrlInput("");
  };

  // ===== Drive =====
  const connectDrive = async () => {
    try {
      const { url } = await getDriveAuthUrlFn();
      window.location.href = url;
    } catch (e) {
      toast.error("Drive 연결 실패: " + (e as Error).message);
    }
  };

  const previewDrive = async () => {
    if (!driveFolderUrl) return;
    setDriveLoading(true);
    try {
      const { files } = await listDriveFolderFn({ data: { folderUrl: driveFolderUrl } });
      setDriveFiles(files ?? []);
      setSelectedDriveFiles(new Set());
      if (!files?.length) toast.message("이미지가 없습니다");
    } catch (e) {
      toast.error("폴더 조회 실패: " + (e as Error).message);
    } finally {
      setDriveLoading(false);
    }
  };

  const importDrive = async () => {
    const targets = Array.from(selectedDriveFiles);
    if (!targets.length) { toast.error("선택된 파일이 없습니다"); return; }
    setUploading(true);
    setProgress({ done: 0, total: targets.length });
    try {
      const CHUNK = 5;
      const urls: string[] = [];
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK);
        const res = await importDriveFilesFn({ data: { fileIds: slice } });
        for (const item of res.results) if (item.url) urls.push(item.url);
        setProgress({ done: Math.min(i + CHUNK, targets.length), total: targets.length });
      }
      if (urls.length) {
        setStaged(prev => [...prev, ...urls]);
        toast.success(`${urls.length}장 추가됨`);
        setSelectedDriveFiles(new Set());
      }
    } catch (e) {
      toast.error("가져오기 실패: " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // ===== 순서/삭제 =====
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= staged.length) return;
    const next = [...staged];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setStaged(next);
  };
  const removeAt = (idx: number) => setStaged(prev => prev.filter((_, i) => i !== idx));
  const promote = (idx: number) => move(idx, 0);

  const commit = () => {
    onCommit(staged);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>이미지 등록</DialogTitle>
          <DialogDescription>
            파일 업로드 · URL · Google Drive에서 이미지를 추가하고, 아래 목록에서 순서를 변경하거나 삭제한 뒤 <b>업로드</b>를 눌러 카드에 적용하세요.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file"><UploadCloud className="mr-1 h-4 w-4" />파일</TabsTrigger>
            <TabsTrigger value="url"><Link2 className="mr-1 h-4 w-4" />URL</TabsTrigger>
            <TabsTrigger value="drive"><ImageIcon className="mr-1 h-4 w-4" />Drive</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragHover(true); }}
              onDragLeave={() => setDragHover(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragHover ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/30"
              }`}
            >
              <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="font-medium">파일을 끌어다 놓거나 <span className="text-primary underline">찾아보기</span></p>
              <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, GIF, WebP 지원 · 다중 선택 가능</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickFiles}
                disabled={uploading}
              />
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-3 space-y-2">
            <Label>이미지 URL (Google Drive 공유 링크도 가능)</Label>
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                placeholder="https://… 또는 https://drive.google.com/…"
                className="font-mono text-xs"
              />
              <Button type="button" onClick={addUrl} disabled={!urlInput.trim()}>
                <Plus className="mr-1 h-4 w-4" />추가
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Drive 링크는 자동 변환됩니다. "링크가 있는 모든 사용자" 공개 권한이 필요합니다.
            </p>
          </TabsContent>

          <TabsContent value="drive" className="mt-3 space-y-3">
            {!driveConnected ? (
              <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-lg bg-muted/20">
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">Google Drive 계정을 연결해야 합니다.</p>
                <Button onClick={connectDrive} size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Google Drive 연결
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-2 border rounded-md bg-muted/10 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-600/20">연결됨</Badge>
                    <span className="font-medium truncate">{driveEmail}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Google Drive 폴더 URL"
                    value={driveFolderUrl}
                    onChange={(e) => setDriveFolderUrl(e.target.value)}
                    className="text-xs"
                  />
                  <Button onClick={previewDrive} disabled={driveLoading || !driveFolderUrl} size="sm">
                    {driveLoading ? "조회중…" : "미리보기"}
                  </Button>
                </div>
                {driveFiles.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{driveFiles.length}개 발견 · {selectedDriveFiles.size}개 선택</span>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="all-drive-dlg"
                          checked={selectedDriveFiles.size === driveFiles.length}
                          onCheckedChange={(c) => {
                            if (c) setSelectedDriveFiles(new Set(driveFiles.map(f => f.id)));
                            else setSelectedDriveFiles(new Set());
                          }}
                        />
                        <Label htmlFor="all-drive-dlg" className="text-xs">전체 선택</Label>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 border rounded-md bg-muted/5">
                      {driveFiles.map(f => (
                        <div
                          key={f.id}
                          onClick={() => setSelectedDriveFiles(prev => {
                            const next = new Set(prev);
                            if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                            return next;
                          })}
                          className={`relative cursor-pointer rounded border ${selectedDriveFiles.has(f.id) ? "border-primary ring-1 ring-primary" : "border-border"}`}
                        >
                          {f.thumbnailLink
                            ? <img src={f.thumbnailLink} alt="" className="w-full aspect-[3/4] object-cover rounded-sm" />
                            : <div className="w-full aspect-[3/4] bg-muted rounded-sm" />}
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white p-0.5 truncate">{f.name}</div>
                        </div>
                      ))}
                    </div>
                    <Button onClick={importDrive} size="sm" disabled={uploading || selectedDriveFiles.size === 0}>
                      <Plus className="mr-1 h-4 w-4" />선택한 {selectedDriveFiles.size}개 가져오기
                    </Button>
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* 진행 표시 */}
        {uploading && progress.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>업로드 중…</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <Progress value={(progress.done / progress.total) * 100} />
          </div>
        )}

        {/* 스테이지된 이미지 목록 */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">등록 대기 ({staged.length}장)</Label>
            <span className="text-[11px] text-muted-foreground">드래그로 순서 변경 · 첫 번째가 메인</span>
          </div>
          {staged.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6 border rounded-md bg-muted/10">
              아직 추가된 이미지가 없습니다.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {staged.map((u, i) => (
                <div
                  key={`${u}-${i}`}
                  draggable
                  onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIdx !== i) setOverIdx(i); }}
                  onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
                  onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  className={`relative cursor-move transition-opacity ${dragIdx === i ? "opacity-40" : ""} ${overIdx === i && dragIdx !== i ? "ring-2 ring-primary rounded" : ""}`}
                  title="드래그하여 순서 변경"
                >
                  <img
                    src={u}
                    alt=""
                    draggable={false}
                    className={`h-24 w-16 rounded object-cover border-2 ${i === 0 ? "border-primary" : "border-border"} select-none pointer-events-none`}
                  />
                  {i === 0 ? (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0 h-4 gap-0.5">
                      <Star className="h-2.5 w-2.5" />메인
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => promote(i)}
                      className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-secondary text-secondary-foreground p-0.5 border shadow-sm"
                      title="메인으로 설정"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute -right-1 -bottom-1 rounded-full bg-destructive text-destructive-foreground p-0.5"
                    aria-label="삭제"
                    title="삭제"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <span className="absolute bottom-0 left-0 rounded-tr bg-background/80 px-1 text-[9px] font-mono text-muted-foreground">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>취소</Button>
          <Button onClick={commit} disabled={uploading}>
            <UploadCloud className="mr-1 h-4 w-4" />업로드 ({staged.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
