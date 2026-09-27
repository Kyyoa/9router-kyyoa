import { NextResponse } from "next/server";
import { getFavoriteModels, addFavoriteModel, removeFavoriteModel } from "@/lib/db/index.js";

export const dynamic = "force-dynamic";

// GET /api/models/favorites — pinned model shortcuts, most-recent first
export async function GET() {
  try {
    const favorites = await getFavoriteModels();
    return NextResponse.json({ favorites });
  } catch (error) {
    console.log("Error fetching favorites:", error);
    return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
  }
}

// POST /api/models/favorites  body: { value: "alias/model-id" }
export async function POST(request) {
  try {
    const { value } = await request.json();
    if (!value || typeof value !== "string") {
      return NextResponse.json({ error: "value required" }, { status: 400 });
    }
    const favorites = await addFavoriteModel(value);
    return NextResponse.json({ success: true, favorites });
  } catch (error) {
    console.log("Error adding favorite:", error);
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
  }
}

// DELETE /api/models/favorites?value=alias/model-id
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get("value");
    if (!value) {
      return NextResponse.json({ error: "value required" }, { status: 400 });
    }
    const favorites = await removeFavoriteModel(value);
    return NextResponse.json({ success: true, favorites });
  } catch (error) {
    console.log("Error removing favorite:", error);
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}
