import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "비밀번호 재설정 — TCG Hub" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Supabase parses recovery hash and emits PASSWORD_RECOVERY event.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also accept already-active session (e.g. user navigates here manually
    // after the recovery link).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      toast.error("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">비밀번호 재설정</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        새 비밀번호를 입력해 주세요.
      </p>

      {!ready ? (
        <div className="mt-6 rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          이메일로 받은 재설정 링크에서 이 페이지로 이동해야 합니다. 링크가 만료되었을 수 있어요.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">새 비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">비밀번호 확인</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? "변경 중..." : "비밀번호 변경"}
          </Button>
        </form>
      )}
    </div>
  );
}
