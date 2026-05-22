import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Store as StoreIcon,
  Plus,
  Trash2,
  MapPin,
  Phone,
  ExternalLink,
  Star,
  Map as MapIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Store = {
  id: string;
  user_id: string;
  name: string;
  region: string | null;
  address: string | null;
  games: Game[];
  phone: string | null;
  url: string | null;
  notes: string | null;
};

const ALL_GAMES: Game[] = ["optcg", "ptcg", "dtcg"];

function mapUrl(s: { name: string; address: string | null; region: string | null }) {
  const q = encodeURIComponent(s.address || `${s.name} ${s.region ?? ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export const Route = createFileRoute("/stores/")({
  head: () => ({
    meta: [
      { title: "TCG 매장 찾기 — DuelNight" },
      { name: "description", content: "지역별 TCG 매장과 취급 게임을 찾고 즐겨찾기로 저장하세요." },
    ],
  }),
  component: StoresPage,
});

function StoresPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [game, setGame] = useState<Game | "all">("all");
  const [region, setRegion] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);

  const { data: stores = [], refetch } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });

  const { data: favIds = [] } = useQuery({
    queryKey: ["store-favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_favorites")
        .select("store_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.store_id as string);
    },
  });
  const favSet = useMemo(() => new Set(favIds), [favIds]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) if (s.region) set.add(s.region);
    return Array.from(set).sort();
  }, [stores]);

  const filtered = stores.filter((s) => {
    if (favOnly && !favSet.has(s.id)) return false;
    if (game !== "all" && !s.games.includes(game)) return false;
    if (region !== "all" && s.region !== region) return false;
    if (q) {
      const hay = `${s.name} ${s.region ?? ""} ${s.address ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const toggleFav = async (storeId: string) => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const isFav = favSet.has(storeId);
    if (isFav) {
      const { error } = await supabase
        .from("store_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("store_id", storeId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("store_favorites")
        .insert({ user_id: user.id, store_id: storeId });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["store-favorites", user.id] });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader title="TCG 매장 찾기" description="지역·게임으로 매장을 찾고 즐겨찾기로 저장하세요">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·지역·주소"
          className="w-[180px]"
        />
        {isAdmin && <NewStoreDialog onCreated={() => refetch()} />}
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="게임" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 게임</SelectItem>
            {ALL_GAMES.map((g) => (
              <SelectItem key={g} value={g}>
                {GAME_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="지역" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 지역</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user && (
          <label className="ml-1 inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={favOnly}
              onCheckedChange={(v) => setFavOnly(!!v)}
            />
            즐겨찾기만
          </label>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length}곳</span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={StoreIcon}
            title="조건에 맞는 매장이 없어요"
            description={isAdmin ? "관리자 페이지에서 매장을 등록해 주세요." : "필터를 조정해 보세요."}
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((s) => {
            const isFav = favSet.has(s.id);
            return (
              <li
                key={s.id}
                className="rounded-lg border border-border bg-card p-4 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to="/stores/$id" params={{ id: s.id }} className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold hover:underline">{s.name}</h3>
                    {s.region && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {s.region}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFav(s.id);
                      }}
                      title={isFav ? "즐겨찾기 해제" : "즐겨찾기"}
                      className={
                        isFav
                          ? "text-yellow-500"
                          : "text-muted-foreground hover:text-yellow-500"
                      }
                    >
                      <Star className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!confirm("매장을 삭제할까요?")) return;
                          const { error } = await supabase
                            .from("stores")
                            .delete()
                            .eq("id", s.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success("삭제됨");
                            refetch();
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {s.address && (
                  <p className="mt-2 text-xs text-muted-foreground">{s.address}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.games.map((g) => (
                    <span
                      key={g}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {GAME_LABEL[g]}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {s.phone && (
                    <a
                      href={`tel:${s.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" />
                      {s.phone}
                    </a>
                  )}
                  <a
                    href={mapUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <MapIcon className="h-3 w-3" />
                    지도
                  </a>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      링크
                    </a>
                  )}
                  <Link
                    to="/stores/$id"
                    params={{ id: s.id }}
                    className="ml-auto text-primary hover:underline"
                  >
                    상세 →
                  </Link>
                </div>
                {s.notes && (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-foreground/80">
                    {s.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewStoreDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    region: "",
    address: "",
    phone: "",
    url: "",
    notes: "",
    games: [] as Game[],
  });

  const toggleGame = (g: Game) =>
    setForm((f) => ({
      ...f,
      games: f.games.includes(g) ? f.games.filter((x) => x !== g) : [...f.games, g],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim()) {
      toast.error("매장 이름을 입력해 주세요");
      return;
    }
    const { error } = await supabase.from("stores").insert({
      user_id: user.id,
      name: form.name.trim(),
      region: form.region.trim() || null,
      address: form.address.trim() || null,
      games: form.games,
      phone: form.phone.trim() || null,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("등록됨");
    setOpen(false);
    setForm({ name: "", region: "", address: "", phone: "", url: "", notes: "", games: [] });
    qc.invalidateQueries({ queryKey: ["stores"] });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          매장 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>매장 등록 (관리자)</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>매장 이름</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>지역</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="예: 서울 강남"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>전화</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>주소</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>웹/SNS</Label>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>취급 게임</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_GAMES.map((g) => (
                <label key={g} className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.games.includes(g)}
                    onCheckedChange={() => toggleGame(g)}
                  />
                  {GAME_LABEL[g]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>비고</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="대회 일정, 영업시간 등"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit">등록</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
