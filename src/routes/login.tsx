import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
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
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // 로그인 성공 후 AuthContext에 user가 반영되면 자동으로 이동
  // (race condition 방지: navigate를 user 상태 변화에 종속시킴)
  useEffect(() => {
    if (user) {
      navigate({ to: "/matches" });
    }
  }, [user, navigate]);


  const forgotPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error("먼저 이메일을 입력해 주세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("비밀번호 재설정 이메일을 보냈어요. 받은 편지함을 확인해 주세요.");
  };

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
        // navigate는 user 상태 변화 useEffect에서 처리 (race 방지)
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/matches`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/matches" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithNaver = async () => {
    try {
      toast.info("네이버 로그인은 현재 준비 중입니다. 구글 로그인을 이용해 주세요.");
      // const { error } = await supabase.auth.signInWithOAuth({ ... });
    } catch (err) {
      toast.error(`네이버 연동 오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const signInWithKakao = async () => {
    // NOTE: Kakao requires Custom OIDC configuration in Supabase Dashboard
    setBusy(true);
    try {
      toast.info("카카오 로그인은 현재 준비 중입니다. 구글 로그인을 이용해 주세요.");
      // const { error } = await supabase.auth.signInWithOAuth({ ... });
    } catch (err) {
      toast.error(`카카오 연동 오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const comingSoon = (name: string) => () =>
    toast.info(`${name} 로그인은 곧 지원될 예정입니다.`);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "signin" ? "로그인" : "회원가입"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        전적과 통계를 저장하려면 로그인이 필요합니다.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5-.05-.9-.1-1.3H12z"
            />
          </svg>
          Google로 계속하기
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={signInWithNaver}
          disabled={busy}
          className="w-full"
        >
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[#03C75A] text-[10px] font-bold text-white">
            N
          </span>
          네이버로 계속하기
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={signInWithKakao}
          disabled={busy}
          className="w-full"
        >
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[#FEE500] text-[10px] font-bold text-[#3C1E1E]">
            K
          </span>
          카카오로 계속하기
        </Button>
      </div>

      <div className="my-5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는 이메일
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
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
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "계정이 없으신가요? 가입하기"
            : "이미 계정이 있으신가요? 로그인"}
        </button>
        {mode === "signin" && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            비밀번호 잊으셨나요?
          </button>
        )}
      </div>
      <Link to="/" className="mt-2 text-xs text-muted-foreground hover:text-foreground">
        ← 대시보드로
      </Link>
    </div>
  );
}
