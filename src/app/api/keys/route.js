import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getSessionContext, clampPermissions } from "@/lib/auth/dashboardPermissions";
import { parseAllowedModels, matchesAllowedModels } from "@/lib/db/repos/apiKeysRepo";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET() {
  try {
    const ctx = await getSessionContext();
    const allKeys = await getApiKeys();
    // An API key session only ever manages its own key, so hide the rest.
    const keys = ctx.session?.role === "apikey"
      ? allKeys.filter((k) => k.key === ctx.session.apiKey)
      : allKeys;
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const ctx = await getSessionContext();

    // API key user must have manageApiKeys to create sub-keys
    if (ctx.session?.role === "apikey" && !ctx.permissions.manageApiKeys) {
      return NextResponse.json({ error: "Permission denied: manageApiKeys" }, { status: 403 });
    }

    const body = await request.json();
    let {
      name, tokenLimit, resetInterval, allowedModels,
      rpmLimit, tpmLimit, ipWhitelist, expiresAt, systemPrompt,
      permissions: requestedPermissions,
    } = body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Enforce unique key names
    const existingKeys = await getApiKeys();
    if (existingKeys.some((k) => k.name === trimmedName)) {
      return NextResponse.json({ error: `A key named "${trimmedName}" already exists. Use a different name.` }, { status: 409 });
    }

    // Scoping: API key user cannot grant permissions beyond what they own
    let finalPermissions = requestedPermissions;
    if (ctx.session?.role === "apikey") {
      finalPermissions = clampPermissions(ctx.permissions, requestedPermissions || {});

      // Token limit: sub-key cannot exceed creator's limit
      const creatorLimit = ctx.session.tokenLimit || 0;
      const requestedLimit = Number(tokenLimit) || 0;
      if (creatorLimit > 0 && requestedLimit > creatorLimit) {
        return NextResponse.json({
          error: `Token limit cannot exceed your maximum (${creatorLimit}).`,
          creatorMax: creatorLimit,
        }, { status: 400 });
      }

      // Allowed models: sub-key can only use a subset of creator's models
      const creatorPatterns = parseAllowedModels(ctx.session.allowedModels);
      if (creatorPatterns) {
        const requestedList = (allowedModels || "*").split(",").map(m => m.trim().toLowerCase()).filter(Boolean);
        if (requestedList[0] !== "*") {
          const filtered = requestedList.filter(m => matchesAllowedModels(creatorPatterns, m));
          allowedModels = filtered.length ? filtered.join(",") : creatorPatterns.join(",");
        } else {
          // Wildcard or empty request is clamped to the creator's own scope.
          allowedModels = creatorPatterns.join(",");
        }
        // If creator is wildcard ("*"), sub-key can use "*"
      }
    }

    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(trimmedName, machineId, {
      tokenLimit: tokenLimit !== undefined ? Number(tokenLimit) : 0,
      resetInterval: resetInterval || "never",
      allowedModels: allowedModels || "*",
      rpmLimit: rpmLimit !== undefined ? Number(rpmLimit) : 0,
      tpmLimit: tpmLimit !== undefined ? Number(tpmLimit) : 0,
      ipWhitelist: ipWhitelist || "",
      expiresAt: expiresAt || null,
      systemPrompt: systemPrompt || "",
      permissions: finalPermissions,
    });

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      isActive: apiKey.isActive,
      tokenLimit: apiKey.tokenLimit,
      usedTokens: apiKey.usedTokens,
      resetInterval: apiKey.resetInterval,
      lastResetAt: apiKey.lastResetAt,
      allowedModels: apiKey.allowedModels,
      rpmLimit: apiKey.rpmLimit,
      tpmLimit: apiKey.tpmLimit,
      ipWhitelist: apiKey.ipWhitelist,
      permissions: apiKey.permissions,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
