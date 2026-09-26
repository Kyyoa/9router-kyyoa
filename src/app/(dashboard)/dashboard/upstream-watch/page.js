import UpstreamWatchClient from "./UpstreamWatchClient";

// Force dynamic so Next.js standalone build includes the server-side JS file
export const dynamic = "force-dynamic";

export default function UpstreamWatchPage() {
  return <UpstreamWatchClient />;
}
