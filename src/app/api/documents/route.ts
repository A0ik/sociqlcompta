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
    const type = searchParams.get("type");

    const where: any = { userId };
    if (type) where.type = type;

    const documents = await prisma.document.findMany({
      where,
      include: { client: true, lignes: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
