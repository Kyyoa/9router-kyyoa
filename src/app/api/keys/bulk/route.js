import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { getApiKeys, updateApiKey } from "@/lib/db/repos/apiKeysRepo.js";
import { recordSecurityEvent } from "@/lib/db/repos/securityLogRepo.js";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/keys/bulk - { ids: [...], patch: { ... } }
 *
 * Editing twenty keys one at a time is how a limit ends up half-applied, so the
 * same field is written to every selected key in one call. Only fields that make
 * sense in bulk are accepted: the key material itself, the secret value and the
 * permission map are deliberately not bulk-editable, because a bulk action that
 * can silently rewrite a permission or a secret is a bulk action nobody reads
 * twice. Anything not in the whitelist is rejected rather than ignored, so a
 * typo does not look like it worked.
 */
const BULK_FIELDS = new Set([
  "isActive",
  "tokenLimit",
  "resetInterval",
  "rpmLimit",
  "tpmLimit",
  "allowedModels",
  "ipWhitelist",
  "expiresAt",
]);

function normalizePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!BULK_FIELDS.has(key)) {
      return { error: `Field "${key}" cannot be changed in bulk` };
    }
    clean[key] = value;
  }
  if (!Object.keys(clean).length) return { error: "No editable fields given" };
  return { patch: clean };
}

export async function PATCH(request) {
  try {
    // A key session may hold manageApiKeys and still must not rewrite twenty
    // keys at once; bulk is an administrator action.
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    if (!session || session.role === "apikey") {
      return NextResponse.json({ error: "Only a password sign-in can bulk edit keys" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "No keys selected" }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: "Select at most 500 keys at once" }, { status: 400 });
    }

    const parsed = normalizePatch(body.patch);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const existing = new Set((await getApiKeys()).map((k) => k.id));
    const targets = ids.filter((id) => existing.has(id));
    const missing = ids.filter((id) => !existing.has(id));

    const updated = [];
    const failed = [];
    for (const id of targets) {
      try {
        const result = await updateApiKey(id, parsed.patch);
        if (result) updated.push(id);
        else failed.push({ id, error: "not found" });
      } catch (err) {
        failed.push({ id, error: err?.message || "update failed" });
      }
    }

    if (updated.length) {
      await recordSecurityEvent({
        type: "keys_bulk_update",
        severity: "info",
        actor: "Dashboard password user",
        method: "PATCH",
        path: "/api/keys/bulk",
        status: 200,
        detail: `${updated.length} key(s) updated in bulk: ${Object.keys(parsed.patch).join(", ")}`,
      });
    }

    return NextResponse.json({
      updated: updated.length,
      failed,
      missing,
      fields: Object.keys(parsed.patch),
    });
  } catch (error) {
    console.log("Error bulk-updating keys:", error);
    return NextResponse.json({ error: "Failed to bulk update keys" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    if (!session || session.role === "apikey") {
      return NextResponse.json({ error: "Only a password sign-in can bulk delete keys" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "No keys selected" }, { status: 400 });
    }

    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    
    // Fast path: bulk delete in single query inside transaction
    let deletedCount = 0;
    db.transaction(() => {
      const placeholders = ids.map(() => "?").join(",");
      const res = db.run(`DELETE FROM apiKeys WHERE id IN (${placeholders})`, ids);
      deletedCount = res?.changes ?? 0;
    });

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      requested: ids.length,
    });
  } catch (error) {
    console.log("Error bulk-deleting keys:", error);
    return NextResponse.json({ error: "Failed to bulk delete keys" }, { status: 500 });
  }
}
