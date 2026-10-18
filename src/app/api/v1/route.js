import { GET as getModels, OPTIONS } from "./models/route";

export async function GET(request) {
  const accept = request.headers.get("accept") || "";

  // If opened directly by a human in a web browser (accepting text/html, not programmatic JSON SDK/Cursor/Cline/curl)
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=/dashboard/endpoint">
  <title>9Router Kyyoa · API Gateway</title>
  <style>
    body {
      background-color: #0b0f17;
      color: #ededed;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #121824;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 32px;
      border-radius: 16px;
      text-align: center;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.1);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      font-size: 11px;
      font-family: monospace;
      font-weight: 600;
      border: 1px solid rgba(16, 185, 129, 0.3);
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      font-family: monospace;
    }
    p {
      color: #9ca3af;
      font-size: 13px;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #10b981;
      color: #052e16;
      font-weight: 600;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-family: monospace;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #34d399;
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● GATEWAY ONLINE (:20130)</div>
    <h2>9Router Kyyoa AI Gateway</h2>
    <p>URL ini adalah <strong>OpenAI Base URL</strong> untuk klien AI seperti Cursor, Cline, Roo Code, atau SDK.<br>Sedang mengarahkan Anda ke Dashboard...</p>
    <a href="/dashboard/endpoint" class="btn">Buka Dashboard &rarr;</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  return getModels(request);
}

export { OPTIONS };
