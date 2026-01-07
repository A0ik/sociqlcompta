import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clients } = body;

    if (!clients || !Array.isArray(clients)) {
      return NextResponse.json({ error: 'Liste de clients requise' }, { status: 400 });
    }

    let created = 0, updated = 0;

    for (const c of clients) {
      if (!c.numDossier || !c.raisonSociale) continue;

      await prisma.client.upsert({
        where: { numDossier: String(c.numDossier).trim() },
        update: {
          raisonSociale: c.raisonSociale,
          adresse: c.adresse || null,
          siret: c.siret || null,
          codeNaf: c.codeNaf || null,
        },
        create: {
          numDossier: String(c.numDossier).trim(),
          raisonSociale: c.raisonSociale,
          adresse: c.adresse || null,
          siret: c.siret || null,
          codeNaf: c.codeNaf || null,
        },
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      count: created,
      total: await prisma.client.count(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
