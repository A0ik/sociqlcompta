import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const where: any = { userId };
    if (search) {
      where.OR = [
        { numDossier: { contains: search, mode: "insensitive" } },
        { raisonSociale: { contains: search, mode: "insensitive" } },
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { raisonSociale: "asc" },
      take: 200,
    });

    return NextResponse.json({ clients });
  } catch (error) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const data = await req.json();

    if (!data.numDossier || !data.raisonSociale) {
      return NextResponse.json(
        { error: "Numéro et raison sociale requis" },
        { status: 400 }
      );
    }

    const exists = await prisma.client.findUnique({
      where: { userId_numDossier: { userId, numDossier: data.numDossier } },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Ce numéro de dossier existe déjà" },
        { status: 400 }
      );
    }

    const client = await prisma.client.create({
      data: {
        userId,
        numDossier: data.numDossier,
        raisonSociale: data.raisonSociale,
        adresse: data.adresse || null,
        siret: data.siret || null,
        siren: data.siren || null,
        email: data.email || null,
        telephone: data.telephone || null,
      },
    });

    return NextResponse.json({ success: true, client });
  } catch (error) {
    console.error("Client error:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
