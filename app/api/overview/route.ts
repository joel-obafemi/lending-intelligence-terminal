import { NextResponse } from "next/server"
import { loadOverview } from "@/lib/overview"

export const revalidate = 3600 // 1 hour

export async function GET() {
  const data = await loadOverview()
  return NextResponse.json(data)
}
