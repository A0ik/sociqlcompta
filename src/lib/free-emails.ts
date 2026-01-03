/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║                                                           ║
 * ║              LISTE BLANCHE - EMAILS GRATUITS              ║
 * ║                                                           ║
 * ║  Les emails listés ici ont accès GRATUIT sans payer.      ║
 * ║                                                           ║
 * ║  Pour ajouter un email :                                  ║
 * ║  1. Ajoute une ligne : "email@exemple.com",               ║
 * ║  2. Redéploie sur Vercel (npx vercel --prod)              ║
 * ║                                                           ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

export const FREE_EMAILS: string[] = [
  // ════════════════════════════════════════════════════════════
  // AJOUTE TES EMAILS GRATUITS CI-DESSOUS (un par ligne)
  // ════════════════════════════════════════════════════════════
  
  "liveandbest@gmail.com",
  
  // Exemples (décommente pour activer) :
  // "client1@email.com",
  // "client2@email.com",
  
  // ════════════════════════════════════════════════════════════
];

/**
 * Vérifie si un email est dans la liste gratuite
 */
export function isEmailFree(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase().trim();
  return FREE_EMAILS.some(e => e.toLowerCase().trim() === emailLower);
}
