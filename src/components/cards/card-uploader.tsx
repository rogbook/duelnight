import { useMemo, useRef, useState } from "react";
import { Upload, Download, Trash2, Plus, Image as ImageIcon, FileSpreadsheet, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

export type CardRow = {
  code: string;
  set_code: string;
  game: Game;
  name: string;
  type: CardType;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string | null;
  rarity: string | null;
  effect: string | null;
  image_url: string | null;
};

const VALID_GAMES: Game[] = ["optcg", "ptcg", "dtcg"];
const VALID_TYPES: CardType[] = ["leader", "character", "event", "stage", "don"];

const GAME_LABEL: Record<Game, string> = { optcg: "원피스", ptcg: "포켓몬", dtcg: "디지몬" };
const TYPE_LABEL: Record<CardType, string> = {
  leader: "리더",
  character: "캐릭터",
  event: "이벤트",
  stage: "스테이지",
  don: "DON!!",
};

// 한국어 ↔ 영문 헤더 매핑 (엑셀/CSV 자동 인식)
const HEADER_ALIASES: Record<string, keyof CardRow> = {
  code: "code", 코드: "code", 카드코드: "code", 카드번호: "code",
  set_code: "set_code", 세트: "set_code", 세트코드: "set_code", 세트번호: "set_code",
  game: "game", 게임: "game",
  name: "name", 이름: "name", 카드명: "name", 카드이름: "name",
  type: "type", 종류: "type", 타입: "type",
  colors: "colors", 색상: "colors", 컬러: "colors", 색: "colors",
  cost: "cost", 비용: "cost", 코스트: "cost",
  power: "power", 파워: "power", 공격력: "power",
  counter: "counter", 카운터: "counter",
  attribute: "attribute", 속성: "attribute",
  rarity: "rarity", 레어도: "rarity", 등급: "rarity", 희귀도: "rarity",
  effect: "effect", 효과: "effect", 텍스트: "effect", 능력: "effect",
  image_url: "image_url", 이미지: "image_url", 이미지url: "image_url", 이미지주소: "image_url",
};

const GAME_ALIASES: Record<string, Game> = {
  optcg: "optcg", "원피스": "optcg", "one piece": "optcg", op: "optcg",
  ptcg: "ptcg", "포켓몬": "ptcg", pokemon: "ptcg",
  dtcg: "dtcg", "디지몬": "dtcg", digimon: "dtcg",
};
const TYPE_ALIASES: Record<string, CardType> = {
  leader: "leader", "리더": "leader",
  character: "character", "캐릭터": "character", char: "character",
  event: "event", "이벤트": "event",
  stage: "stage", "스테이지": "stage",
  don: "don", "돈": "don",
};

function emptyRow(): CardRow {
  return {
    code: "", set_code: "", game: "optcg", name: "", type: "character",
    colors: [], cost: null, power: null, counter: null,
    attribute: null, rarity: null, effect: null, image_url: null,
  };
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

function mapHeader(h: string): keyof CardRow | null {
  const k = normalizeKey(h);
  for (const [alias, target] of Object.entries(HEADER_ALIASES)) {
    if (normalizeKey(alias) === k) return target;
  }
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 구글 드라이브 공유 링크를 직접 표시 가능한 이미지 URL로 변환합니다.
 *  지원: /file/d/ID/view, open?id=ID, uc?id=ID, thumbnail?id=ID
 *  주의: 드라이브 파일은 "링크가 있는 모든 사용자" 공개 상태여야 합니다. */
export function normalizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = String(raw).trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url; // 상대경로 등은 그대로
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("drive.google.com") || host.endsWith("docs.google.com")) {
      let id = u.searchParams.get("id");
      if (!id) {
        const m = u.pathname.match(/\/(?:file|d)\/d\/([^/]+)/) || u.pathname.match(/\/d\/([^/]+)/);
        if (m) id = m[1];
      }
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
    }
    return url;
  } catch {
    return url;
  }
}


function toRow(obj: Record<string, unknown>): { row?: CardRow; error?: string } {
  const out = emptyRow();
  for (const [k, v] of Object.entries(obj)) {
    const target = mapHeader(k);
    if (!target) continue;
    const sv = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
    if (target === "colors") {
      out.colors = sv.split(/[|,;/]/).map(s => s.trim()).filter(Boolean);
    } else if (target === "cost" || target === "power" || target === "counter") {
      out[target] = num(sv);
    } else if (target === "game") {
      const g = GAME_ALIASES[sv.trim().toLowerCase()];
      if (!g) return { error: `잘못된 게임: ${sv}` };
      out.game = g;
    } else if (target === "type") {
      const t = TYPE_ALIASES[sv.trim().toLowerCase()];
      if (!t) return { error: `잘못된 종류: ${sv}` };
      out.type = t;
    } else if (target === "code" || target === "set_code" || target === "name") {
      out[target] = sv.trim();
    } else {
      (out as Record<string, unknown>)[target] = sv.trim() || null;
    }
  }
  if (out.image_url) out.image_url = normalizeImageUrl(out.image_url);
  if (!out.code) return { error: "코드 누락" };
  if (!out.set_code) return { error: "세트 누락" };
  if (!out.name) return { error: "이름 누락" };
  return { row: out };
}

async function parseFile(f: File): Promise<{ rows: CardRow[]; errors: { line: number; reason: string }[] }> {
  const errors: { line: number; reason: string }[] = [];
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: CardRow[] = [];
  json.forEach((obj, i) => {
    const r = toRow(obj);
    if (r.error) errors.push({ line: i + 2, reason: r.error });
    else if (r.row) out.push(r.row);
  });
  return { rows: out, errors };
}

const SAMPLE_ROWS = [
  {
    코드: "OP01-001", 세트: "OP01", 게임: "원피스", 이름: "몽키 D 루피",
    종류: "리더", 색상: "red", 비용: "", 파워: 5000, 카운터: "",
    속성: "타격", 레어도: "L", 효과: "[활성 메인] 효과 텍스트 예시", 이미지: "https://example.com/op01-001.png",
  },
  {
    코드: "OP01-002", 세트: "OP01", 게임: "원피스", 이름: "로로노아 조로",
    종류: "캐릭터", 색상: "red|green", 비용: 3, 파워: 5000, 카운터: 1000,
    속성: "슬래시", 레어도: "SR", 효과: "효과 텍스트 예시", 이미지: "",
  },
  {
    코드: "OP01-003", 세트: "OP01", 게임: "원피스", 이름: "나미",
    종류: "캐릭터", 색상: "blue", 비용: 2, 파워: 3000, 카운터: 2000,
    속성: "특수", 레어도: "R", 효과: "드로우 효과 예시", 이미지: "",
  },
];

const FIELD_GUIDE = [
  { 필드명: "코드", 필수: "예", 설명: "카드 고유 코드 (중복 불가, 키)", 예시: "OP01-001" },
  { 필드명: "세트", 필수: "예", 설명: "확장팩/세트 코드", 예시: "OP01, EB01" },
  { 필드명: "게임", 필수: "예", 설명: "원피스/포켓몬/디지몬 중 하나", 예시: "원피스 (또는 optcg)" },
  { 필드명: "이름", 필수: "예", 설명: "카드 이름", 예시: "몽키 D 루피" },
  { 필드명: "종류", 필수: "예", 설명: "리더/캐릭터/이벤트/스테이지/DON!!", 예시: "리더, 캐릭터" },
  { 필드명: "색상", 필수: "아니오", 설명: "여러 색은 | 또는 , 로 구분", 예시: "red 또는 red|green" },
  { 필드명: "비용", 필수: "아니오", 설명: "코스트 (숫자)", 예시: "3" },
  { 필드명: "파워", 필수: "아니오", 설명: "파워 (숫자)", 예시: "5000" },
  { 필드명: "카운터", 필수: "아니오", 설명: "카운터 값 (숫자)", 예시: "1000, 2000" },
  { 필드명: "속성", 필수: "아니오", 설명: "타격/슬래시/특수 등", 예시: "타격" },
  { 필드명: "레어도", 필수: "아니오", 설명: "L/C/UC/R/SR/SEC 등", 예시: "SR" },
  { 필드명: "효과", 필수: "아니오", 설명: "효과 텍스트", 예시: "효과 텍스트 예시" },
  { 필드명: "이미지", 필수: "아니오", 설명: "이미지 URL (없으면 비워두기)", 예시: "https://..." },
];

function autoFitCols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((k) => {
    const max = Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length));
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });
}

function downloadSampleXlsx() {
  const wsData = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
  wsData["!cols"] = autoFitCols(SAMPLE_ROWS);
  const wsGuide = XLSX.utils.json_to_sheet(FIELD_GUIDE);
  wsGuide["!cols"] = autoFitCols(FIELD_GUIDE);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "카드샘플");
  XLSX.utils.book_append_sheet(wb, wsGuide, "필드설명");
  XLSX.writeFile(wb, "카드업로드_샘플.xlsx");
}

function downloadFieldGuideCsv() {
  const ws = XLSX.utils.json_to_sheet(FIELD_GUIDE);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "카드필드_설명.csv"; a.click();
  URL.revokeObjectURL(url);
}

function downloadEmptyTemplateXlsx() {
  const headers = Object.keys(SAMPLE_ROWS[0]);
  const empty = [Object.fromEntries(headers.map((h) => [h, ""]))];
  const ws = XLSX.utils.json_to_sheet(empty);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 10) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "카드");
  XLSX.writeFile(wb, "카드업로드_빈양식.xlsx");
}

function extractCodeFromFilename(name: string): string {
  // OP01-001.png → OP01-001 ; "EB01_005.jpg" → EB01-005
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_\s]+/g, "-").toUpperCase();
}

type Props = {
  isAdmin: boolean;
  onComplete?: (result: { inserted: number; skipped: number }) => void;
};

export function CardUploader({ isAdmin, onComplete }: Props) {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [errors, setErrors] = useState<{ line: number; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const valid = useMemo(() => rows.filter(r => r.code && r.set_code && r.name), [rows]);

  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("10MB 이하만 가능합니다"); return; }
    try {
      const { rows: r, errors: er } = await parseFile(f);
      setRows(prev => [...prev, ...r]);
      setErrors(er);
      toast.success(`${r.length}건 불러옴 (오류 ${er.length}건)`);
    } catch (err) {
      toast.error("파일 읽기 실패: " + (err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    const newRows: CardRow[] = [];
    let done = 0;
    try {
      for (const f of files) {
        if (!f.type.startsWith("image/")) { done++; continue; }
        const code = extractCodeFromFilename(f.name);
        const setCode = code.split("-")[0] || "";
        const path = `${setCode || "misc"}/${code}-${Date.now()}.${f.name.split(".").pop()}`;
        const { error: upErr } = await supabase.storage.from("card-images").upload(path, f, {
          cacheControl: "3600", upsert: false,
        });
        if (upErr) { toast.error(`${f.name}: ${upErr.message}`); done++; continue; }
        const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
        newRows.push({
          ...emptyRow(), code, set_code: setCode, name: code, image_url: pub.publicUrl,
        });
        done++;
        setProgress({ done, total: files.length });
      }
      setRows(prev => [...prev, ...newRows]);
      toast.success(`이미지 ${newRows.length}장 업로드. 표에서 정보를 채워주세요.`);
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<CardRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));
  const addBlank = () => setRows(prev => [...prev, emptyRow()]);

  const submit = async () => {
    if (valid.length === 0) { toast.error("등록할 유효한 카드가 없습니다"); return; }
    setBusy(true);
    setProgress({ done: 0, total: valid.length });
    try {
      const CHUNK = 200;
      let inserted = 0, skipped = 0;
      for (let i = 0; i < valid.length; i += CHUNK) {
        const slice = valid.slice(i, i + CHUNK);
        if (isAdmin) {
          const { error } = await supabase.from("cards").upsert(slice, { onConflict: "code" });
          if (error) throw error;
          inserted += slice.length;
        } else {
          const { data, error } = await supabase
            .from("cards")
            .upsert(slice, { onConflict: "code", ignoreDuplicates: true })
            .select("code");
          if (error) throw error;
          const added = data?.length ?? 0;
          inserted += added;
          skipped += slice.length - added;
        }
        setProgress({ done: Math.min(i + CHUNK, valid.length), total: valid.length });
      }
      toast.success(skipped ? `${inserted}장 등록 · ${skipped}장 중복 건너뜀` : `${inserted}장 등록 완료`);
      onComplete?.({ inserted, skipped });
      setRows([]);
      setErrors([]);
    } catch (e) {
      toast.error((e as Error).message ?? "등록 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="single">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single"><Plus className="mr-1 h-4 w-4" />한 장씩 입력</TabsTrigger>
          <TabsTrigger value="excel"><FileSpreadsheet className="mr-1 h-4 w-4" />엑셀/CSV</TabsTrigger>
          <TabsTrigger value="images"><ImageIcon className="mr-1 h-4 w-4" />이미지 대량</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">한 장씩 폼으로 등록</CardTitle>
              <CardDescription>입력하면 아래 표에 행이 추가됩니다. 여러 장 모은 뒤 한 번에 등록하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <SingleForm onAdd={(r) => setRows(prev => [...prev, r])} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excel">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">엑셀(.xlsx) 또는 CSV 파일 업로드</CardTitle>
              <CardDescription>
                한국어 헤더를 자동 인식합니다: 코드, 세트, 게임, 이름, 종류, 색상, 비용, 파워, 카운터, 속성, 레어도, 효과, 이미지
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadSampleXlsx}>
                  <Download className="mr-1 h-4 w-4" /> 샘플 엑셀(.xlsx) 다운로드
                </Button>
                <Button variant="outline" size="sm" onClick={downloadEmptyTemplateXlsx}>
                  <Download className="mr-1 h-4 w-4" /> 빈 양식(.xlsx) 다운로드
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadFieldGuideCsv}>
                  <Download className="mr-1 h-4 w-4" /> 필드 설명(.csv)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                샘플 파일에는 <b>카드샘플</b> 시트(예시 3건)와 <b>필드설명</b> 시트(필드명·필수 여부·설명·예시)가 함께 들어 있어요.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="xlsx-file">파일 선택 (xlsx, xls, csv 최대 10MB)</Label>
                <Input
                  id="xlsx-file" type="file" ref={fileInputRef}
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={onUploadFile} disabled={busy}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">이미지 대량 업로드</CardTitle>
              <CardDescription>
                여러 이미지를 한번에 업로드하면 파일명에서 카드 코드를 자동 추출합니다 (예: <code>OP01-001.png</code> → 코드 <code>OP01-001</code>).
                나머지 정보는 아래 표에서 채워주세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="img-files">이미지 파일 선택 (여러 개 가능)</Label>
                <Input id="img-files" type="file" accept="image/*" multiple onChange={onUploadImages} disabled={busy} />
              </div>
              {busy && progress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>업로드 중…</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <Progress value={(progress.done / progress.total) * 100} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-sm text-destructive">파일 오류 {errors.length}건</CardTitle></CardHeader>
          <CardContent>
            <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-muted-foreground">
              {errors.slice(0, 50).map((e, i) => <li key={i}>· {e.line}행: {e.reason}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">미리보기 · 편집 ({rows.length}건)</CardTitle>
              <CardDescription>표에서 직접 수정할 수 있습니다. 유효한 행 {valid.length}건이 등록됩니다.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" />빈 행</Button>
              <Button variant="ghost" size="sm" onClick={() => { setRows([]); setErrors([]); }}>
                <Trash2 className="mr-1 h-4 w-4" />전체 비우기
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-12">이미지</th>
                    <th className="px-2 py-2">코드*</th>
                    <th className="px-2 py-2">세트*</th>
                    <th className="px-2 py-2">게임</th>
                    <th className="px-2 py-2">이름*</th>
                    <th className="px-2 py-2">종류</th>
                    <th className="px-2 py-2">색상</th>
                    <th className="px-2 py-2 w-16">비용</th>
                    <th className="px-2 py-2 w-20">파워</th>
                    <th className="px-2 py-2 w-20">카운터</th>
                    <th className="px-2 py-2">레어도</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="px-2 py-1">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image_url} alt="" className="h-10 w-7 rounded object-cover" />
                        ) : <div className="h-10 w-7 rounded bg-muted" />}
                      </td>
                      <td className="px-1 py-1"><Input value={r.code} onChange={e => updateRow(i, { code: e.target.value })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.set_code} onChange={e => updateRow(i, { set_code: e.target.value })} className="h-7 text-xs w-20" /></td>
                      <td className="px-1 py-1">
                        <Select value={r.game} onValueChange={v => updateRow(i, { game: v as Game })}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{VALID_GAMES.map(g => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1"><Input value={r.name} onChange={e => updateRow(i, { name: e.target.value })} className="h-7 text-xs min-w-[140px]" /></td>
                      <td className="px-1 py-1">
                        <Select value={r.type} onValueChange={v => updateRow(i, { type: v as CardType })}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{VALID_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1"><Input value={r.colors.join("|")} onChange={e => updateRow(i, { colors: e.target.value.split(/[|,;]/).map(s => s.trim()).filter(Boolean) })} placeholder="red|green" className="h-7 text-xs w-24" /></td>
                      <td className="px-1 py-1"><Input value={r.cost ?? ""} onChange={e => updateRow(i, { cost: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.power ?? ""} onChange={e => updateRow(i, { power: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.counter ?? ""} onChange={e => updateRow(i, { counter: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.rarity ?? ""} onChange={e => updateRow(i, { rarity: e.target.value || null })} className="h-7 text-xs w-16" /></td>
                      <td className="px-1 py-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg">
          <div className="text-sm">
            <span className="font-medium text-emerald-600">{valid.length}</span>건 등록 가능
            {rows.length - valid.length > 0 && <span className="text-destructive"> · {rows.length - valid.length}건 필수 항목 누락</span>}
          </div>
          {busy && progress.total > 0 && (
            <div className="flex-1 mx-4 max-w-xs">
              <Progress value={(progress.done / progress.total) * 100} />
            </div>
          )}
          <Button onClick={submit} disabled={busy || valid.length === 0}>
            <Upload className="mr-1 h-4 w-4" />
            {busy ? `등록 중… ${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` : `${valid.length}건 등록`}
          </Button>
        </div>
      )}
    </div>
  );
}

function SingleForm({ onAdd }: { onAdd: (r: CardRow) => void }) {
  const [r, setR] = useState<CardRow>(emptyRow());
  const [imgUploading, setImgUploading] = useState(false);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgUploading(true);
    try {
      const path = `${r.set_code || "misc"}/${(r.code || "card") + "-" + Date.now()}.${f.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("card-images").upload(path, f);
      if (error) throw error;
      const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
      setR(prev => ({ ...prev, image_url: pub.publicUrl }));
      toast.success("이미지 업로드 완료");
    } catch (err) {
      toast.error("업로드 실패: " + (err as Error).message);
    } finally {
      setImgUploading(false);
    }
  };

  const submit = () => {
    if (!r.code || !r.set_code || !r.name) { toast.error("코드, 세트, 이름은 필수입니다"); return; }
    onAdd({ ...r, image_url: normalizeImageUrl(r.image_url) });
    setR(emptyRow());
    toast.success("표에 추가됨");
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>카드 코드 *</Label>
        <Input value={r.code} onChange={e => setR({ ...r, code: e.target.value })} placeholder="OP01-001" />
      </div>
      <div className="space-y-1.5">
        <Label>세트 *</Label>
        <Input value={r.set_code} onChange={e => setR({ ...r, set_code: e.target.value })} placeholder="OP01" />
      </div>
      <div className="space-y-1.5">
        <Label>게임</Label>
        <Select value={r.game} onValueChange={v => setR({ ...r, game: v as Game })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{VALID_GAMES.map(g => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>종류</Label>
        <Select value={r.type} onValueChange={v => setR({ ...r, type: v as CardType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{VALID_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>카드 이름 *</Label>
        <Input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} placeholder="몽키 D 루피" />
      </div>
      <div className="space-y-1.5">
        <Label>색상 (구분자: | , ;)</Label>
        <Input value={r.colors.join("|")} onChange={e => setR({ ...r, colors: e.target.value.split(/[|,;]/).map(s => s.trim()).filter(Boolean) })} placeholder="red|green" />
      </div>
      <div className="space-y-1.5">
        <Label>레어도</Label>
        <Input value={r.rarity ?? ""} onChange={e => setR({ ...r, rarity: e.target.value || null })} placeholder="SR" />
      </div>
      <div className="space-y-1.5">
        <Label>비용</Label>
        <Input type="number" value={r.cost ?? ""} onChange={e => setR({ ...r, cost: num(e.target.value) })} />
      </div>
      <div className="space-y-1.5">
        <Label>파워</Label>
        <Input type="number" value={r.power ?? ""} onChange={e => setR({ ...r, power: num(e.target.value) })} />
      </div>
      <div className="space-y-1.5">
        <Label>카운터</Label>
        <Input type="number" value={r.counter ?? ""} onChange={e => setR({ ...r, counter: num(e.target.value) })} />
      </div>
      <div className="space-y-1.5">
        <Label>속성</Label>
        <Input value={r.attribute ?? ""} onChange={e => setR({ ...r, attribute: e.target.value || null })} placeholder="타격/슬래시 등" />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>효과</Label>
        <Textarea value={r.effect ?? ""} onChange={e => setR({ ...r, effect: e.target.value || null })} rows={3} />
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>카드 이미지</Label>
        <div className="flex items-center gap-2">
          <Input type="file" accept="image/*" onChange={onPickImage} disabled={imgUploading} />
          {r.image_url && <img src={r.image_url} alt="" className="h-12 w-9 rounded object-cover" />}
        </div>
        <Input
          value={r.image_url ?? ""}
          onChange={e => setR({ ...r, image_url: e.target.value || null })}
          onBlur={e => setR({ ...r, image_url: normalizeImageUrl(e.target.value) })}
          placeholder="이미지 URL 또는 구글 드라이브 공유 링크 (예: https://drive.google.com/file/d/...)"
          className="text-xs font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          구글 드라이브 링크는 자동으로 표시 가능한 주소로 변환됩니다. 파일은 <b>"링크가 있는 모든 사용자"</b> 공개로 설정해 주세요.
        </p>
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={submit}><Plus className="mr-1 h-4 w-4" />표에 추가</Button>
      </div>
    </div>
  );
}
