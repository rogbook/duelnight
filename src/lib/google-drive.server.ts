import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
// 실제 콜백 라우트(src/routes/auth.google-drive.callback.ts)와 정확히 일치해야 한다.
// 이전 값 `/api/drive/callback`은 존재하지 않는 경로라 콜백이 404로 깨졌다.
const REDIRECT_URI = `${process.env.APP_URL || "http://localhost:3000"}/auth/google-drive/callback`;

export async function getGoogleAuthUrl(userId: string) {
  const scopes = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/userinfo.email"];

  // CSRF 방어: 서버에서 nonce 생성 및 저장. 콜백에서만 검증 가능.
  const nonce = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabaseAdmin.from("oauth_states").insert({
    nonce,
    user_id: userId,
    provider: "google_drive",
  });
  if (error) throw new Error(`Failed to persist OAuth state: ${error.message}`);

  const state = encodeURIComponent(JSON.stringify({ nonce }));

  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${REDIRECT_URI}&` +
    `response_type=code&` +
    `scope=${scopes.join(" ")}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${state}`;
}

/**
 * Nonce를 검증하고 1회성으로 소비(삭제)한 뒤, 연결된 user_id를 반환합니다.
 * 만료(15분) 또는 미존재 시 null 반환.
 */
export async function consumeOAuthState(nonce: string, provider = "google_drive"): Promise<string | null> {
  if (!nonce) return null;
  const { data, error } = await supabaseAdmin
    .from("oauth_states")
    .select("user_id, expires_at")
    .eq("nonce", nonce)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;

  // 1회성: 즉시 삭제
  await supabaseAdmin.from("oauth_states").delete().eq("nonce", nonce);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id as string;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to exchange code: ${JSON.stringify(error)}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh token");
  }

  return res.json();
}

export async function getValidAccessToken(userId: string) {
  const { data: tokenData, error } = await supabaseAdmin
    .from("user_drive_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokenData) return null;

  const now = new Date();
  const expiresAt = new Date(tokenData.expires_at);

  // Buffer of 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    // refresh_token이 비어 있으면(최초 동의 외 재동의 등으로 미발급) 갱신 불가 → 재연결 유도.
    if (!tokenData.refresh_token) return null;

    const newTokens = await refreshAccessToken(tokenData.refresh_token);
    const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

    await supabaseAdmin
      .from("user_drive_tokens")
      .update({
        access_token: newTokens.access_token,
        // Google이 refresh_token을 회전(rotate)해 새로 내려주면 함께 갱신, 아니면 기존 유지.
        ...(newTokens.refresh_token ? { refresh_token: newTokens.refresh_token } : {}),
        expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return newTokens.access_token;
  }

  return tokenData.access_token;
}

export async function getDriveEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email;
}
