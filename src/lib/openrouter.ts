/**
 * Client OpenRouter pour les API IA
 * Utilise Whisper pour la transcription et GPT-4o pour l'extraction
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

export interface LigneFacture {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

export interface ExtractionResult {
  numDossier: string;
  lignes: LigneFacture[];
  reduction: number;
  sousTotal: number;
  montantHT: number;
  success: boolean;
  error?: string;
  rawTranscription?: string;
}

/**
 * Transcrit un fichier audio en texte via Whisper
 */
export async function transcrireAudio(audioBlob: Blob): Promise<{ text: string; success: boolean; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    return { text: '', success: false, error: 'Clé API OpenRouter non configurée' };
  }

  try {
    // Créer un FormData pour envoyer l'audio
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'openai/whisper-large-v3');
    formData.append('language', 'fr');

    const response = await fetch(`${OPENROUTER_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'SmartCompta Voice',
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      return { text: '', success: false, error: `Erreur transcription: ${error}` };
    }

    const data = await response.json();
    return { text: data.text || '', success: true };
  } catch (error) {
    return { 
      text: '', 
      success: false, 
      error: `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}` 
    };
  }
}

/**
 * Extrait les informations de facturation depuis une transcription
 * Supporte les détails (quantité x prix), réductions, etc.
 */
export async function extraireInfosFacture(transcription: string): Promise<ExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    return { 
      numDossier: '', 
      lignes: [],
      reduction: 0,
      sousTotal: 0,
      montantHT: 0, 
      success: false, 
      error: 'Clé API OpenRouter non configurée' 
    };
  }

  const systemPrompt = `Tu es un assistant spécialisé dans l'extraction d'informations de facturation pour un cabinet comptable français.

À partir de la transcription vocale, tu dois extraire :
1. Le numéro de dossier client (alphanumérique comme "AM0028", "CKH088", "SPR", etc.)
2. Les lignes de détail avec description, quantité et prix unitaire
3. Une éventuelle réduction/remise

EXEMPLES DE TRANSCRIPTIONS ET RÉSULTATS ATTENDUS :

Exemple 1: "Facture dossier AM0028, 5 fiches de paie à 30 euros chacune"
→ numDossier: "AM0028"
→ lignes: [{ description: "Fiche de paie", quantite: 5, prixUnitaire: 30, montant: 150 }]
→ reduction: 0

Exemple 2: "Dossier SPR, bilan annuel 500 euros et 3 bulletins de salaire à 25 euros, remise de 50 euros"
→ numDossier: "SPR"
→ lignes: [
    { description: "Bilan annuel", quantite: 1, prixUnitaire: 500, montant: 500 },
    { description: "Bulletin de salaire", quantite: 3, prixUnitaire: 25, montant: 75 }
  ]
→ reduction: 50

Exemple 3: "Pour le client numéro 400040, établissement des paies novembre, 200 euros"
→ numDossier: "400040"
→ lignes: [{ description: "Établissement des paies novembre", quantite: 1, prixUnitaire: 200, montant: 200 }]
→ reduction: 0

RÈGLES :
- Si pas de quantité mentionnée, quantite = 1
- Si un montant global est donné sans détail, crée une seule ligne avec ce montant
- Calcule montant = quantite * prixUnitaire pour chaque ligne
- Calcule sousTotal = somme des montants de toutes les lignes
- Calcule montantHT = sousTotal - reduction
- La réduction est toujours positive (0 si pas de remise)

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks :
{
  "numDossier": "string",
  "lignes": [{ "description": "string", "quantite": number, "prixUnitaire": number, "montant": number }],
  "reduction": number,
  "sousTotal": number,
  "montantHT": number
}`;

  try {
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'SmartCompta Voice',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcription vocale: "${transcription}"` },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { 
        numDossier: '', 
        lignes: [],
        reduction: 0,
        sousTotal: 0,
        montantHT: 0, 
        success: false, 
        error: `Erreur extraction: ${error}` 
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parser le JSON de la réponse
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { 
        numDossier: '', 
        lignes: [],
        reduction: 0,
        sousTotal: 0,
        montantHT: 0, 
        success: false, 
        error: 'Format de réponse invalide',
        rawTranscription: transcription
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Valider et nettoyer les données
    const lignes: LigneFacture[] = (parsed.lignes || []).map((l: Record<string, unknown>) => ({
      description: String(l.description || '').trim(),
      quantite: Math.max(1, Number(l.quantite) || 1),
      prixUnitaire: Math.max(0, Number(l.prixUnitaire) || 0),
      montant: Math.max(0, Number(l.montant) || 0),
    }));

    // Recalculer pour être sûr
    const sousTotal = lignes.reduce((sum, l) => sum + l.montant, 0);
    const reduction = Math.max(0, Number(parsed.reduction) || 0);
    const montantHT = Math.max(0, sousTotal - reduction);

    return {
      numDossier: String(parsed.numDossier || '').toUpperCase().trim(),
      lignes,
      reduction,
      sousTotal,
      montantHT,
      success: true,
      rawTranscription: transcription,
    };
  } catch (error) {
    return { 
      numDossier: '', 
      lignes: [],
      reduction: 0,
      sousTotal: 0,
      montantHT: 0, 
      success: false, 
      error: `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}`,
      rawTranscription: transcription
    };
  }
}
