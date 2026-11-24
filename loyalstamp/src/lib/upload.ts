import { NextResponse } from "next/server";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

export type CsvUpload =
  | { ok: true; text: string; fileName: string; dryRun: boolean }
  | { ok: false; response: NextResponse };

const reject = (error: string, status: number): { ok: false; response: NextResponse } => ({
  ok: false,
  response: NextResponse.json({ error }, { status }),
});

/** Reads a CSV from multipart form data (fields: file, dryRun). Call only after the admin check. */
export async function readCsvUpload(req: Request): Promise<CsvUpload> {
  const form = await req.formData().catch(() => null);
  if (!form) return reject("Send the file as multipart form data", 400);

  const file = form.get("file");
  if (!(file instanceof File)) return reject("Choose a CSV file to upload", 400);
  if (!file.name.toLowerCase().endsWith(".csv")) return reject("The file must be a .csv file", 400);
  if (file.size > MAX_UPLOAD_BYTES) return reject("The file is larger than 2 MB. Split it into smaller files", 413);

  return { ok: true, text: await file.text(), fileName: file.name.slice(0, 120), dryRun: form.get("dryRun") === "true" };
}
