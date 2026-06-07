import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Download, Trash2, Plus, Image as ImageIcon, FileSpreadsheet, Pencil, X, Wand2, ShieldCheck, AlertTriangle, Save, Sparkles, ScanLine, Crop, ArrowUp, Star, Keyboard, Link2 } from "lucide-react";
import { ImageEditDialog } from "./image-edit-dialog";
import { ImageUploadDialog } from "./image-upload-dialog";
import { toast } from "sonner";
import { useUniqueSets } from "@/hooks/use-unique-sets";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  autoFixRow, validateRow, findInternalDuplicates, downloadRowsAsCsv,
  saveDraft, loadDraft, clearDraft,
} from "./card-utils";
import { compressToWebp } from "@/lib/image-utils";
import { 
  getDriveAuthUrlFn, 
  getDriveConnectionFn, 
  listDriveFolderFn, 
  disconnectDriveFn,
  importDriveFilesFn
} from "@/lib/google-drive.functions";

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
  traits: string[];
  extra_images?: string[];
  /** 게임별 확장 필드(디지몬: category/form/evo_cost_1/evo_cost_2/text_top/text_bottom 등) */
  extra?: Record<string, unknown> | null;
};

// 디지몬 전용 등록 규칙
const DIGIMON_CATEGORIES = ["디지타마", "디지몬", "옵션", "테이머", "듀얼"] as const;
const DIGIMON_FORMS = ["유년기", "성장기", "성숙기", "완전체", "궁극체"] as const;
// 디지몬 종류 → cards.type(enum) 매핑 (enum 제약 충족용, 실제 종류는 extra.category에 보존)
const DIGIMON_CATEGORY_TYPE: Record<string, CardType> = {
  디지타마: "stage",
  디지몬: "character",
  옵션: "event",
  테이머: "character",
  듀얼: "character",
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
  cost: "cost", 비용: "cost", 코스트: "cost", 라이프: "cost", life: "cost",
  power: "power", 파워: "power", 공격력: "power",
  counter: "counter", 카운터: "counter",
  attribute: "attribute", 속성: "attribute",
  rarity: "rarity", 레어도: "rarity", 등급: "rarity", 희귀도: "rarity",
  effect: "effect", 효과: "effect", 텍스트: "effect", 능력: "effect",
  image_url: "image_url", 이미지: "image_url", 이미지url: "image_url", 이미지주소: "image_url",
  traits: "traits", 특징: "traits", 특성: "traits", 트레잇: "traits", 종족: "traits", 키워드: "traits",
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
    attribute: null, rarity: null, effect: null, image_url: null, traits: [],
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
    } else if (target === "traits") {
      out.traits = sv.split(/[|,;/]/).map(s => s.trim()).filter(Boolean);
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
  const { sets } = useUniqueSets();
  const [rows, setRows] = useState<CardRow[]>([]);
  const [errors, setErrors] = useState<{ line: number; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [dupChecked, setDupChecked] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPatch, setBulkPatch] = useState<Partial<CardRow>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  // URL 가져오기 (공식 카드 페이지 → 폼 자동 채우기)
  const [importUrl, setImportUrl] = useState("");
  const [importGame, setImportGame] = useState<Game>("dtcg");
  const [importPages, setImportPages] = useState(1);
  const [importing, setImporting] = useState(false);

  // Google Drive 연동 상태
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [loadingDrive, setLoadingDrive] = useState(false);

  const valid = useMemo(() => rows.filter(r => r.code && r.set_code && r.name), [rows]);
  const issuesByRow = useMemo(() => rows.map((r) => validateRow(r as CardRow)), [rows]);
  const internalDups = useMemo(() => findInternalDuplicates(rows as CardRow[]), [rows]);
  const dbDupCount = useMemo(
    () => (dupChecked ? rows.filter(r => existingCodes.has((r.code || "").toUpperCase())).length : 0),
    [rows, existingCodes, dupChecked],
  );
  const errorRowsList = useMemo(
    () => rows.filter((_, i) => issuesByRow[i].some(x => x.level === "error")),
    [rows, issuesByRow],
  );

  // 임시저장 및 드라이브 상태 확인
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.rows.length) {
      const ago = Math.round((Date.now() - draft.savedAt) / 60000);
      toast("이전 작업 복구됨", {
        description: `${draft.rows.length}건 (${ago}분 전 저장). "전체 비우기"로 삭제할 수 있어요.`,
      });
      setRows(draft.rows as CardRow[]);
    }

    // 드라이브 연결 확인
    getDriveConnectionFn()
      .then(res => {
        if (res) {
          setDriveConnected(res.connected);
          if (res.email) setDriveEmail(res.email);
        }
      })
      .catch(err => {
        console.error("Failed to check Google Drive connection:", err);
        // 에러가 발생해도 페이지 전체가 깨지지 않도록 무시하거나 초기 상태 유지
      });

    // 드라이브 연결 성공 파라미터 확인
    const url = new URL(window.location.href);
    if (url.searchParams.get("drive") === "connected") {
      toast.success("Google Drive가 연결되었습니다.");
      url.searchParams.delete("drive");
      window.history.replaceState({}, "", url.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 저장 (debounce)
  useEffect(() => {
    const t = setTimeout(() => saveDraft(rows as CardRow[]), 600);
    return () => clearTimeout(t);
  }, [rows]);

  // Ctrl/Cmd+Enter → 등록
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!busy && valid.length > 0) submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, valid.length]);

  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("10MB 이하만 가능합니다"); return; }
    try {
      const { rows: r, errors: er } = await parseFile(f);
      setRows(prev => [...prev, ...r]);
      setErrors(er);
      setDupChecked(false);
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
      for (const original of files) {
        if (!original.type.startsWith("image/")) { done++; continue; }
        // WebP 변환 + 800px 리사이즈로 업로드 비용 절감
        const f = await compressToWebp(original, { maxWidth: 800, quality: 0.82 });
        const code = extractCodeFromFilename(original.name);
        const setCode = code.split("-")[0] || "";
        const path = `${setCode || "misc"}/${code}-${Date.now()}.webp`;
        const { error: upErr } = await supabase.storage.from("card-images").upload(path, f, {
          cacheControl: "3600", upsert: false, contentType: "image/webp",
        });
        if (upErr) { toast.error(`${original.name}: ${upErr.message}`); done++; continue; }
        const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
        newRows.push({
          ...emptyRow(), code, set_code: setCode, name: "", image_url: pub.publicUrl,
        });
        done++;
        setProgress({ done, total: files.length });
      }
      setRows(prev => [...prev, ...newRows]);
      setDupChecked(false);
      toast.success(`이미지 ${newRows.length}장 업로드 (WebP 변환 완료). "이름 비어있는 행 OCR"로 자동 채울 수 있어요.`);
    } finally {
      setBusy(false);
    }
  };

  const ocrCache = useRef(new Map<string, any>());

  /** 단일 행 OCR: image_url을 Gemini Vision으로 분석해 빈 필드만 채움 */
  const ocrRow = async (idx: number): Promise<boolean> => {
    const r = rows[idx];
    if (!r?.image_url) return false;

    try {
      let d: any;
      if (ocrCache.current.has(r.image_url)) {
        d = ocrCache.current.get(r.image_url);
      } else {
        const res = await fetch("/api/card-ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: r.image_url, game_hint: r.game }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `OCR 실패 (${res.status})`);
        d = json.data ?? {};
        ocrCache.current.set(r.image_url, d);
      }

      const patch: Partial<CardRow> = {};
      if (!r.name && d.name) patch.name = String(d.name);
      if (!r.code && d.code) patch.code = String(d.code).toUpperCase();
      if (!r.set_code && d.set_code) patch.set_code = String(d.set_code).toUpperCase();
      if (d.type && VALID_TYPES.includes(d.type as CardType)) patch.type = d.type as CardType;
      if (Array.isArray(d.colors) && d.colors.length && r.colors.length === 0) patch.colors = (d.colors as unknown[]).map(String);
      if (d.cost != null && r.cost == null) patch.cost = Number(d.cost);
      if (d.power != null && r.power == null) patch.power = Number(d.power);
      if (d.counter != null && r.counter == null) patch.counter = Number(d.counter);
      if (d.attribute && !r.attribute) patch.attribute = String(d.attribute);
      if (d.rarity && !r.rarity) patch.rarity = String(d.rarity).toUpperCase();
      if (d.effect && !r.effect) patch.effect = String(d.effect);
      updateRow(idx, patch);
      return true;
    } catch (e) {
      toast.error(`${idx + 1}행 OCR 실패: ${(e as Error).message}`);
      return false;
    }
  };

  /** 선택된 행을 순차적으로 OCR */
  const ocrSelected = async () => {
    const targets = Array.from(selected).sort((a, b) => a - b);
    if (targets.length === 0) { toast.error("선택된 행이 없습니다"); return; }
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (await ocrRow(targets[i])) ok++;
        setProgress({ done: i + 1, total: targets.length });
      }
      toast.success(`OCR 완료: ${ok}/${targets.length}건 (이미 입력된 필드는 보존)`);
    } finally {
      setBusy(false);
    }
  };

  /** 이름이 비어있고 image_url만 있는 행을 모두 OCR */
  const ocrUnmatched = async () => {
    const targets = rows.map((r, i) => (!r.name && r.image_url ? i : -1)).filter(i => i >= 0);
    if (targets.length === 0) { toast.info("이름 비어있는 행이 없습니다"); return; }
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (await ocrRow(targets[i])) ok++;
        setProgress({ done: i + 1, total: targets.length });
      }
      toast.success(`자동 매칭: ${ok}/${targets.length}건 채움`);
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<CardRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSelected(prev => {
      const next = new Set<number>();
      prev.forEach(s => { if (s < idx) next.add(s); else if (s > idx) next.add(s - 1); });
      return next;
    });
  };
  const addBlank = () => setRows(prev => [...prev, emptyRow()]);
  const clearAll = () => { setRows([]); setErrors([]); setSelected(new Set()); setDupChecked(false); clearDraft(); };

  const applyAutoFix = () => {
    setRows(prev => prev.map((r) => autoFixRow(r as CardRow)));
    toast.success("자동 보정 완료 (코드 대문자, 색상 한글→영문, 레어도 정리)");
  };

  const checkDuplicatesAgainstDb = async () => {
    const codes = Array.from(new Set(rows.map(r => (r.code || "").trim().toUpperCase()).filter(Boolean)));
    if (codes.length === 0) { toast.error("코드가 입력된 행이 없습니다"); return; }
    setBusy(true);
    try {
      const found = new Set<string>();
      for (let i = 0; i < codes.length; i += 500) {
        const slice = codes.slice(i, i + 500);
        const { data, error } = await supabase.from("cards").select("code").in("code", slice);
        if (error) throw error;
        for (const r of data ?? []) found.add(String(r.code).toUpperCase());
      }
      setExistingCodes(found);
      setDupChecked(true);
      toast.success(found.size
        ? (isAdmin
            ? `이미 등록된 코드 ${found.size}건 (등록 시 덮어쓰기)`
            : `이미 등록된 코드 ${found.size}건 — 이미지가 있으면 "추가 일러스트"로, 없으면 건너뜁니다`)
        : "DB 중복 없음");
    } catch (e) {
      toast.error("중복 검사 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportErrorsCsv = () => {
    if (errorRowsList.length === 0) { toast.info("오류 행이 없습니다"); return; }
    downloadRowsAsCsv(`카드등록_오류_${Date.now()}.csv`, errorRowsList as CardRow[]);
  };

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  };
  const applyBulk = () => {
    if (selected.size === 0) { toast.error("선택된 행이 없습니다"); return; }
    const patch: Partial<CardRow> = {};
    if (bulkPatch.set_code) patch.set_code = (bulkPatch.set_code as string).trim().toUpperCase();
    if (bulkPatch.game) patch.game = bulkPatch.game;
    if (bulkPatch.type) patch.type = bulkPatch.type;
    if (bulkPatch.rarity) patch.rarity = (bulkPatch.rarity as string).trim().toUpperCase();
    if (bulkPatch.attribute) patch.attribute = (bulkPatch.attribute as string).trim();
    if (Object.keys(patch).length === 0) { toast.error("적용할 값을 입력하세요"); return; }
    setRows(prev => prev.map((r, i) => selected.has(i) ? { ...r, ...patch } : r));
    toast.success(`${selected.size}건에 적용됨`);
    setBulkOpen(false);
    setBulkPatch({});
  };

  const submit = async () => {
    if (valid.length === 0) { toast.error("등록할 유효한 카드가 없습니다"); return; }
    setBusy(true);
    setProgress({ done: 0, total: valid.length });
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!uid) { toast.error("로그인이 필요합니다"); return; }

      // DB 중복 + 이미지 있는 행은 "추가 일러스트"로 분기 등록
      const altIllustrations: { card_code: string; image_url: string }[] = [];
      const cardRows: CardRow[] = [];
      let skippedNoImage = 0;
      for (const r of valid) {
        const codeUpper = (r.code || "").toUpperCase();
        const isDup = dupChecked && existingCodes.has(codeUpper);
        const img = normalizeImageUrl(r.image_url);
        if (isDup && !isAdmin) {
          if (img) altIllustrations.push({ card_code: codeUpper, image_url: img });
          else skippedNoImage++;
        } else {
          cardRows.push(r);
        }
        // 같은 행에 추가 일러스트가 첨부되어 있으면 같이 등록
        for (const ex of r.extra_images ?? []) {
          const exUrl = normalizeImageUrl(ex);
          if (exUrl) altIllustrations.push({ card_code: codeUpper, image_url: exUrl });
        }
      }

      const CHUNK = 200;
      let inserted = 0, skipped = skippedNoImage;
      for (let i = 0; i < cardRows.length; i += CHUNK) {
        const slice = cardRows.slice(i, i + CHUNK).map(r => {
          const fixed = autoFixRow(r as CardRow);
          // extra_images는 cards 테이블에 존재하지 않으므로 제거
          const { extra_images: _ex, ...rest } = fixed as CardRow;
          return {
            ...rest,
            image_url: normalizeImageUrl(r.image_url),
            extra: r.extra ?? null, // 게임별 확장 필드(디지몬 등)
            ...(isAdmin
              ? { status: "approved" as const }
              : { status: "pending" as const, submitted_by: uid }),
          };
        });
        // extra 컬럼이 아직 없을 수 있으므로(마이그레이션 미적용 환경) 오류 시 extra를 제거하고 재시도
        const isExtraColErr = (msg?: string) => !!msg && /extra|schema cache|column .* does not exist/i.test(msg);
        const stripExtra = (arr: typeof slice) => arr.map(({ extra: _drop, ...x }) => x);
        if (isAdmin) {
          let { error } = await supabase.from("cards").upsert(slice as never, { onConflict: "code" });
          if (isExtraColErr(error?.message)) {
            ({ error } = await supabase.from("cards").upsert(stripExtra(slice) as never, { onConflict: "code" }));
          }
          if (error) throw error;
          inserted += slice.length;
        } else {
          let { data, error } = await supabase
            .from("cards")
            .upsert(slice as never, { onConflict: "code", ignoreDuplicates: true })
            .select("code");
          if (isExtraColErr(error?.message)) {
            ({ data, error } = await supabase
              .from("cards")
              .upsert(stripExtra(slice) as never, { onConflict: "code", ignoreDuplicates: true })
              .select("code"));
          }
          if (error) throw error;
          const added = data?.length ?? 0;
          inserted += added;
          skipped += slice.length - added;
        }
        setProgress({ done: Math.min(i + CHUNK, cardRows.length), total: valid.length });
      }

      // 추가 일러스트 등록 (검수 대기)
      let illustAdded = 0;
      if (altIllustrations.length > 0) {
        const payload = altIllustrations.map(x => ({
          card_code: x.card_code,
          image_url: x.image_url,
          variant_label: "얼터",
          ...(isAdmin
            ? { status: "approved" as const, reviewed_by: uid, reviewed_at: new Date().toISOString() }
            : { status: "pending" as const }),
          submitted_by: uid,
        }));
        const { data, error } = await supabase
          .from("card_illustrations")
          .upsert(payload, { onConflict: "card_code,image_url", ignoreDuplicates: true })
          .select("id");
        if (error) {
          console.error("illustration insert", error);
          toast.error("추가 일러스트 등록 실패: " + error.message);
        } else {
          illustAdded = data?.length ?? 0;
        }
      }

      const parts: string[] = [];
      parts.push(isAdmin ? `${inserted}장 등록` : `${inserted}장 검수 대기로 제출됨`);
      if (illustAdded) parts.push(isAdmin ? `${illustAdded}장 추가 일러스트 등록` : `${illustAdded}장 추가 일러스트 검수 대기`);
      if (skipped) parts.push(`${skipped}장 중복 건너뜀`);
      toast.success(parts.join(" · "));
      onComplete?.({ inserted, skipped });
      clearAll();
    } catch (e) {
      toast.error((e as Error).message ?? "등록 실패");
    } finally {
      setBusy(false);
    }
  };

  const connectDrive = async () => {
    try {
      const { url } = await getDriveAuthUrlFn();
      window.location.href = url;
    } catch (e) {
      toast.error("인증 URL 생성 실패: " + (e as Error).message);
    }
  };

  const disconnectDrive = async () => {
    try {
      await disconnectDriveFn();
      setDriveConnected(false);
      setDriveEmail(null);
      setDriveFiles([]);
      toast.success("연결이 해제되었습니다.");
    } catch (e) {
      toast.error("연결 해제 실패: " + (e as Error).message);
    }
  };

  const previewDriveFolder = async () => {
    if (!driveFolderUrl) { toast.error("폴더 URL을 입력하세요"); return; }
    setLoadingDrive(true);
    try {
      const res = await listDriveFolderFn({ data: { folderUrl: driveFolderUrl } });
      setDriveFiles(res.files);
      setSelectedDriveFiles(new Set(res.files.map((f: any) => f.id)));
      toast.success(`이미지 ${res.files.length}건을 찾았습니다.`);
    } catch (e) {
      toast.error("목록 조회 실패: " + (e as Error).message);
    } finally {
      setLoadingDrive(false);
    }
  };

  const importDriveFiles = async () => {
    const targets = Array.from(selectedDriveFiles);
    if (targets.length === 0) { toast.error("선택된 파일이 없습니다"); return; }
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    try {
      // 5개씩 묶어서 처리
      const CHUNK = 5;
      const newRows: CardRow[] = [];
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK);
        const res = await importDriveFilesFn({ data: { fileIds: slice } });
        for (const item of res.results) {
          const code = extractCodeFromFilename(item.name);
          newRows.push({
            ...emptyRow(),
            code,
            set_code: code.split("-")[0] || "",
            name: "",
            image_url: item.url,
          });
        }
        setProgress({ done: Math.min(i + CHUNK, targets.length), total: targets.length });
      }
      setRows(prev => [...prev, ...newRows]);
      toast.success(`${newRows.length}건 가져오기 완료. "이름 비어있는 행 OCR"로 정보를 채워보세요.`);
      setDriveFiles([]);
      setDriveFolderUrl("");
    } catch (e) {
      toast.error("가져오기 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 공식 카드 페이지 URL → 서버 추출 → 표에 행 추가 (검수 후 등록) */
  const importCardToRow = (c: any): CardRow => {
    const row = emptyRow();
    row.game = importGame;
    if (c.code) row.code = String(c.code).toUpperCase();
    if (c.set_code) row.set_code = String(c.set_code).toUpperCase();
    if (c.name) row.name = String(c.name);
    if (c.type && VALID_TYPES.includes(c.type as CardType)) row.type = c.type as CardType;
    if (Array.isArray(c.colors)) row.colors = (c.colors as unknown[]).map(String);
    if (c.cost != null) row.cost = Number(c.cost);
    if (c.power != null) row.power = Number(c.power);
    if (c.counter != null) row.counter = Number(c.counter);
    if (c.attribute) row.attribute = String(c.attribute);
    if (c.rarity) row.rarity = String(c.rarity).toUpperCase();
    if (c.effect) row.effect = String(c.effect);
    if (Array.isArray(c.traits)) row.traits = (c.traits as unknown[]).map(String);
    if (c.extra && typeof c.extra === "object") row.extra = c.extra as Record<string, unknown>;
    if (c.image_url) row.image_url = normalizeImageUrl(String(c.image_url));
    // 디지몬 규칙 적용
    if (importGame === "dtcg") {
      const e = (row.extra ?? {}) as Record<string, string>;
      if (e.category && DIGIMON_CATEGORY_TYPE[e.category]) row.type = DIGIMON_CATEGORY_TYPE[e.category];
      const top = (e.text_top ?? "").trim();
      const bottom = (e.text_bottom ?? "").trim();
      if (top || bottom) row.effect = [top, bottom].filter(Boolean).join("\n\n");
      row.counter = null;
    }
    return row;
  };

  /** URL → 서버 추출 → 표에 행 추가. pages>1이면 page 파라미터로 목록 페이지를 순회(대량 가져오기). */
  const importFromUrl = async () => {
    const baseUrl = importUrl.trim();
    if (!baseUrl) { toast.error("URL을 입력하세요"); return; }
    const pages = Math.max(1, Math.min(50, Number(importPages) || 1));
    setImporting(true);
    setProgress({ done: 0, total: pages });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("로그인이 필요합니다"); return; }

      const collected: CardRow[] = [];
      const seen = new Set<string>();
      let lastPage = 0;
      for (let p = 1; p <= pages; p++) {
        // XE/Rhymix 등 목록은 page 파라미터를 사용 (단일이면 원본 URL 그대로)
        let pageUrl = baseUrl;
        if (pages > 1) {
          try {
            const u = new URL(baseUrl);
            u.searchParams.set("page", String(p));
            pageUrl = u.toString();
          } catch { /* keep base */ }
        }
        let json: any;
        try {
          const res = await fetch("/api/card-import", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url: pageUrl, game_hint: importGame }),
          });
          json = await res.json();
          if (!res.ok) {
            if (p === 1) throw new Error(json.error || `가져오기 실패 (${res.status})`);
            break; // 이후 페이지 오류면 거기서 중단
          }
        } catch (e) {
          if (p === 1) throw e;
          break;
        }
        const cards: any[] = Array.isArray(json.cards) ? json.cards : [];
        if (cards.length === 0) { lastPage = p; break; }
        let added = 0;
        for (const c of cards) {
          const code = c.code ? String(c.code).toUpperCase() : "";
          if (code && seen.has(code)) continue; // 페이지 간 중복 제거
          if (code) seen.add(code);
          collected.push(importCardToRow(c));
          added++;
        }
        lastPage = p;
        setProgress({ done: p, total: pages });
        if (added === 0) break; // 새 카드 없음 → 마지막 페이지로 간주
      }

      if (collected.length === 0) { toast.info("가져온 카드가 없습니다"); return; }
      setRows((prev) => [...prev, ...collected]);
      setDupChecked(false);
      setImportUrl("");
      toast.success(`${collected.length}건 가져옴 (${lastPage}페이지) — 아래 표에서 검수 후 등록하세요. (출처 표기 필요)`);
    } catch (e) {
      toast.error("가져오기 실패: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="single">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="single"><Plus className="mr-1 h-4 w-4" />한 장씩 입력</TabsTrigger>
          <TabsTrigger value="url"><Link2 className="mr-1 h-4 w-4" />URL 가져오기</TabsTrigger>
          <TabsTrigger value="excel"><FileSpreadsheet className="mr-1 h-4 w-4" />엑셀/CSV</TabsTrigger>
          <TabsTrigger value="images"><ImageIcon className="mr-1 h-4 w-4" />파일 업로드</TabsTrigger>
          <TabsTrigger value="drive"><ImageIcon className="mr-1 h-4 w-4" />Google Drive</TabsTrigger>
        </TabsList>

        <TabsContent value="url">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">URL로 카드 가져오기</CardTitle>
              <CardDescription>
                공식 카드 페이지 주소를 넣으면 카드 정보를 자동 추출해 아래 표에 채웁니다.
                지원: 디지몬(digimoncard.co.kr)·원피스 등 공식 카드 페이지. <b>개별 카드 상세 페이지</b> URL이 가장 정확합니다.
                이미지는 원본 링크를 그대로 참조(핫링크)하며 재호스팅하지 않습니다 — <b>출처 표기가 필요</b>합니다.
                일부 사이트는 봇 차단(403)이나 핫링크 차단으로 자동 수집/이미지 표시가 안 될 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={importGame} onValueChange={(v) => setImportGame(v as Game)}>
                  <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{VALID_GAMES.map((g) => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  placeholder="https://digimoncard.co.kr/index.php?mid=cardlist&..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") importFromUrl(); }}
                  disabled={importing}
                />
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="import-pages" className="whitespace-nowrap text-xs text-muted-foreground">페이지</Label>
                  <Input
                    id="import-pages"
                    type="number"
                    min={1}
                    max={50}
                    value={importPages}
                    onChange={(e) => setImportPages(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    disabled={importing}
                    className="w-16"
                  />
                </div>
                <Button onClick={importFromUrl} disabled={importing || !importUrl.trim()}>
                  {importing ? `가져오는 중… (${progress.done}/${progress.total})` : "가져오기"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <b>목록 페이지</b>를 여러 장 한 번에 가져오려면 "페이지"를 2 이상으로 설정하세요(목록 URL에 page 파라미터를 붙여 순회, 중복 코드 자동 제거).
                개별 카드 상세 URL이면 1로 두세요.
              </p>
              <p className="text-xs text-muted-foreground">
                ⚠️ 동적(JS)으로 로딩되는 페이지는 자동 추출이 어려울 수 있고, 봇 차단(403)·핫링크 차단 사이트도 있습니다.
                추출 결과는 AI 기반이라 부정확할 수 있으니 등록 전 반드시 검수하세요.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

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
                한국어 헤더를 자동 인식합니다: 코드, 세트, 게임, 이름, 종류, 색상, 비용, 파워, 카운터, 속성, 레어도, 효과, 이미지.
                이미지 칸에는 일반 URL 또는 <b>구글 드라이브 공유 링크</b>를 넣을 수 있습니다 (자동 변환, 공개 권한 필요).
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
        <TabsContent value="drive">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google Drive 연동</CardTitle>
              <CardDescription>
                본인 드라이브 폴더의 카드 이미지들을 일괄적으로 가져옵니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!driveConnected ? (
                <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">Google Drive 계정을 연결해야 합니다.</p>
                  <Button onClick={connectDrive}>
                    <Plus className="mr-2 h-4 w-4" /> Google Drive 연결하기
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-md bg-muted/10">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-600/20">연결됨</Badge>
                      <span className="text-sm font-medium">{driveEmail}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={disconnectDrive} className="text-destructive hover:text-destructive">연결 해제</Button>
                  </div>

                  <div className="flex gap-2">
                    <Input 
                      placeholder="Google Drive 폴더 주소 (예: https://drive.google.com/drive/folders/...)" 
                      value={driveFolderUrl}
                      onChange={e => setDriveFolderUrl(e.target.value)}
                    />
                    <Button onClick={previewDriveFolder} disabled={loadingDrive || !driveFolderUrl}>
                      {loadingDrive ? "조회 중…" : "미리보기"}
                    </Button>
                  </div>

                  {driveFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">이미지 {driveFiles.length}개 발견</span>
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="all-drive" 
                            checked={selectedDriveFiles.size === driveFiles.length}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedDriveFiles(new Set(driveFiles.map(f => f.id)));
                              else setSelectedDriveFiles(new Set());
                            }}
                          />
                          <Label htmlFor="all-drive" className="text-xs">전체 선택</Label>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-5 md:grid-cols-10 gap-2 max-h-60 overflow-y-auto p-1 border rounded-md bg-muted/5">
                        {driveFiles.map(f => (
                          <div 
                            key={f.id} 
                            className={`relative group cursor-pointer rounded border ${selectedDriveFiles.has(f.id) ? "border-primary ring-1 ring-primary" : "border-border"}`}
                            onClick={() => {
                              setSelectedDriveFiles(prev => {
                                const next = new Set(prev);
                                if (next.has(f.id)) next.delete(f.id);
                                else next.add(f.id);
                                return next;
                              });
                            }}
                          >
                            <img src={f.thumbnailLink} alt="" className="w-full aspect-[3/4] object-cover rounded-sm" />
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Checkbox checked={selectedDriveFiles.has(f.id)} className="pointer-events-none" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white p-0.5 truncate">
                              {f.name}
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button className="w-full" onClick={importDriveFiles} disabled={busy || selectedDriveFiles.size === 0}>
                        {busy ? `가져오는 중… (${progress.done}/${progress.total})` : `선택한 ${selectedDriveFiles.size}개 이미지 가져오기`}
                      </Button>
                    </div>
                  )}
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
          <CardHeader className="flex flex-col gap-3">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">미리보기 · 편집 ({rows.length}건)</CardTitle>
                <CardDescription>
                  유효 {valid.length}건 · 오류 {errorRowsList.length}건
                  {internalDups.size > 0 && <span className="text-amber-600"> · 내부 중복 코드 {internalDups.size}종</span>}
                  {dupChecked && <span className="text-amber-600"> · DB 중복 {dbDupCount}건</span>}
                  <span className="text-muted-foreground"> · 자동 임시저장됨 (Ctrl+Enter로 등록)</span>
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={applyAutoFix}><Wand2 className="mr-1 h-4 w-4" />자동 보정</Button>
                <Button variant="outline" size="sm" onClick={checkDuplicatesAgainstDb} disabled={busy}>
                  <ShieldCheck className="mr-1 h-4 w-4" />중복 검사
                </Button>
                <Button variant="outline" size="sm" onClick={ocrUnmatched} disabled={busy}>
                  <ScanLine className="mr-1 h-4 w-4" />이름 비어있는 행 OCR
                </Button>
                <Button variant="outline" size="sm" onClick={ocrSelected} disabled={busy || selected.size === 0}>
                  <ScanLine className="mr-1 h-4 w-4" />선택 OCR ({selected.size})
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(v => !v)} disabled={selected.size === 0}>
                  <Sparkles className="mr-1 h-4 w-4" />선택 일괄 적용 ({selected.size})
                </Button>
                <Button variant="ghost" size="sm" onClick={exportErrorsCsv}>
                  <AlertTriangle className="mr-1 h-4 w-4" />오류행 CSV
                </Button>
                <Button variant="ghost" size="sm" onClick={addBlank}><Plus className="mr-1 h-4 w-4" />빈 행</Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <Trash2 className="mr-1 h-4 w-4" />전체 비우기
                </Button>
              </div>
            </div>
            {bulkOpen && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 rounded-md border bg-muted/30 p-3">
                <Input placeholder="세트 (예: OP01)" value={(bulkPatch.set_code as string) ?? ""} onChange={e => setBulkPatch(p => ({ ...p, set_code: e.target.value }))} />
                <Select value={(bulkPatch.game as string) ?? ""} onValueChange={v => setBulkPatch(p => ({ ...p, game: v as Game }))}>
                  <SelectTrigger><SelectValue placeholder="게임" /></SelectTrigger>
                  <SelectContent>{VALID_GAMES.map(g => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={(bulkPatch.type as string) ?? ""} onValueChange={v => setBulkPatch(p => ({ ...p, type: v as CardType }))}>
                  <SelectTrigger><SelectValue placeholder="종류" /></SelectTrigger>
                  <SelectContent>{VALID_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="레어도 (예: SR)" value={(bulkPatch.rarity as string) ?? ""} onChange={e => setBulkPatch(p => ({ ...p, rarity: e.target.value }))} />
                <Button onClick={applyBulk}>{selected.size}건에 적용</Button>
              </div>
            )}
            {(errorRowsList.length > 0 || internalDups.size > 0) && (
              <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {Array.from(internalDups.entries()).slice(0, 5).map(([code, idxs]) => (
                  <div key={code}><Badge variant="destructive" className="mr-1">중복</Badge>{code} — {idxs.map(i => i + 1).join(", ")}행</div>
                ))}
                {issuesByRow.map((iss, i) => iss.filter(x => x.level === "error").slice(0, 1).map((x, j) => (
                  <div key={`${i}-${j}`}><Badge variant="destructive" className="mr-1">{i + 1}행</Badge>{x.field}: {x.message}</div>
                )))}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-8">
                      <Checkbox
                        checked={rows.length > 0 && selected.size === rows.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="전체 선택"
                      />
                    </th>
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
                  {rows.map((r, i) => {
                    const issues = issuesByRow[i] ?? [];
                    const fieldErr = (f: string) => issues.some(x => x.level === "error" && x.field === f);
                    const codeUpper = (r.code || "").toUpperCase();
                    const isInternalDup = internalDups.has(codeUpper);
                    const isDbDup = dupChecked && existingCodes.has(codeUpper);
                    const errCls = "border-destructive focus-visible:ring-destructive/40";
                    const rowBg = isInternalDup ? "bg-destructive/5" : isDbDup ? "bg-amber-500/5" : "";
                    return (
                    <tr key={i} className={`border-b border-border/40 ${rowBg}`}>
                      <td className="px-2 py-1">
                        <Checkbox
                          checked={selected.has(i)}
                          onCheckedChange={() => toggleSelect(i)}
                          aria-label={`${i + 1}행 선택`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-col gap-1">
                          {r.image_url ? (
                            <img src={normalizeImageUrl(r.image_url) ?? r.image_url} alt="" className="h-10 w-7 rounded object-cover" />
                          ) : <div className="h-10 w-7 rounded bg-muted" />}
                          <Input
                            value={r.image_url ?? ""}
                            onChange={e => updateRow(i, { image_url: e.target.value || null })}
                            onBlur={e => updateRow(i, { image_url: normalizeImageUrl(e.target.value) })}
                            placeholder="이미지 URL / 구글 드라이브 링크"
                            className="h-6 text-[10px] font-mono w-44"
                          />
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          value={r.code}
                          onChange={e => updateRow(i, { code: e.target.value })}
                          className={`h-7 text-xs ${fieldErr("code") || isInternalDup || isDbDup ? errCls : ""}`}
                        />
                        {(isInternalDup || isDbDup) && (
                          <Badge variant={isInternalDup ? "destructive" : "secondary"} className="mt-1 text-[9px] px-1 py-0">
                            {isInternalDup ? "내부 중복" : (r.image_url ? "추가 일러스트" : "DB 중복")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <Select 
                          value={r.set_code} 
                          onValueChange={v => updateRow(i, { set_code: v })}
                        >
                          <SelectTrigger className={`h-7 text-xs w-24 ${fieldErr("set_code") ? errCls : ""}`}>
                            <SelectValue placeholder="세트 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(new Set([r.set_code, ...sets])).filter(Boolean).sort((a, b) => a.localeCompare(b)).map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1">
                        <Select value={r.game} onValueChange={v => updateRow(i, { game: v as Game })}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{VALID_GAMES.map(g => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1"><Input value={r.name} onChange={e => updateRow(i, { name: e.target.value })} className={`h-7 text-xs min-w-[140px] ${fieldErr("name") ? errCls : ""}`} /></td>
                      <td className="px-1 py-1">
                        <Select value={r.type} onValueChange={v => updateRow(i, { type: v as CardType })}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{VALID_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1"><Input value={r.colors.join("|")} onChange={e => updateRow(i, { colors: e.target.value.split(/[|,;]/).map(s => s.trim()).filter(Boolean) })} placeholder="red|green" className={`h-7 text-xs w-24 ${fieldErr("colors") ? errCls : ""}`} /></td>
                      <td className="px-1 py-1"><Input value={r.cost ?? ""} onChange={e => updateRow(i, { cost: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.power ?? ""} onChange={e => updateRow(i, { power: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.counter ?? ""} onChange={e => updateRow(i, { counter: num(e.target.value) })} className="h-7 text-xs" /></td>
                      <td className="px-1 py-1"><Input value={r.rarity ?? ""} onChange={e => updateRow(i, { rarity: e.target.value || null })} className={`h-7 text-xs w-16 ${fieldErr("rarity") ? errCls : ""}`} /></td>
                      <td className="px-1 py-1">
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            disabled={busy || !r.image_url}
                            title="이미지 회전·크롭"
                            onClick={() => setEditIdx(i)}
                          >
                            <Crop className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            disabled={busy || !r.image_url}
                            title="이미지에서 자동 인식 (OCR)"
                            onClick={async () => { setBusy(true); try { await ocrRow(i); } finally { setBusy(false); } }}
                          >
                            <ScanLine className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
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

      <ImageEditDialog
        open={editIdx !== null}
        imageUrl={editIdx !== null ? rows[editIdx]?.image_url ?? null : null}
        setCode={editIdx !== null ? rows[editIdx]?.set_code : undefined}
        cardCode={editIdx !== null ? rows[editIdx]?.code : undefined}
        onClose={() => setEditIdx(null)}
        onSaved={(url) => { if (editIdx !== null) updateRow(editIdx, { image_url: url }); }}
      />
    </div>
  );
}

function SingleForm({ onAdd }: { onAdd: (r: CardRow) => void }) {
  const { sets } = useUniqueSets();
  const [isManualSet, setIsManualSet] = useState(false);
  const [r, setR] = useState<CardRow>(emptyRow());
  const displaySets = Array.from(new Set([r.set_code, ...sets])).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const [imgUploading, setImgUploading] = useState(false);
  const [imgDialogOpen, setImgDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실시간 입력 차단(trim/split 제거)을 방지하기 위한 임시 로컬 문자열 상태
  const [colorsInput, setColorsInput] = useState("");
  const [traitsInput, setTraitsInput] = useState("");

  // 외부(예: OCR 등) 또는 내부 초기화에 의해 r.colors가 변경될 때 로컬 문자열 동기화
  useEffect(() => {
    if (r.colors && r.colors.length > 0) {
      setColorsInput(r.colors.join("|"));
    } else {
      setColorsInput("");
    }
  }, [r.colors]);

  // 외부(예: OCR 등) 또는 내부 초기화에 의해 r.traits가 변경될 때 로컬 문자열 동기화
  useEffect(() => {
    if (r.traits && r.traits.length > 0) {
      setTraitsInput(r.traits.join(", "));
    } else {
      setTraitsInput("");
    }
  }, [r.traits]);

  const safeSegment = (s: string, fallback: string) =>
    (s || "").trim().replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || fallback;

  const onPickExtraImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    // 로그인 확인 - 비로그인이면 upload RLS에 막힘
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.error("로그인이 필요합니다. 다시 로그인 후 시도해 주세요.");
      return;
    }
    setImgUploading(true);
    const uploaded: string[] = [];
    try {
      for (const original of files) {
        if (!original.type.startsWith("image/")) {
          toast.error(`${original.name}: 이미지 파일이 아닙니다`);
          continue;
        }
        try {
          const f = await compressToWebp(original, { maxWidth: 1024, quality: 0.85 });
          const setSeg = safeSegment(r.set_code, "misc");
          const codeSeg = safeSegment(r.code, "card");
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${setSeg}/${codeSeg}-${Date.now()}-${rand}.webp`;
          const { error } = await supabase.storage
            .from("card-images")
            .upload(path, f, { cacheControl: "3600", upsert: false, contentType: "image/webp" });
          if (error) {
            console.error("[card-images upload]", error);
            toast.error(`${original.name}: ${error.message}`);
            continue;
          }
          const { data: pub } = supabase.storage.from("card-images").getPublicUrl(path);
          if (pub?.publicUrl) uploaded.push(pub.publicUrl);
        } catch (err) {
          console.error("[image upload error]", err);
          toast.error(`${original.name}: ${(err as Error).message}`);
        }
      }
      if (uploaded.length) {
        setR(prev => {
          if (!prev.image_url) {
            return { ...prev, image_url: uploaded[0], extra_images: [...(prev.extra_images ?? []), ...uploaded.slice(1)] };
          }
          return { ...prev, extra_images: [...(prev.extra_images ?? []), ...uploaded] };
        });
        toast.success(`이미지 ${uploaded.length}장 업로드 완료`);
      }
    } finally {
      setImgUploading(false);
    }
  };

  const ex = (r.extra ?? {}) as Record<string, string>;
  const setExtra = (k: string, v: string) =>
    setR(prev => ({ ...prev, extra: { ...((prev.extra as Record<string, unknown>) ?? {}), [k]: v } }));

  const submit = () => {
    if (!r.code || !r.set_code || !r.name) { toast.error("코드, 세트, 이름은 필수입니다"); return; }

    // 최종 전송 시점에 비로소 파싱하여 어레이화
    const parsedColors = colorsInput.split(/[|,;]/).map(s => s.trim()).filter(Boolean);
    const parsedTraits = traitsInput.split(/[|,;/]/).map(s => s.trim()).filter(Boolean);

    const out: CardRow = {
      ...r,
      colors: parsedColors,
      traits: parsedTraits,
      image_url: normalizeImageUrl(r.image_url),
      extra_images: (r.extra_images ?? []).map(u => normalizeImageUrl(u)).filter((u): u is string => !!u),
    };

    // 디지몬 규칙: 종류→type 매핑, 상단/하단 텍스트→effect 결합, 확장필드 정리
    if (r.game === "dtcg") {
      const e = (r.extra ?? {}) as Record<string, string>;
      const top = (e.text_top ?? "").trim();
      const bottom = (e.text_bottom ?? "").trim();
      out.effect = [top, bottom].filter(Boolean).join("\n\n") || null;
      out.counter = null;
      if (e.category && DIGIMON_CATEGORY_TYPE[e.category]) out.type = DIGIMON_CATEGORY_TYPE[e.category];
      const clean: Record<string, unknown> = {};
      for (const k of ["category", "form", "evo_cost_1", "evo_cost_2", "text_top", "text_bottom"]) {
        const v = (e[k] ?? "").trim?.() ?? e[k];
        if (v != null && String(v).trim() !== "") clean[k] = String(v).trim();
      }
      out.extra = Object.keys(clean).length ? clean : null;
    }

    onAdd(out);
    setR(emptyRow());
    setColorsInput("");
    setTraitsInput("");
    toast.success("표에 추가됨");
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>카드 코드 *</Label>
        <Input value={r.code} onChange={e => setR({ ...r, code: e.target.value })} placeholder="OP01-001" />
      </div>
      <div className="space-y-1.5">
        <Label className="flex items-center justify-between">
          <span>세트 *</span>
          {!isManualSet && (
            <button
              type="button"
              onClick={() => setIsManualSet(true)}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <Keyboard className="h-3 w-3" />직접 입력
            </button>
          )}
        </Label>
        {isManualSet ? (
          <div className="relative flex items-center">
            <Input
              value={r.set_code}
              onChange={e => setR({ ...r, set_code: e.target.value })}
              placeholder="예: OP01"
            />
            <button
              type="button"
              onClick={() => setIsManualSet(false)}
              className="absolute right-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              선택창으로
            </button>
          </div>
        ) : (
          <Select
            value={r.set_code}
            onValueChange={v => {
              if (v === "__NEW_SET__") {
                setIsManualSet(true);
              } else {
                setR({ ...r, set_code: v });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="세트 선택" />
            </SelectTrigger>
            <SelectContent>
              {displaySets.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <SelectItem value="__NEW_SET__" className="text-primary font-medium">
                + 직접 입력 / 신규 세트 추가
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>게임</Label>
        <Select value={r.game} onValueChange={v => setR({ ...r, game: v as Game })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{VALID_GAMES.map(g => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 space-y-1.5">
        <Label>카드 이름 *</Label>
        <Input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} placeholder={r.game === "dtcg" ? "엘리자몬" : "몽키 D 루피"} />
      </div>

      {r.game === "dtcg" ? (
        <>
          {/* ===== 디지몬 등록 규칙 ===== */}
          <div className="space-y-1.5">
            <Label>종류</Label>
            <Select value={ex.category ?? ""} onValueChange={v => setExtra("category", v)}>
              <SelectTrigger><SelectValue placeholder="종류 선택" /></SelectTrigger>
              <SelectContent>{DIGIMON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>형태</Label>
            <Select value={ex.form ?? ""} onValueChange={v => setExtra("form", v)}>
              <SelectTrigger><SelectValue placeholder="형태 선택" /></SelectTrigger>
              <SelectContent>{DIGIMON_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>색상 (구분자: | , ;)</Label>
            <Input value={colorsInput} onChange={e => setColorsInput(e.target.value)} placeholder="red|blue" />
          </div>
          <div className="space-y-1.5">
            <Label>레어도</Label>
            <Input value={r.rarity ?? ""} onChange={e => setR({ ...r, rarity: e.target.value || null })} placeholder="R / SR / SEC" />
          </div>
          <div className="space-y-1.5">
            <Label>DP</Label>
            <Input type="number" value={r.power ?? ""} onChange={e => setR({ ...r, power: num(e.target.value) })} placeholder="5000" />
          </div>
          <div className="space-y-1.5">
            <Label>등장 코스트</Label>
            <Input type="number" value={r.cost ?? ""} onChange={e => setR({ ...r, cost: num(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>진화 코스트 1</Label>
            <Input value={ex.evo_cost_1 ?? ""} onChange={e => setExtra("evo_cost_1", e.target.value)} placeholder="예: Lv.3" />
          </div>
          <div className="space-y-1.5">
            <Label>진화 코스트 2</Label>
            <Input value={ex.evo_cost_2 ?? ""} onChange={e => setExtra("evo_cost_2", e.target.value)} placeholder="예: Lv.4 / -" />
          </div>
          <div className="space-y-1.5">
            <Label>속성</Label>
            <Input value={r.attribute ?? ""} onChange={e => setR({ ...r, attribute: e.target.value || null })} placeholder="백신종 / 데이터종 / 바이러스종" />
          </div>
          <div className="space-y-1.5">
            <Label>유형 <span className="text-xs text-muted-foreground">(쉼표/| 구분)</span></Label>
            <Input value={traitsInput} onChange={e => setTraitsInput(e.target.value)} placeholder="리버레이터, 파충류형" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>상단 텍스트</Label>
            <Textarea value={ex.text_top ?? ""} onChange={e => setExtra("text_top", e.target.value)} rows={2} placeholder="[등장 시] ..." />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>하단 텍스트</Label>
            <Textarea value={ex.text_bottom ?? ""} onChange={e => setExtra("text_bottom", e.target.value)} rows={2} placeholder="[자신의 턴] ..." />
          </div>
        </>
      ) : (
        <>
          {/* ===== 원피스/포켓몬 등 ===== */}
          <div className="space-y-1.5">
            <Label>종류</Label>
            <Select value={r.type} onValueChange={v => setR({ ...r, type: v as CardType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VALID_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>색상 (구분자: | , ;)</Label>
            <Input value={colorsInput} onChange={e => setColorsInput(e.target.value)} placeholder="red|green" />
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
            <Label>특징 <span className="text-xs text-muted-foreground">(쉼표 또는 | 로 구분, 예: 밀짚모자 해적단, 초신성)</span></Label>
            <Input value={traitsInput} onChange={e => setTraitsInput(e.target.value)} placeholder="밀짚모자 해적단, 초신성" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>효과</Label>
            <Textarea value={r.effect ?? ""} onChange={e => setR({ ...r, effect: e.target.value || null })} rows={3} />
          </div>
        </>
      )}
      <div className="md:col-span-2 space-y-2 rounded-md border border-dashed p-3">
        <div className="flex items-center justify-between">
          <Label>카드 이미지 (여러 장 가능)</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => setImgDialogOpen(true)}>
            <ImageIcon className="mr-1 h-4 w-4" />이미지 등록
          </Button>
        </div>

        {(() => {
          const imgs = [r.image_url, ...(r.extra_images ?? [])].filter((u): u is string => !!u);
          if (imgs.length === 0) {
            return (
              <button
                type="button"
                onClick={() => setImgDialogOpen(true)}
                className="w-full py-6 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs">이미지 등록 버튼을 눌러 파일·URL·Drive에서 추가</span>
              </button>
            );
          }
          return (
            <div className="flex flex-wrap gap-2 pt-1">
              {imgs.map((u, i) => (
                <div key={`${u}-${i}`} className="relative">
                  <img
                    src={u}
                    alt=""
                    className={`h-20 w-14 rounded object-cover border-2 ${i === 0 ? "border-primary" : "border-border"}`}
                  />
                  {i === 0 && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0 h-4 gap-0.5">
                      <Star className="h-2.5 w-2.5" />메인
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        <p className="text-[11px] text-muted-foreground">
          첫 번째 이미지가 <b>메인 카드</b>로 카드 DB 상세에 표시됩니다. 순서 변경·삭제는 <b>이미지 등록</b> 팝업에서 가능합니다.
        </p>

        <ImageUploadDialog
          open={imgDialogOpen}
          onOpenChange={setImgDialogOpen}
          initialImages={[r.image_url, ...(r.extra_images ?? [])].filter((u): u is string => !!u)}
          setCode={r.set_code}
          cardCode={r.code}
          onCommit={(images: string[]) => {
            setR(prev => ({
              ...prev,
              image_url: images[0] ?? null,
              extra_images: images.slice(1),
            }));
            toast.success(`${images.length}장 적용됨`);
          }}
        />
      </div>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={submit}><Plus className="mr-1 h-4 w-4" />표에 추가</Button>
      </div>
    </div>
  );
}

function SortableImageGallery({
  images, onChange, onAdd, adding,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  onAdd?: () => void;
  adding?: boolean;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const promote = (idx: number) => move(idx, 0);

  return (
    <div className="flex flex-wrap gap-3 pt-2">
      {images.map((u, i) => (
        <div
          key={`${u}-${i}`}
          draggable
          onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIdx !== i) setOverIdx(i); }}
          onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx !== null && dragIdx !== i) move(dragIdx, i);
            setDragIdx(null); setOverIdx(null);
          }}
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
              title="메인 카드로 설정"
              aria-label="메인 카드로 설정"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            className="absolute -right-1 -bottom-1 rounded-full bg-destructive text-destructive-foreground p-0.5"
            aria-label="삭제"
          >
            <X className="h-3 w-3" />
          </button>
          <span className="absolute bottom-0 left-0 rounded-tr bg-background/80 px-1 text-[9px] font-mono text-muted-foreground">
            {i + 1}
          </span>
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="h-24 w-16 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          title="이미지 추가"
          aria-label="이미지 추가"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[10px]">{adding ? "업로드중" : "추가"}</span>
        </button>
      )}
    </div>
  );
}
