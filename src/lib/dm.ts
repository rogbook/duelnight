/**
 * 1:1 다이렉트 메시지(DM) 데이터 계층.
 * 새 테이블(conversations/messages/user_blocks/user_reports)은 Lovable가 타입을
 * 재생성하기 전까지 types.ts에 없으므로, 이 모듈에서만 캐스트로 접근해 앱 전체의
 * 타입 안전을 유지한다. (재생성 후엔 캐스트 제거 가능)
 */
import { supabase } from "@/integrations/supabase/client";

export type DMConversation = {
  id: string;
  user_lo: string;
  user_hi: string;
  last_message: string | null;
  last_message_at: string;
  last_sender_id: string | null;
  read_at_lo: string;
  read_at_hi: string;
};

export type DMMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type DMProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

// types.ts에 아직 없는 테이블/함수 접근용 (서버 적용 후 정타입화 가능)
const sb = () => supabase as any;

export async function startDm(otherUserId: string): Promise<string> {
  const { data, error } = await sb().rpc("start_dm", { _other: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { data: u } = await supabase.auth.getUser();
  const senderId = u.user?.id;
  if (!senderId) throw new Error("로그인이 필요합니다");
  const { error } = await sb()
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: trimmed.slice(0, 4000) });
  if (error) throw error;
}

export async function markRead(conversationId: string): Promise<void> {
  await sb().rpc("mark_dm_read", { _conversation: conversationId });
}

export async function fetchConversation(conversationId: string): Promise<DMConversation | null> {
  const { data, error } = await sb()
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data as DMConversation) ?? null;
}

export async function fetchConversations(): Promise<DMConversation[]> {
  const { data, error } = await sb()
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DMConversation[];
}

export async function fetchMessages(conversationId: string): Promise<DMMessage[]> {
  const { data, error } = await sb()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DMMessage[];
}

export async function fetchProfiles(ids: string[]): Promise<Record<string, DMProfile>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await sb()
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, DMProfile> = {};
  for (const p of (data ?? []) as DMProfile[]) map[p.id] = p;
  return map;
}

export async function blockUser(otherId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("로그인이 필요합니다");
  const { error } = await sb()
    .from("user_blocks")
    .insert({ blocker_id: u.user.id, blocked_id: otherId });
  if (error) throw error;
}

export async function unblockUser(otherId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await sb().from("user_blocks").delete().eq("blocker_id", u.user.id).eq("blocked_id", otherId);
}

export async function isBlocked(otherId: string): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { data } = await sb()
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", u.user.id)
    .eq("blocked_id", otherId)
    .maybeSingle();
  return !!data;
}

export async function reportUser(
  reportedId: string,
  conversationId: string | null,
  reason: string,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("로그인이 필요합니다");
  const { error } = await sb().from("user_reports").insert({
    reporter_id: u.user.id,
    reported_id: reportedId,
    conversation_id: conversationId,
    reason,
  });
  if (error) throw error;
}

// ── 헬퍼 ───────────────────────────────────────────────
export function otherUserId(c: DMConversation, me: string): string {
  return c.user_lo === me ? c.user_hi : c.user_lo;
}
export function myReadAt(c: DMConversation, me: string): string {
  return c.user_lo === me ? c.read_at_lo : c.read_at_hi;
}
export function theirReadAt(c: DMConversation, me: string): string {
  return c.user_lo === me ? c.read_at_hi : c.read_at_lo;
}
/** 상대가 마지막으로 보냈고 내 읽음 시각 이후면 '안 읽음' */
export function isUnread(c: DMConversation, me: string): boolean {
  if (!c.last_sender_id || c.last_sender_id === me) return false;
  return new Date(c.last_message_at).getTime() > new Date(myReadAt(c, me)).getTime();
}
