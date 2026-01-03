import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { genererNumDossier } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { url, numDossier } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL requise" }, { status: 400 });
    }

    // Fetch la page
    let pageText = "";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) throw new Error("Fetch failed");
      const html = await res.text();
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .substring(0, 10000);
    } catch {
      return NextResponse.json(
        { error: "Impossible d'accéder à l'URL" },
        { status: 400 }
      );
    }

    // Extraire avec IA
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY non configurée" },
        { status: 500 }
      );
    }

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Extrais les infos entreprise. JSON uniquement:
{"raisonSociale":"","siret":"","siren":"","adresse":""}

Texte: ${pageText}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      return NextResponse.json({ error: "Erreur IA" }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      return NextResponse.json({ error: "Extraction échouée" }, { status: 400 });
    }

    let extracted: any;
    try {
      extracted = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }

    // Numéro de dossier
    const finalNum = numDossier?.trim() || extracted.siret || genererNumDossier();

    // Vérifier doublon
    const exists = await prisma.client.findUnique({
      where: { userId_numDossier: { userId, numDossier: finalNum } },
    });

    if (exists) {
      return NextResponse.json(
        { error: `Dossier ${finalNum} existe déjà`, suggestion: genererNumDossier() },
        { status: 400 }
      );
    }

    // Créer
    const client = await prisma.client.create({
      data: {
        userId,
        numDossier: finalNum,
        raisonSociale: extracted.raisonSociale || "Entreprise",
        adresse: extracted.adresse || null,
        siret: extracted.siret || null,
        siren: extracted.siren || null,
      },
    });

    return NextResponse.json({ success: true, client, extracted });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
