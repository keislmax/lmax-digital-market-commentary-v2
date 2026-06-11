// app/api/theblock/route.ts
// Serves the consolidated The Block payload. Also used for debugging.

import { NextResponse } from "next/server";
import { buildTheBlockData } from "@/lib/theblock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await buildTheBlockData();
  return NextResponse.json(data);
}
