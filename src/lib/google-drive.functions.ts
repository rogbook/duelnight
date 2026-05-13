import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGoogleAuthUrl, getValidAccessToken } from "./google-drive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function extractFolderId(url: string): string {
  let folderId = "root";
  const folderMatch = url.match(/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch) folderId = folderMatch[1];
  else if (url.includes("id=")) {
    const idMatch = url.match(/id=([a-zA-Z0-9-_]+)/);
    if (idMatch) folderId = idMatch[1];
  }
  return folderId;
}

export const getDriveAuthUrlFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const url = await getGoogleAuthUrl(context.userId);
    return { url };
  });

export const getDriveConnectionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("connected_email, updated_at")
      .eq("user_id", context.userId)
      .single();

    if (error || !data) return { connected: false };
    return { connected: true, email: data.connected_email, updatedAt: data.updated_at };
  });

export const listDriveFolderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { folderUrl: string }) => d)
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    if (!token) throw new Error("Google Drive not connected");

    const folderId = extractFolderId(data.folderUrl);
    const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tokenData } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("access_token")
      .eq("user_id", context.userId)
      .single();

    if (tokenData) {
      // Optional: Revoke token from Google
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, { method: "POST" });
    }

    await supabaseAdmin
      .from("user_drive_tokens")
      .delete()
      .eq("user_id", context.userId);

    return { success: true };
  });

export const importDriveFilesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { fileIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    if (!token) throw new Error("Google Drive not connected");

    const results = [];
    for (const fileId of data.fileIds) {
      try {
        // 1. Get file metadata
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();

        // 2. Download file content
        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!contentRes.ok) continue;
        const buffer = await contentRes.arrayBuffer();

        // 3. Upload to Supabase Storage
        const fileName = `${context.userId}/${Date.now()}-${meta.name}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from("card-images")
          .upload(fileName, buffer, {
            contentType: meta.mimeType,
            upsert: true,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
          .from("card-images")
          .getPublicUrl(fileName);

        results.push({
          id: fileId,
          name: meta.name,
          url: publicUrl,
        });
      } catch (err) {
        console.error(`Failed to import file ${fileId}:`, err);
      }
    }

    return { results };
  });
