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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { useI18n } from "@/i18n/language-context";

/* ── 한국 주요 지역 (그룹별) ── */
export const KR_REGIONS: { group: string; cities: string[] }[] = [
  {
    group: "서울",
    cities: [
      "서울 강남", "서울 강동", "서울 강북", "서울 강서",
      "서울 건대", "서울 구로", "서울 노원", "서울 마포",
      "서울 목동", "서울 서초", "서울 성수", "서울 신촌",
      "서울 압구정", "서울 역삼", "서울 용산", "서울 종로", "서울 홍대",
    ],
  },
  {
    group: "경기",
    cities: [
      "고양 일산", "광명", "구리", "군포", "김포",
      "남양주", "부천 상동", "부천 신중동", "부천 역곡",
      "분당 서현", "분당 수내", "성남", "수원 권선", "수원 영통", "수원 인계",
      "시흥", "안산", "안양", "양주", "용인", "의정부", "이천",
      "파주", "평택", "하남", "화성 동탄",
    ],
  },
  {
    group: "인천",
    cities: ["인천 계양", "인천 남동", "인천 부평", "인천 연수", "인천 주안"],
  },
  {
    group: "부산",
    cities: ["부산 광안", "부산 서면", "부산 연산", "부산 해운대"],
  },
  {
    group: "대구",
    cities: ["대구 동성로", "대구 범어", "대구 수성"],
  },
  {
    group: "광주",
    cities: ["광주 상무", "광주 충장"],
  },
  {
    group: "대전",
    cities: ["대전 둔산", "대전 은행"],
  },
  {
    group: "울산",
    cities: ["울산 남구", "울산 중구"],
  },
  {
    group: "기타",
    cities: ["강원", "경남", "경북", "세종", "전남", "전북", "제주", "충남", "충북"],
  },
];

/* ── 지도 앱 ── */
export type MapProvider = "kakao" | "naver" | "google";

export const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  kakao: "카카오맵",
  naver: "네이버지도",
  google: "구글맵",
};

export function buildMapUrl(
  s: { name: string; address: string | null; region: string | null },
  provider: MapProvider
): string {
  const q = encodeURIComponent(s.address || `${s.name} ${s.region ?? ""}`.trim());
  if (provider === "kakao") return `https://map.kakao.com/?q=${q}`;
  if (provider === "naver") return `https://map.naver.com/v5/search/${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function useMapProvider(): [MapProvider, (p: MapProvider) => void] {
  const [provider, setProviderState] = useState<MapProvider>(() => {
    if (typeof window === "undefined") return "kakao";
    return (localStorage.getItem("duelnight.map.provider") as MapProvider) ?? "kakao";
  });
  const setProvider = (p: MapProvider) => {
    setProviderState(p);
    if (typeof window !== "undefined") localStorage.setItem("duelnight.map.provider", p);
  };
  return [provider, setProvider];
}

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

export const Route = createFileRoute("/stores/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "TCG 매장 찾기 — DuelNight",
      en: "TCG Store Locator — DuelNight",
      ja: "TCG店舗検索 — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "지역별 TCG 매장과 취급 게임을 찾고 즐겨찾기로 저장하세요.",
      en: "Find TCG stores by region and the games they carry. Save your favorites.",
      ja: "地域別のTCG店舗と取扱ゲームを検索してお気に入りに保存しましょう。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: StoresPage,
});

function StoresPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [game, setGame] = useState<Game | "all">("all");
  const [region, setRegion] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [mapProvider, setMapProvider] = useMapProvider();

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
      toast.error(t("stores.loginRequiredToast"));
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
      <PageHeader title={t("stores.title")} description={t("stores.desc")}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("stores.searchPlaceholder")}
          className="w-[180px]"
        />
        {isAdmin && <NewStoreDialog onCreated={() => refetch()} />}
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("stores.allGames")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("stores.allGames")}</SelectItem>
            {ALL_GAMES.map((g) => (
              <SelectItem key={g} value={g}>
                {GAME_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 지역 필터 — KR_REGIONS 그룹 + DB에만 있는 추가 항목 */}
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("stores.allRegions")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">{t("stores.allRegions")}</SelectItem>
            {KR_REGIONS.map((grp) => (
              <SelectGroup key={grp.group}>
                <SelectLabel className="text-xs text-muted-foreground">
                  {grp.group}
                </SelectLabel>
                {grp.cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            {(() => {
              const known = new Set(KR_REGIONS.flatMap((g) => g.cities));
              const extras = regions.filter((r) => !known.has(r));
              if (extras.length === 0) return null;
              return (
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">기타</SelectLabel>
                  {extras.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })()}
          </SelectContent>
        </Select>

        {user && (
          <label className="ml-1 inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={favOnly}
              onCheckedChange={(v) => setFavOnly(!!v)}
            />
            {t("stores.favoritesOnly")}
          </label>
        )}

        {/* 지도 앱 선택 */}
        <div className="ml-auto flex items-center gap-1">
          {(["kakao", "naver", "google"] as MapProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMapProvider(p)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mapProvider === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50"
              }`}
            >
              {MAP_PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-end">
        <span className="text-xs text-muted-foreground">{t("stores.storeCount", { count: filtered.length })}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={StoreIcon}
            title={t("stores.emptyTitle")}
            description={isAdmin ? t("stores.emptyDescAdmin") : t("stores.emptyDescUser")}
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
                      title={isFav ? t("stores.removeFav") : t("stores.addFav")}
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
                          if (!confirm(t("stores.confirmDelete"))) return;
                          const { error } = await supabase
                            .from("stores")
                            .delete()
                            .eq("id", s.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success(t("stores.deleteSuccess"));
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
                    href={buildMapUrl(s, mapProvider)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <MapIcon className="h-3 w-3" />
                    {MAP_PROVIDER_LABELS[mapProvider]}
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
                      {t("stores.urlLink")}
                    </a>
                  )}
                  <Link
                    to="/stores/$id"
                    params={{ id: s.id }}
                    className="ml-auto text-primary hover:underline"
                  >
                    {t("stores.detailLink")}
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
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    region: "",
    regionCustom: "",   // "기타 직접입력" 선택 시 사용
    address: "",
    phone: "",
    url: "",
    notes: "",
    games: [] as Game[],
  });

  // 최종 지역값: "기타" 선택이면 직접입력값 사용
  const resolvedRegion = form.region === "__custom__" ? form.regionCustom : form.region;

  const toggleGame = (g: Game) =>
    setForm((f) => ({
      ...f,
      games: f.games.includes(g) ? f.games.filter((x) => x !== g) : [...f.games, g],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim()) {
      toast.error(t("stores.nameRequired"));
      return;
    }
    const { error } = await supabase.from("stores").insert({
      user_id: user.id,
      name: form.name.trim(),
      region: resolvedRegion.trim() || null,
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
    toast.success(t("stores.addSuccess"));
    setOpen(false);
    setForm({ name: "", region: "", regionCustom: "", address: "", phone: "", url: "", notes: "", games: [] });
    qc.invalidateQueries({ queryKey: ["stores"] });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("stores.addStore")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("stores.addStoreTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("stores.fieldName")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("stores.fieldRegion")}</Label>
              <Select
                value={form.region}
                onValueChange={(v) => setForm({ ...form, region: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("stores.placeholderRegion")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {KR_REGIONS.map((grp) => (
                    <SelectGroup key={grp.group}>
                      <SelectLabel className="text-xs text-muted-foreground">
                        {grp.group}
                      </SelectLabel>
                      {grp.cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectGroup>
                    <SelectItem value="__custom__">기타 (직접 입력)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {form.region === "__custom__" && (
                <Input
                  className="mt-1"
                  value={form.regionCustom}
                  onChange={(e) => setForm({ ...form, regionCustom: e.target.value })}
                  placeholder="지역명 직접 입력"
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("stores.fieldPhone")}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("stores.fieldAddress")}</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("stores.fieldWebSns")}</Label>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("stores.fieldGames")}</Label>
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
            <Label>{t("stores.fieldNotes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("stores.placeholderNotes")}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("stores.addStore")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
