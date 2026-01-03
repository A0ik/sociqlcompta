export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatMontant(n: number): string {
  return new Intl.NumberFormat("fr-FR", { 
    style: "currency", 
    currency: "EUR" 
  }).format(n);
}

export function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", { 
    day: "2-digit", 
    month: "long", 
    year: "numeric" 
  }).format(new Date(d));
}

export function genererNumDossier(): string {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const N = "0123456789";
  let r = "";
  for (let i = 0; i < 2; i++) r += L[Math.floor(Math.random() * L.length)];
  for (let i = 0; i < 4; i++) r += N[Math.floor(Math.random() * N.length)];
  return r;
}

export function calculerMontants(sousTotal: number, reduction = 0, tauxTVA = 20) {
  const montantHT = Math.max(0, sousTotal - reduction);
  const montantTVA = montantHT * tauxTVA / 100;
  const montantTTC = montantHT + montantTVA;
  return {
    sousTotal: Math.round(sousTotal * 100) / 100,
    reduction: Math.round(reduction * 100) / 100,
    montantHT: Math.round(montantHT * 100) / 100,
    tauxTVA,
    montantTVA: Math.round(montantTVA * 100) / 100,
    montantTTC: Math.round(montantTTC * 100) / 100,
  };
}
