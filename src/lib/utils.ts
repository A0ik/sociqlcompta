import prisma from './prisma';

export async function getNextDocumentNumber(type: 'FACTURE' | 'AVOIR' | 'DEVIS'): Promise<{
  numeroSequentiel: number;
  prefixe: string;
  numeroComplet: string;
}> {
  const annee = new Date().getFullYear();
  const prefixes: Record<string, string> = {
    'FACTURE': `FA-${annee}-`,
    'DEVIS': `DV-${annee}-`,
    'AVOIR': `AV-${annee}-`,
  };
  const prefixe = prefixes[type] || `XX-${annee}-`;
  const seqId = `${type}_SEQ_${annee}`;

  const result = await prisma.$transaction(async (tx) => {
    let seq = await tx.sequence.findUnique({ where: { id: seqId } });

    if (!seq || seq.annee !== annee) {
      seq = await tx.sequence.upsert({
        where: { id: seqId },
        update: { dernierNumero: 0, annee },
        create: { id: seqId, dernierNumero: 0, annee },
      });
    }

    const nouveauNumero = seq.dernierNumero + 1;
    await tx.sequence.update({
      where: { id: seqId },
      data: { dernierNumero: nouveauNumero },
    });

    return nouveauNumero;
  });

  return {
    numeroSequentiel: result,
    prefixe,
    numeroComplet: `${prefixe}${result.toString().padStart(4, '0')}`,
  };
}

export function calculerMontants(sousTotal: number, reduction: number = 0, tauxTVA: number = 20) {
  const montantHT = Math.max(0, sousTotal - reduction);
  const montantTVA = Math.round(montantHT * (tauxTVA / 100) * 100) / 100;
  const montantTTC = Math.round((montantHT + montantTVA) * 100) / 100;

  return {
    sousTotal: Math.round(sousTotal * 100) / 100,
    reduction: Math.round(reduction * 100) / 100,
    montantHT: Math.round(montantHT * 100) / 100,
    tauxTVA,
    montantTVA,
    montantTTC,
  };
}

export function formatMontant(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));
}

export function genererNumDossier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = '0123456789';
  let code = '';
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) code += nums[Math.floor(Math.random() * nums.length)];
  return code;
}
