/** 서버 사이드에서 인증된 사용자 ID를 가져오는 헬퍼(결제 도메인 공용). */
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

export async function getAuthenticatedUserId(): Promise<string> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}
