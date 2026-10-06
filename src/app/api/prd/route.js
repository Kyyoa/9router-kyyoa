import { NextResponse } from "next/server";
import { getPrdDocs, getPrdDoc, savePrdDoc, deletePrdDoc } from "@/lib/db/repos/prdRepo.js";

export const dynamic = "force-dynamic";

// GET /api/prd — list saved docs; ?id=<id> returns one doc with its markdown
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (id) {
      const doc = await getPrdDoc(id);
      if (!doc) return NextResponse.json({ error: "PRD not found" }, { status: 404 });
      return NextResponse.json({ doc });
    }
    const docs = await getPrdDocs();
    return NextResponse.json({ docs });
  } catch (error) {
    console.error("Error fetching PRDs:", error);
    return NextResponse.json({ error: "Failed to fetch PRDs" }, { status: 500 });
  }
}

// POST /api/prd — save { id?, title, brief, markdown, model, template, depth, language, sections, tokensIn, tokensOut }
export async function POST(request) {
  try {
    const body = await request.json();
    const markdown = String(body.markdown || "").trim();
    const id = String(body.id || "").trim();

    if (!markdown && !id) {
      return NextResponse.json({ error: "Nothing to save — generate a PRD first." }, { status: 400 });
    }
    if (id && !markdown) {
      const existing = await getPrdDoc(id);
      if (!existing) return NextResponse.json({ error: "PRD not found" }, { status: 404 });
    }

    const doc = await savePrdDoc({ ...body, markdown });
    return NextResponse.json({ doc });
  } catch (error) {
    console.error("Error saving PRD:", error);
    return NextResponse.json({ error: "Failed to save PRD" }, { status: 500 });
  }
}

// DELETE /api/prd?id=<id>
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await getPrdDoc(id);
    if (!existing) return NextResponse.json({ error: "PRD not found" }, { status: 404 });

    await deletePrdDoc(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting PRD:", error);
    return NextResponse.json({ error: "Failed to delete PRD" }, { status: 500 });
  }
}
