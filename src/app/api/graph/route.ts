import { NextRequest, NextResponse } from "next/server";
import { buildVendorGraph } from "@/lib/graph";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const mpId = searchParams.get("mp_id") || undefined;

    const graph = await buildVendorGraph(mpId);

    return NextResponse.json(graph, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Graph API error:", error);

    return NextResponse.json(
      {
        error: "Failed to build vendor graph",
      },
      {
        status: 500,
      }
    );
  }
}