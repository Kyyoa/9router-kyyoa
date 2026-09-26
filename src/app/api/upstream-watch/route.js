import { getUpstreamWatch } from "@/lib/updateCheck";

export const dynamic = "force-dynamic";

// GET /api/upstream-watch — read-only compare of fork HEAD vs watched upstreams.
// Fail-open: a blocked network answers lookupFailed instead of an error,
// so the dashboard never blocks on GitHub.
export async function GET() {
  try {
    const info = await getUpstreamWatch();
    return Response.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.log("Error checking upstream watch:", error);
    return Response.json({ lookupFailed: true, remotes: [] }, { status: 200 });
  }
}
