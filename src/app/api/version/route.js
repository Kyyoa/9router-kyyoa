import { getUpdateInfo } from "@/lib/updateCheck";
import pkg from "../../../../package.json" with { type: "json" };

export const dynamic = "force-dynamic";

// GET /api/version - what the sidebar shows: the running version plus how far
// this install sits behind the repository. A failed lookup answers quietly with
// no update instead of an error, so the dashboard never blocks on GitHub.
export async function GET() {
  try {
    const info = await getUpdateInfo(pkg.version);
    // The copied command must work when pasted into ANY terminal — newbies open
    // a shell at ~ (or C:\Users\...) and stall on "not a git repository".
    // process.cwd() is the install dir, so prefix cd and it just works.
    const baseCmd = info.installCmd || "";
    const installDir = process.cwd();
    const scriptCmd = process.platform === "win32" ? "scripts\\self-update.bat" : baseCmd;
    const installCmd = scriptCmd.startsWith("cd ") ? scriptCmd : `cd "${installDir}" && ${scriptCmd}`;
    // Tell the user HOW to start again: same port the server runs on now.
    const port = process.env.PORT || "20130";
    return Response.json({
      currentVersion: info.currentVersion,
      currentRevision: info.currentRevision || null,
      latestVersion: info.latestVersion || info.currentVersion,
      commitMessage: info.commitMessage || "",
      publishedAt: info.publishedAt || "",
      releaseNotes: info.releaseNotes || "",
      releaseUrl: info.releaseUrl || "",
      behindBy: Number.isFinite(info.behindBy) ? info.behindBy : null,
      hasUpdate: info.hasUpdate === true,
      revisionKnown: info.revisionKnown !== false,
      lookupFailed: info.lookupFailed === true,
      installCmd,
      installDir,
      startHint: `PORT=${port} node custom-server.js --port ${port}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.log("Error checking version:", error);
    return Response.json({ currentVersion: pkg.version, hasUpdate: false }, { status: 200 });
  }
}
