import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

/** 서버 사이드에서 인증된 사용자 ID를 가져오는 헬퍼 */
async function getAuthenticatedUserId() {
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
  return data.user.id;
}

export const getDriveAuthUrlFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const userId = await getAuthenticatedUserId();
    const { getGoogleAuthUrl } = await import("./google-drive.server");
    const url = await getGoogleAuthUrl(userId);
    return { url };
  });

export const getDriveConnectionFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const userId = await getAuthenticatedUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("connected_email, updated_at")
      .eq("user_id", userId)
      .single();

    if (error || !data) return { connected: false };
    return { connected: true, email: data.connected_email, updatedAt: data.updated_at };
  });

export const listDriveFolderFn = createServerFn({ method: "POST" })
  .inputValidator((d: { folderUrl: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    const { folderUrl } = data;
    const { getValidAccessToken } = await import("./google-drive.server");
    const token = await getValidAccessToken(userId);
    if (!token) throw new Error("Google Drive not connected");

    const folderId = (url: string) => {
      let id = "root";
      const folderMatch = url.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (folderMatch) id = folderMatch[1];
      else if (url.includes("id=")) {
        const idMatch = url.match(/id=([a-zA-Z0-9-_]+)/);
        if (idMatch) id = idMatch[1];
      }
      return id;
    };

    const fid = folderId(folderUrl);
    const query = `'${fid}' in parents and mimeType contains 'image/' and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink,mimeType)&pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Drive API error: ${err.error?.message || res.statusText}`);
    }

    const driveData = await res.json();
    return { files: driveData.files };
  });

export const disconnectDriveFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const userId = await getAuthenticatedUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokenData } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("access_token")
      .eq("user_id", userId)
      .single();

    if (tokenData) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, { method: "POST" });
    }

    await supabaseAdmin
      .from("user_drive_tokens")
      .delete()
      .eq("user_id", userId);

    return { success: true };
  });

const MAX_DRIVE_IMPORT_BATCH = 50;
const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export const importDriveFilesFn = createServerFn({ method: "POST" })
  .inputValidator((d: { fileIds: string[] }) => {
    if (!Array.isArray(d?.fileIds) || d.fileIds.length === 0) {
      throw new Error("fileIds is required");
    }
    if (d.fileIds.length > MAX_DRIVE_IMPORT_BATCH) {
      throw new Error(`최대 ${MAX_DRIVE_IMPORT_BATCH}개까지 한 번에 가져올 수 있습니다.`);
    }
    for (const id of d.fileIds) {
      if (typeof id !== "string" || !DRIVE_FILE_ID_RE.test(id)) {
        throw new Error("잘못된 파일 ID 형식");
      }
    }
    return d;
  })
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    const { fileIds } = data;
    const { getValidAccessToken } = await import("./google-drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = await getValidAccessToken(userId);
    if (!token) throw new Error("Google Drive not connected");

    const results = [];
    for (const fileId of fileIds) {
      try {
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();

        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!contentRes.ok) continue;
        const buffer = await contentRes.arrayBuffer();

        const fileName = `${userId}/${Date.now()}-${meta.name}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("card-images")
          .upload(fileName, buffer, {
            contentType: meta.mimeType,
            upsert: true,
          });

        if (uploadError) continue;

        const { data: { publicUrl } } = supabaseAdmin.storage
          .from("card-images")
          .getPublicUrl(fileName);

        results.push({ id: fileId, name: meta.name, url: publicUrl });
      } catch (err) {
        console.error(`Failed to import file ${fileId}:`, err);
      }
    }

    return { results };
  });
