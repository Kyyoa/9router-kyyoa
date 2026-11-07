import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { bulkCreateProviderConnections } from "@/lib/db/repos/connectionsRepo.js";
import { resolveProviderId } from "@/shared/constants/providers";

export const dynamic = "force-dynamic";

/**
 * POST /api/providers/bulk
 * Bulk inserts provider API keys in a single atomic database transaction.
 * Body: { provider: string, keys: Array<{ name: string, apiKey: string, providerSpecificData?: object }> }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawProvider = String(body.provider || "").trim();
    const provider = resolveProviderId(rawProvider) || rawProvider;
    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    const keys = Array.isArray(body.keys) ? body.keys : [];
    if (!keys.length) {
      return NextResponse.json({ error: "No keys provided" }, { status: 400 });
    }

    const { created, failed } = await bulkCreateProviderConnections(provider, keys);

    return NextResponse.json({
      success: true,
      count: created.length,
      failed: failed.length,
      errors: failed.slice(0, 5),
    });
  } catch (error) {
    console.error("Error bulk creating provider keys:", error);
    return NextResponse.json({ error: "Failed to bulk create provider keys: " + error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/providers/bulk
 * Bulk deletes provider connections in chunks of 500 inside a single atomic database query.
 * Body: { ids: Array<string> }
 */
export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "No connection IDs provided" }, { status: 400 });
    }

    const db = await getAdapter();
    let deletedCount = 0;

    db.transaction(() => {
      // Chunk to 500 IDs per statement to stay well below SQLite host parameter limits
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const placeholders = chunk.map(() => "?").join(",");
        const res = db.run(`DELETE FROM providerConnections WHERE id IN (${placeholders})`, chunk);
        deletedCount += res?.changes ?? 0;
      }
    });

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      requested: ids.length,
    });
  } catch (error) {
    console.error("Error bulk deleting provider connections:", error);
    return NextResponse.json({ error: "Failed to bulk delete provider connections: " + error.message }, { status: 500 });
  }
}
