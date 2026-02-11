import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const startedAt = Date.now();

export async function GET() {
  const checks: Record<string, string> = {};

  // Check Supabase connection
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from("clients").select("id").limit(1);
    checks.supabase = error ? `error: ${error.message}` : "ok";
  } catch (e) {
    checks.supabase = `unreachable: ${(e as Error).message}`;
  }

  const healthy = checks.supabase === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
