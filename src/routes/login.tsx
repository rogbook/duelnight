import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "로그인 — TCG Hub" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("가입 완료. 이메일 인증을 확인해 주세요.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/matches" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "signin" ? "로그인" : "회원가입"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        전적과 통계를 저장하려면 로그인이 필요합니다.
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" disabled={busy} className="mt-2">
          {busy ? "처리 중..." : mode === "signin" ? "로그인" : "가입하기"}
        </Button>
      </form>
      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-4 text-xs text-muted-foreground hover:text-foreground"
      >
        {mode === "signin"
          ? "계정이 없으신가요? 가입하기"
          : "이미 계정이 있으신가요? 로그인"}
      </button>
      <Link to="/" className="mt-2 text-xs text-muted-foreground hover:text-foreground">
        ← 대시보드로
      </Link>
    </div>
  );
}
