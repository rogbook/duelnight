import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables, Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];

type Profile = Tables<"profiles">;

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "프로필 — TCG Hub" },
      { name: "description", content: "내 프로필, 닉네임, 아바타." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const [form, setForm] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
    bio: "",
    primary_game: "" as Game | "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        username: profile.username ?? "",
        display_name: profile.display_name ?? "",
        avatar_url: profile.avatar_url ?? "",
        bio: profile.bio ?? "",
        primary_game: (profile.primary_game ?? "") as Game | "",
      });
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="프로필" description="로그인 후 이용할 수 있어요" />
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <User className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">로그인이 필요합니다</p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const username = form.username.trim() || null;
    if (username && !/^[a-zA-Z0-9_]{2,24}$/.test(username)) {
      toast.error("닉네임은 영문/숫자/_ 2~24자여야 합니다.");
      return;
    }
    setSaving(true);
    const payload = {
      id: user.id,
      username,
      display_name: form.display_name.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      bio: form.bio.trim() || null,
      primary_game: (form.primary_game || null) as Game | null,
    };
    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "이미 사용 중인 닉네임입니다." : error.message,
      );
      return;
    }
    toast.success("프로필이 저장되었습니다");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const initials = (form.display_name || user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="프로필" description="닉네임, 표시 이름, 아바타, 자기소개" />

      <section className="mt-6 flex items-center gap-4 rounded-lg border border-border bg-card p-4">
        <Avatar className="h-16 w-16">
          {form.avatar_url ? <AvatarImage src={form.avatar_url} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {form.display_name || user.email}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {form.username ? `@${form.username}` : user.email}
          </p>
        </div>
      </section>

      <form
        onSubmit={save}
        className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display_name">표시 이름</Label>
          <Input
            id="display_name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="화면에 표시될 이름"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">닉네임 (영문/숫자/_)</Label>
          <Input
            id="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="luffy_red"
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="avatar_url">아바타 URL</Label>
          <Input
            id="avatar_url"
            value={form.avatar_url}
            onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="bio">자기소개</Label>
          <Textarea
            id="bio"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={3}
            placeholder="좋아하는 덱, 활동 매장 등"
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
