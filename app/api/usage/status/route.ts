import { NextResponse } from "next/server";
import { getUsageStatus } from "@/lib/usage/server";

export async function GET() {
  const status = await getUsageStatus();
  return NextResponse.json(status);
}
