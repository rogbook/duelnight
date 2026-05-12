import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Store as StoreIcon, Plus, Trash2, MapPin, Phone, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "TCG 매장 — TCG Hub" },
      { name: "description", content: "지역별 TCG 매장과 취급 게임을 한곳에." },
    ],
  }),
  component: StoresPage,
});

function StoresPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");

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

  const filtered = stores.filter((s) => {
    if (!q) return true;
    const hay = `${s.name} ${s.region ?? ""} ${s.address ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="TCG 매장" description="지역별 매장과 취급 게임을 공유하세요">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·지역 검색"
          className="w-[180px]"
        />
        {user ? (
          <NewStoreDialog onCreated={() => refetch()} />
        ) : (
          <Button asChild size="sm">
            <Link to="/login">로그인하고 등록</Link>
          </Button>
        )}
      </PageHeader>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={StoreIcon}
            title="등록된 매장이 없어요"
            description="첫 매장을 등록해 주세요."
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{s.name}</h3>
                  {s.region && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {s.region}
                    </p>
                  )}
                </div>
                {user?.id === s.user_id && (
                  <button
                    onClick={async () => {
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
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {s.phone}
                  </span>
                )}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    링크
                  </a>
                )}
              </div>
              {s.notes && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-foreground/80">
                  {s.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ALL_GAMES: Game[] = ["optcg", "ptcg", "dtcg"];

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
        <DialogHeader><DialogTitle>매장 등록</DialogTitle></DialogHeader>
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
