import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const company = await prisma.company.findUnique({ where: { userId } });

    return NextResponse.json({ company });
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

    const company = await prisma.company.upsert({
      where: { userId },
      update: {
        nom: data.nom,
        adresse: data.adresse || null,
        siret: data.siret || null,
        email: data.email || null,
        telephone: data.telephone || null,
        stripeSecretKey: data.stripeSecretKey || null,
      },
      create: {
        userId,
        nom: data.nom,
        adresse: data.adresse || null,
        siret: data.siret || null,
        email: data.email || null,
        telephone: data.telephone || null,
        stripeSecretKey: data.stripeSecretKey || null,
      },
    });

    return NextResponse.json({ success: true, company });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
