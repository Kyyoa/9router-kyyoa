import { GET as getModels, OPTIONS } from "./models/route";
import { NextResponse } from "next/server";

export async function GET(request) {
  const accept = request.headers.get("accept") || "";
  // If opened directly by a human in a web browser (not programmatic SDK/Cline/Cursor/curl)
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    return NextResponse.redirect(new URL("/dashboard/endpoint", request.url));
  }
  return getModels(request);
}

export { OPTIONS };
