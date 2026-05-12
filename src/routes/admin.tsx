import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, UserPlus, UserMinus, Crown } from "lucide-react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const emailSchema = z
  .string()
  .trim()
  .email({ message: "올바른 이메일 형식이 아닙니다" })
  .max(255);

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "관리자 — TCG Hub" },
      { name: "description", content: "관리자 권한 부여 및 관리." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: anyAdmin, isLoading: l1 } = useQuery({
    queryKey: ["any-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("any_admin_exists");
      if (error) throw error;
      return !!data;
    },
  });

  const { data: amAdmin, isLoading: l2 } = useQuery({
    queryKey: ["am-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  const { data: admins = [], refetch: refetchAdmins } = useQuery({
    queryKey: ["admins-list"],
    enabled: !!amAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_admins");
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string;
        email: string;
        display_name: string | null;
        granted_at: string;
      }>;
    },
  });

  const [grantEmail, setGrantEmail] = useState("");
  const [revokeEmail, setRevokeEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["any-admin"] });
    qc.invalidateQueries({ queryKey: ["am-admin"] });
    refetchAdmins();
  };

  const claim = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("claim_admin_if_none");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("첫 관리자로 등록됐어요");
    refresh();
  };

  const grant = async () => {
    const parsed = emailSchema.safeParse(grantEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.rpc("grant_admin_by_email", {
      _email: parsed.data,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${parsed.data} 에게 관리자 권한을 부여했어요`);
    setGrantEmail("");
    refresh();
  };

  const revoke = async () => {
    const parsed = emailSchema.safeParse(revokeEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!confirm(`${parsed.data} 의 관리자 권한을 해제할까요?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("revoke_admin_by_email", {
      _email: parsed.data,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("관리자 권한을 해제했어요");
    setRevokeEmail("");
    refresh();
  };

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <PageHeader title="관리자" description="권한을 관리합니다" />
        <div className="mt-6">
          <EmptyState
            icon={Shield}
            title="로그인이 필요합니다"
            description="관리자 페이지에 접근하려면 먼저 로그인하세요."
          />
        </div>
      </div>
    );
  }

  if (l1 || l2) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <PageHeader title="관리자" description="권한을 관리합니다" />
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="관리자" description="관리자 권한 부여·해제 및 목록 관리" />

      {!anyAdmin && (
        <section className="mt-6 rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Crown className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold">첫 관리자 등록</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                아직 관리자가 없어요. 지금 로그인된 본인 계정을 첫 관리자로 등록할 수 있습니다.
                이후에는 다른 사용자에게 관리자 권한을 이메일로 부여할 수 있어요.
              </p>
              <Button onClick={claim} disabled={busy} className="mt-3">
                <Crown className="mr-1 h-4 w-4" />
                내 계정을 첫 관리자로 등록
              </Button>
            </div>
          </div>
        </section>
      )}

      {anyAdmin && !amAdmin && (
        <section className="mt-6">
          <EmptyState
            icon={Shield}
            title="관리자 권한이 없습니다"
            description="이미 다른 계정이 관리자입니다. 권한이 필요하면 기존 관리자에게 이메일로 부여를 요청하세요."
          />
        </section>
      )}

      {amAdmin && (
        <>
          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">관리자 권한 부여</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              해당 이메일로 가입된 사용자에게 admin 역할을 추가합니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="grant-email" className="sr-only">
                  이메일
                </Label>
                <Input
                  id="grant-email"
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="user@example.com"
                  maxLength={255}
                />
              </div>
              <Button onClick={grant} disabled={busy} className="gap-1">
                <UserPlus className="h-4 w-4" />
                부여
              </Button>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">관리자 권한 해제</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              본인 계정은 해제할 수 없습니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                value={revokeEmail}
                onChange={(e) => setRevokeEmail(e.target.value)}
                placeholder="user@example.com"
                maxLength={255}
              />
              <Button
                onClick={revoke}
                disabled={busy}
                variant="outline"
                className="gap-1"
              >
                <UserMinus className="h-4 w-4" />
                해제
              </Button>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold">현재 관리자 ({admins.length})</h2>
            {admins.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">관리자가 없습니다.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
                {admins.map((a) => (
                  <li
                    key={a.user_id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.display_name ?? a.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.email} · {new Date(a.granted_at).toLocaleDateString()}
                      </p>
                    </div>
                    {a.user_id === user.id && (
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        나
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
