import { NextResponse } from "next/server";
import {
  deleteProxyPools,
  updateProxyPools,
  getProviderConnections,
  getProxyPools,
} from "@/models";

// Mirrors the per-id route: a pool that a connection still points at must not
// disappear, or that connection silently loses its egress path.
function countBoundConnections(connections = [], ids = []) {
  const wanted = new Set(ids);
  return connections.filter((connection) =>
    wanted.has(connection?.providerSpecificData?.proxyPoolId)
  ).length;
}

/**
 * POST /api/proxy-pools/bulk
 *
 *   { ids: [...] }            delete exactly these pools
 *   { all: true }             delete every pool the server knows about
 *
 * Both paths resolve the id list on the server, so "delete all" does not
 * depend on the browser having paged through the whole list first.
 *
 * One statement, one transaction, one auth check. The page previously issued a
 * DELETE per id in a loop, which is hundreds of round trips for a few hundred
 * pools and cannot be cancelled halfway without leaving a partial delete.
 */
export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));

    let ids = [];
    if (body?.all === true) {
      ids = (await getProxyPools()).map((pool) => pool.id);
    } else if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((id) => typeof id === "string" && id);
    }

    ids = [...new Set(ids)];
    if (ids.length === 0) {
      return NextResponse.json({ deleted: [], blocked: [], missing: [] });
    }

    const connections = await getProviderConnections();
    const boundCount = countBoundConnections(connections, ids);
    if (boundCount > 0) {
      return NextResponse.json(
        { error: "Some proxy pools are currently in use", boundConnectionCount: boundCount },
        { status: 409 }
      );
    }

    const removed = await deleteProxyPools(ids);
    const removedIds = new Set(removed.map((pool) => pool.id));
    const missing = ids.filter((id) => !removedIds.has(id));

    return NextResponse.json({
      deleted: [...removedIds],
      deletedCount: removed.length,
      missing,
    });
  } catch (error) {
    console.log("Error bulk deleting proxy pools:", error);
    return NextResponse.json({ error: "Failed to delete proxy pools" }, { status: 500 });
  }
}

/**
 * PATCH /api/proxy-pools/bulk
 * Fast bulk update for proxy pool statuses (e.g. { ids: [...], isActive: true/false })
 */
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === "string" && id) : [];
    ids = [...new Set(ids)];
    if (ids.length === 0) {
      return NextResponse.json({ updated: [], count: 0 });
    }

    const updateData = {};
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const updated = await updateProxyPools(ids, updateData);
    return NextResponse.json({
      updated: updated.map((p) => p.id),
      count: updated.length,
    });
  } catch (error) {
    console.log("Error bulk updating proxy pools:", error);
    return NextResponse.json({ error: "Failed to update proxy pools" }, { status: 500 });
  }
}
