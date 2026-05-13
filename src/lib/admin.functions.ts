import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emailInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

/** 호출자가 admin인지 서버에서 검증해 boolean 반환. */
export const checkIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return { isAdmin: !!data };
  });

/** 시스템에 admin이 한 명도 없을 때 호출자를 첫 admin으로 등록. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("claim_admin_if_none");
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

/** 이메일로 admin 권한 부여. RPC 내부에서 호출자가 admin인지 다시 검증함. */
export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { email } = data as { email: string };
    const { supabase } = context;
    // 1차 방어: 서버에서 호출자 admin 여부 확인
    const { data: me } = await supabase
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Response("관리자만 호출할 수 있어요", { status: 403 });
    // 2차 방어: RPC 내부에서도 has_role 재확인
    const { data: targetId, error } = await supabase.rpc(
      "grant_admin_by_email",
      { _email: data.email },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { userId: targetId as string };
  });

/** 이메일로 admin 권한 해제. */
export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { email } = data as { email: string };
    const { supabase } = context;
    const { data: me } = await supabase
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Response("관리자만 호출할 수 있어요", { status: 403 });
    const { data: targetId, error } = await supabase.rpc(
      "revoke_admin_by_email",
      { _email: data.email },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { userId: targetId as string };
  });

/** 관리자 목록 조회. RPC가 admin만 허용. */
export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("list_admins");
    if (error) throw new Response(error.message, { status: 403 });
    return {
      admins: (data ?? []) as Array<{
        user_id: string;
        email: string;
        display_name: string | null;
        granted_at: string;
      }>,
    };
  });

/** 관리자 존재 여부. 비로그인도 호출 가능해야 부트스트랩 안내가 가능. */
export const anyAdminExists = createServerFn({ method: "POST" })
  .handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc("any_admin_exists");
    if (error) throw new Response(error.message, { status: 500 });
    return { exists: !!data };
  },
);
