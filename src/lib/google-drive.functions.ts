import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDriveAuthUrlFn = createServerFn({ method: "GET" })
  .validator(z.any())
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getGoogleAuthUrl } = await import("./google-drive.server");
    const url = await getGoogleAuthUrl(context.userId);
    return { url };
  });

export const getDriveConnectionFn = createServerFn({ method: "GET" })
  .validator(z.any())
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("connected_email, updated_at")
      .eq("user_id", context.userId)
      .single();

    if (error || !data) return { connected: false };
    return { connected: true, email: data.connected_email, updatedAt: data.updated_at };
  });

export const listDriveFolderFn = createServerFn({ method: "POST" })
  .validator(z.object({ folderUrl: z.string() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { getValidAccessToken } = await import("./google-drive.server");
    const token = await getValidAccessToken(context.userId);
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

    const fid = folderId(data.folderUrl);
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
  .validator(z.any())
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokenData } = await supabaseAdmin
      .from("user_drive_tokens")
      .select("access_token")
      .eq("user_id", context.userId)
      .single();

    if (tokenData) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, { method: "POST" });
    }

    await supabaseAdmin
      .from("user_drive_tokens")
      .delete()
      .eq("user_id", context.userId);

    return { success: true };
  });

export const importDriveFilesFn = createServerFn({ method: "POST" })
  .validator(z.object({ fileIds: z.array(z.string()) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { getValidAccessToken } = await import("./google-drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = await getValidAccessToken(context.userId);
    if (!token) throw new Error("Google Drive not connected");

    const results = [];
    for (const fileId of data.fileIds) {
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

        const fileName = `${context.userId}/${Date.now()}-${meta.name}`;
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
