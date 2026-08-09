const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);
export const MAX_BYTES = 10 * 1024 * 1024;

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "png", "jpg", "jpeg"].includes(ext || "")) {
    return "Gunakan PDF, PNG, JPG, atau JPEG.";
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return "Tipe MIME file tidak didukung.";
  }
  if (file.size === 0) return "File kosong.";
  if (file.size > MAX_BYTES) return "Ukuran file melebihi 10 MB.";
  return null;
}
