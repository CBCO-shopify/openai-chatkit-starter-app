const SUPABASE_URL = "https://ekdsmtoyyoajncfymryo.supabase.co";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export class UploadError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

export async function uploadChatImage(params: {
  userId: string;
  sessionId: string;
  file: File;
}): Promise<{ url: string; path: string; bucket: string }> {
  const { userId, sessionId, file } = params;

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError(
      "Only JPEG, PNG, WebP, and GIF images are allowed.",
      "invalid_type"
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError("Image must be under 5MB.", "too_large");
  }

  // Step 1: Get signed upload URL from backend (via Vercel rewrite)
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      sessionId,
      fileName: file.name,
      mimeType: file.type,
    }),
  });

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new UploadError(
      err.error || "Failed to create upload URL",
      "sign_failed"
    );
  }

  const { bucket, path, signedUrl } = await signRes.json();

  // Step 2: Upload directly to Supabase via the signed URL
  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new UploadError(
      "Failed to upload image to storage",
      "upload_failed"
    );
  }

  // Step 3: Construct public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

  return { url: publicUrl, path, bucket };
}
