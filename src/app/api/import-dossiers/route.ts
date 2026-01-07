import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Mapping des noms de colonnes possibles
const COLUMN_MAPPINGS = {
  numDossier: ['numéro', 'numero', 'num', 'n°', 'n° dossier', 'numdossier', 'num_dossier', 'dossier', 'code', 'ref', 'reference', 'référence'],
  raisonSociale: ['raison sociale', 'raisonsociale', 'raison_sociale', 'nom', 'entreprise', 'société', 'societe', 'client', 'denomination', 'dénomination'],
  adresse: ['adresse', 'address', 'adr', 'adresse complete', 'adresse complète', 'lieu', 'localisation'],
  siret: ['siret', 'n° siret', 'numero siret', 'numéro siret', 'siren', 'n° siren'],
  codeNaf: ['codenaf', 'code naf', 'code_naf', 'naf', 'ape', 'code ape'],
  telephone: ['telephone', 'téléphone', 'tel', 'tél', 'phone', 'mobile', 'portable'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'emailcontact', 'email contact'],
};

function findColumnValue(row: Record<string, unknown>, fieldName: keyof typeof COLUMN_MAPPINGS): string | null {
  const possibleNames = COLUMN_MAPPINGS[fieldName];
  
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase().trim();
    if (possibleNames.includes(normalizedKey)) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') {
        return String(value).trim();
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clients } = body;

    if (!clients || !Array.isArray(clients)) {
      return NextResponse.json({ error: 'Liste de clients requise' }, { status: 400 });
    }

    let created = 0, updated = 0, skipped = 0;

    for (const row of clients) {
      const numDossier = findColumnValue(row, 'numDossier');
      const raisonSociale = findColumnValue(row, 'raisonSociale');

      if (!numDossier || !raisonSociale) {
        skipped++;
        continue;
      }

      const existing = await prisma.client.findUnique({ where: { numDossier } });

      await prisma.client.upsert({
        where: { numDossier },
        update: {
          raisonSociale,
          adresse: findColumnValue(row, 'adresse'),
          siret: findColumnValue(row, 'siret'),
          codeNaf: findColumnValue(row, 'codeNaf'),
          telephone: findColumnValue(row, 'telephone'),
          emailContact: findColumnValue(row, 'email'),
        },
        create: {
          numDossier,
          raisonSociale,
          adresse: findColumnValue(row, 'adresse'),
          siret: findColumnValue(row, 'siret'),
          codeNaf: findColumnValue(row, 'codeNaf'),
          telephone: findColumnValue(row, 'telephone'),
          emailContact: findColumnValue(row, 'email'),
        },
      });

      if (existing) updated++;
      else created++;
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      total: await prisma.client.count(),
    });
  } catch (e) {
    console.error('Import error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
