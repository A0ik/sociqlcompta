import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { clients } = await req.json();

    if (!Array.isArray(clients)) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const c of clients) {
      if (!c.numDossier || !c.raisonSociale) {
        errors++;
        continue;
      }

      try {
        const numDossier = String(c.numDossier).trim();
        
        const existing = await prisma.client.findUnique({
          where: { userId_numDossier: { userId, numDossier } },
        });

        if (existing) {
          await prisma.client.update({
            where: { id: existing.id },
            data: {
              raisonSociale: c.raisonSociale,
              adresse: c.adresse || null,
              siret: c.siret || null,
              siren: c.siren || null,
              email: c.email || null,
              telephone: c.telephone || null,
            },
          });
          updated++;
        } else {
          await prisma.client.create({
            data: {
              userId,
              numDossier,
              raisonSociale: c.raisonSociale,
              adresse: c.adresse || null,
              siret: c.siret || null,
              siren: c.siren || null,
              email: c.email || null,
              telephone: c.telephone || null,
            },
          });
          created++;
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ success: true, created, updated, errors });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
