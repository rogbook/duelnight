import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.APP_URL || "http://localhost:3000"}/api/drive/callback`;

export async function getGoogleAuthUrl(userId: string) {
  const scopes = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/userinfo.email"];
  const state = encodeURIComponent(JSON.stringify({ userId }));
  
  return `https://accounts.google.com/o/oauth2/v2/auth?` + 
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${REDIRECT_URI}&` +
    `response_type=code&` +
    `scope=${scopes.join(" ")}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${state}`;
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
    const newTokens = await refreshAccessToken(tokenData.refresh_token);
    const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
    
    await supabaseAdmin
      .from("user_drive_tokens")
      .update({
        access_token: newTokens.access_token,
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
