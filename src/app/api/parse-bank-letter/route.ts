import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePDF, parseBankLetter } from "@/lib/pdfParser";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.includes("pdf")) {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("Parsing bank letter PDF:", file.name, "Size:", buffer.length);

    // Parse PDF to extract text
    const pdfResult = await parsePDF(buffer);
    
    console.log("PDF parsed, pages:", pdfResult.pages, "text length:", pdfResult.text.length);

    // Parse the bank letter data from extracted text
    const parsedData = parseBankLetter(pdfResult.text);

    console.log("Bank letter parsed:", parsedData);

    return NextResponse.json({
      success: true,
      rawText: pdfResult.text,
      pages: pdfResult.pages,
      parsed: parsedData,
    });
  } catch (error) {
    console.error("Error parsing bank letter PDF:", error);
    return NextResponse.json(
      { 
        error: "Failed to parse PDF",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
