import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const emailInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

/** 서버 사이드에서 인증된 사용자 ID와 Supabase 클라이언트를 가져오는 헬퍼 */
async function getAuthContext() {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!
  );
  
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return { supabase, userId: data.user.id };
}

/** 호출자가 admin인지 서버에서 검증해 boolean 반환. */
export const checkIsAdmin = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabase, userId } = await getAuthContext();
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
  .handler(async () => {
    const { supabase } = await getAuthContext();
    const { error } = await supabase.rpc("claim_admin_if_none");
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

/** 이메일로 admin 권한 부여. */
export const grantAdmin = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const { email } = data as { email: string };
    const { supabase, userId } = await getAuthContext();
    
    // 서버에서 호출자 admin 여부 확인
    const { data: me } = await supabase
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me) throw new Response("관리자만 호출할 수 있어요", { status: 403 });

    const { data: targetId, error } = await supabase.rpc(
      "grant_admin_by_email",
      { _email: email },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { userId: targetId as string };
  });

/** 이메일로 admin 권한 해제. */
export const revokeAdmin = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const { email } = data as { email: string };
    const { supabase, userId } = await getAuthContext();

    const { data: me } = await supabase
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me) throw new Response("관리자만 호출할 수 있어요", { status: 403 });

    const { data: targetId, error } = await supabase.rpc(
      "revoke_admin_by_email",
      { _email: email },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { userId: targetId as string };
  });

/** 관리자 목록 조회. */
export const listAdmins = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabase } = await getAuthContext();
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

/** 관리자 존재 여부. */
export const anyAdminExists = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc("any_admin_exists");
    if (error) throw new Response(error.message, { status: 500 });
    return { exists: !!data };
  });
