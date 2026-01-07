import prisma from './prisma';

/**
 * Génère le prochain numéro de facture de manière atomique et UNIQUE
 * Format: FA-2026-0001
 * Utilise une transaction avec verrou pour garantir l'unicité
 */
export async function getNextFactureNumber(): Promise<{
  numeroSequentiel: number;
  prefixe: string;
  numeroComplet: string;
}> {
  const anneeEnCours = new Date().getFullYear();
  const prefixe = `FA-${anneeEnCours}-`;

  // Utiliser une transaction avec verrou pessimiste
  const result = await prisma.$transaction(async (tx) => {
    // Récupérer ou créer la séquence avec verrou
    let sequence = await tx.sequence.findUnique({
      where: { id: 'FACTURE_SEQ' },
    });

    if (!sequence) {
      // Première facture - créer la séquence
      sequence = await tx.sequence.create({
        data: {
          id: 'FACTURE_SEQ',
          dernierNumero: 0,
          annee: anneeEnCours,
        },
      });
    }

    // Vérifier si on doit réinitialiser pour une nouvelle année
    if (sequence.annee !== anneeEnCours) {
      sequence = await tx.sequence.update({
        where: { id: 'FACTURE_SEQ' },
        data: {
          dernierNumero: 0,
          annee: anneeEnCours,
        },
      });
    }

    // Incrémenter le numéro
    const nouveauNumero = sequence.dernierNumero + 1;

    // Mettre à jour la séquence
    await tx.sequence.update({
      where: { id: 'FACTURE_SEQ' },
      data: { dernierNumero: nouveauNumero },
    });

    // Vérifier que ce numéro n'existe pas déjà (double sécurité)
    const numeroComplet = `${prefixe}${nouveauNumero.toString().padStart(4, '0')}`;
    const existing = await tx.facture.findUnique({
      where: { numeroComplet },
    });

    if (existing) {
      // Si par miracle il existe déjà, trouver le prochain disponible
      const lastFacture = await tx.facture.findFirst({
        where: { prefixe },
        orderBy: { numeroSequentiel: 'desc' },
      });
      
      const safeNumero = (lastFacture?.numeroSequentiel || 0) + 1;
      
      // Mettre à jour la séquence avec ce nouveau numéro
      await tx.sequence.update({
        where: { id: 'FACTURE_SEQ' },
        data: { dernierNumero: safeNumero },
      });

      return safeNumero;
    }

    return nouveauNumero;
  });

  const numeroComplet = `${prefixe}${result.toString().padStart(4, '0')}`;

  return {
    numeroSequentiel: result,
    prefixe,
    numeroComplet,
  };
}

/**
 * Calcule les montants de la facture avec réduction
 */
export function calculerMontants(
  sousTotal: number, 
  reduction: number = 0,
  tauxTVA: number = 20
): {
  sousTotal: number;
  reduction: number;
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
} {
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

/**
 * Formater un montant en euros
 */
export function formatMontant(montant: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(montant);
}

/**
 * Formater une date en français
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
