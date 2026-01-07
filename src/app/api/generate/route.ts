import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextFactureNumber, calculerMontants } from '@/lib/facture-utils';
import { creerLienPaiement } from '@/lib/stripe';

interface LigneFacture {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

// Transcrire l'audio avec Groq (gratuit et fiable) ou OpenAI
async function transcrireAudio(audioBlob: Blob): Promise<{ text: string; success: boolean; error?: string }> {
  // Essayer d'abord avec Groq (gratuit)
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  // Option 1: Groq (recommandé - gratuit)
  if (groqKey) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'fr');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return { text: data.text || '', success: true };
      }
    } catch (e) {
      console.error('Groq error:', e);
    }
  }

  // Option 2: OpenAI directement
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'fr');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return { text: data.text || '', success: true };
      }
    } catch (e) {
      console.error('OpenAI error:', e);
    }
  }

  // Option 3: OpenRouter (peut ne pas supporter audio)
  if (openrouterKey) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'openai/whisper-large-v3');
      formData.append('language', 'fr');

      const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return { text: data.text || '', success: true };
      } else {
        const errorText = await response.text();
        return { text: '', success: false, error: `OpenRouter: ${errorText}` };
      }
    } catch (e) {
      console.error('OpenRouter error:', e);
    }
  }

  return { 
    text: '', 
    success: false, 
    error: 'Aucune API de transcription configurée. Ajoutez GROQ_API_KEY (gratuit) ou OPENAI_API_KEY.' 
  };
}

// Extraire les infos avec GPT via OpenRouter
async function extraireInfos(transcription: string): Promise<{
  numDossier: string;
  lignes: LigneFacture[];
  reduction: number;
  sousTotal: number;
  montantHT: number;
  success: boolean;
  error?: string;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      numDossier: '',
      lignes: [],
      reduction: 0,
      sousTotal: 0,
      montantHT: 0,
      success: false,
      error: 'OPENROUTER_API_KEY non configurée',
    };
  }

  const systemPrompt = `Tu es un assistant pour un cabinet comptable français. Extrais les informations de facturation.

EXEMPLES:
"Facture dossier AM0028, 5 fiches de paie à 30 euros" →
{"numDossier":"AM0028","lignes":[{"description":"Fiche de paie","quantite":5,"prixUnitaire":30,"montant":150}],"reduction":0}

"Dossier SPR, bilan 500€ et 3 bulletins 25€, remise 50€" →
{"numDossier":"SPR","lignes":[{"description":"Bilan","quantite":1,"prixUnitaire":500,"montant":500},{"description":"Bulletin","quantite":3,"prixUnitaire":25,"montant":75}],"reduction":50}

RÈGLES:
- Si pas de quantité → quantite = 1
- montant = quantite × prixUnitaire
- reduction ≥ 0

Réponds UNIQUEMENT en JSON valide:
{"numDossier":"string","lignes":[{"description":"string","quantite":number,"prixUnitaire":number,"montant":number}],"reduction":number}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcription },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { numDossier: '', lignes: [], reduction: 0, sousTotal: 0, montantHT: 0, success: false, error };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { numDossier: '', lignes: [], reduction: 0, sousTotal: 0, montantHT: 0, success: false, error: 'Pas de JSON trouvé' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const lignes: LigneFacture[] = (parsed.lignes || []).map((l: Record<string, unknown>) => ({
      description: String(l.description || ''),
      quantite: Math.max(1, Number(l.quantite) || 1),
      prixUnitaire: Math.max(0, Number(l.prixUnitaire) || 0),
      montant: Math.max(0, Number(l.montant) || 0),
    }));

    const sousTotal = lignes.reduce((sum, l) => sum + l.montant, 0);
    const reduction = Math.max(0, Number(parsed.reduction) || 0);

    return {
      numDossier: String(parsed.numDossier || '').toUpperCase().trim(),
      lignes,
      reduction,
      sousTotal,
      montantHT: sousTotal - reduction,
      success: true,
    };
  } catch (error) {
    return {
      numDossier: '',
      lignes: [],
      reduction: 0,
      sousTotal: 0,
      montantHT: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Erreur extraction',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Transcription audio
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const audio = formData.get('audio') as Blob;

      if (!audio) {
        return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 });
      }

      const result = await transcrireAudio(audio);
      
      return NextResponse.json({
        success: result.success,
        transcription: result.text,
        error: result.error,
      });
    }

    // Actions JSON
    const body = await request.json();

    if (body.action === 'extract') {
      const { transcription } = body;
      if (!transcription) {
        return NextResponse.json({ error: 'Transcription requise' }, { status: 400 });
      }

      const extraction = await extraireInfos(transcription);

      let client = null;
      if (extraction.success && extraction.numDossier) {
        client = await prisma.client.findUnique({
          where: { numDossier: extraction.numDossier },
        });
      }

      return NextResponse.json({
        success: extraction.success,
        extraction,
        clientTrouve: !!client,
        client,
        error: extraction.error,
      });
    }

    if (body.action === 'create') {
      const { numDossier, lignes, reduction = 0, genererStripe = true } = body;

      if (!numDossier || !lignes?.length) {
        return NextResponse.json({ error: 'Données incomplètes' }, { status: 400 });
      }

      const client = await prisma.client.findUnique({
        where: { numDossier: numDossier.toUpperCase().trim() },
      });

      if (!client) {
        return NextResponse.json({ error: `Dossier ${numDossier} non trouvé` }, { status: 404 });
      }

      const sousTotal = lignes.reduce((sum: number, l: LigneFacture) => sum + l.montant, 0);
      const montants = calculerMontants(sousTotal, reduction, 20);
      const { numeroSequentiel, prefixe, numeroComplet } = await getNextFactureNumber();

      let stripePaymentLink: string | null = null;
      let stripePaymentId: string | null = null;

      if (genererStripe && process.env.STRIPE_SECRET_KEY) {
        const desc = lignes.map((l: LigneFacture) => `${l.quantite}x ${l.description}`).join(', ');
        const stripeResult = await creerLienPaiement({
          montantTTC: montants.montantTTC,
          numeroFacture: numeroComplet,
          raisonSociale: client.raisonSociale,
          prestation: desc,
        });
        if (stripeResult.success) {
          stripePaymentLink = stripeResult.url || null;
          stripePaymentId = stripeResult.paymentLinkId || null;
        }
      }

      const facture = await prisma.facture.create({
        data: {
          numeroSequentiel,
          prefixe,
          numeroComplet,
          sousTotal: montants.sousTotal,
          reduction: montants.reduction,
          montantHT: montants.montantHT,
          tauxTVA: montants.tauxTVA,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          stripePaymentLink,
          stripePaymentId,
          clientId: client.id,
          lignes: {
            create: lignes.map((l: LigneFacture) => ({
              description: l.description,
              quantite: l.quantite,
              prixUnitaire: l.prixUnitaire,
              montant: l.montant,
            })),
          },
        },
        include: { client: true, lignes: true },
      });

      return NextResponse.json({ success: true, facture });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
