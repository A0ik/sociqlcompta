import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';

  const clients = await prisma.client.findMany({
    where: search ? {
      OR: [
        { numDossier: { contains: search, mode: 'insensitive' } },
        { raisonSociale: { contains: search, mode: 'insensitive' } },
      ],
    } : undefined,
    orderBy: { raisonSociale: 'asc' },
    take: 50,
  });

  return NextResponse.json({ clients, total: await prisma.client.count() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Créer un nouveau client manuellement
  if (body.action === 'create') {
    const { numDossier, raisonSociale, adresse, siret } = body;

    if (!numDossier || !raisonSociale) {
      return NextResponse.json({ error: 'Numéro et raison sociale requis' }, { status: 400 });
    }

    const existing = await prisma.client.findUnique({ where: { numDossier } });
    if (existing) {
      return NextResponse.json({ error: 'Ce numéro existe déjà' }, { status: 409 });
    }

    const client = await prisma.client.create({
      data: { numDossier, raisonSociale, adresse, siret },
    });

    return NextResponse.json({ success: true, client });
  }

  // Récupérer un client par numDossier
  const { numDossier } = body;
  if (!numDossier) {
    return NextResponse.json({ error: 'numDossier requis' }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { numDossier: numDossier.toUpperCase() },
    include: { documents: { orderBy: { createdAt: 'desc' }, take: 10, include: { lignes: true } } },
  });

  if (!client) {
    return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
  }

  return NextResponse.json({ client });
}
