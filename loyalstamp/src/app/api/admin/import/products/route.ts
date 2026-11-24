import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readCsvUpload } from "@/lib/upload";
import { importProducts } from "@/services/importService";

export async function POST(req: Request) {
  const auth = await requireAdmin(); // always re-check here, never rely on middleware alone
  if (!auth.ok) return auth.response;

  const upload = await readCsvUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await importProducts(upload.text, {
      actorId: auth.user.id,
      fileName: upload.fileName,
      dryRun: upload.dryRun,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (e) {
    console.error("Product import failed", e);
    return NextResponse.json(
      { error: "Import failed. Check that CODE_HMAC_SECRET is set on the server, then try again." },
      { status: 500 },
    );
  }
}
