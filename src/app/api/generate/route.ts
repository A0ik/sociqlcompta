import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextDocumentNumber, calculerMontants } from '@/lib/utils';
import { creerLienPaiement } from '@/lib/stripe';

interface Ligne {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

// Transcription avec Groq (gratuit) ou fallback
async function transcrire(audio: Blob): Promise<{ text: string; ok: boolean; error?: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  
  if (groqKey) {
    try {
      const form = new FormData();
      form.append('file', audio, 'audio.webm');
      form.append('model', 'whisper-large-v3');
      form.append('language', 'fr');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        return { text: data.text || '', ok: true };
      }
      const err = await res.text();
      return { text: '', ok: false, error: err };
    } catch (e) {
      return { text: '', ok: false, error: String(e) };
    }
  }

  return { text: '', ok: false, error: 'GROQ_API_KEY non configurée. Créez un compte gratuit sur console.groq.com' };
}

// Extraction avec OpenRouter
async function extraire(texte: string): Promise<{
  lignes: Ligne[];
  reduction: number;
  ok: boolean;
  error?: string;
}> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { lignes: [], reduction: 0, ok: false, error: 'OPENROUTER_API_KEY manquante' };

  const prompt = `Extrais les lignes de facturation du texte suivant. 
Réponds UNIQUEMENT en JSON: {"lignes":[{"description":"string","quantite":number,"prixUnitaire":number,"montant":number}],"reduction":number}

Texte: "${texte}"`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return { lignes: [], reduction: 0, ok: false, error: await res.text() };

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    
    if (!match) return { lignes: [], reduction: 0, ok: false, error: 'Pas de JSON' };

    const parsed = JSON.parse(match[0]);
    const lignes: Ligne[] = (parsed.lignes || []).map((l: Record<string, unknown>) => ({
      description: String(l.description || ''),
      quantite: Math.max(1, Number(l.quantite) || 1),
      prixUnitaire: Number(l.prixUnitaire) || 0,
      montant: Number(l.montant) || 0,
    }));

    return { lignes, reduction: Number(parsed.reduction) || 0, ok: true };
  } catch (e) {
    return { lignes: [], reduction: 0, ok: false, error: String(e) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Transcription audio
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const audio = form.get('audio') as Blob;
      if (!audio) return NextResponse.json({ error: 'Audio requis' }, { status: 400 });

      const result = await transcrire(audio);
      return NextResponse.json({ success: result.ok, transcription: result.text, error: result.error });
    }

    const body = await req.json();

    // Extraction depuis texte
    if (body.action === 'extract') {
      const result = await extraire(body.texte || '');
      return NextResponse.json({ success: result.ok, ...result });
    }

    // Création document (facture, devis ou avoir)
    if (body.action === 'create') {
      const { type, clientId, lignes, reduction = 0, factureOrigineId } = body;

      if (!clientId || !lignes?.length) {
        return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
      }

      if (!['FACTURE', 'DEVIS', 'AVOIR'].includes(type)) {
        return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
      }

      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });

      const sousTotal = lignes.reduce((s: number, l: Ligne) => s + l.montant, 0);
      const montants = calculerMontants(sousTotal, reduction);
      const { numeroSequentiel, prefixe, numeroComplet } = await getNextDocumentNumber(type);

      // Stripe uniquement pour les factures
      let stripeUrl = null, stripeId = null;
      if (type === 'FACTURE' && process.env.STRIPE_SECRET_KEY) {
        const desc = lignes.map((l: Ligne) => `${l.quantite}x ${l.description}`).join(', ');
        const stripe = await creerLienPaiement({
          montantTTC: montants.montantTTC,
          numeroDocument: numeroComplet,
          raisonSociale: client.raisonSociale,
          description: desc,
        });
        if (stripe.success) {
          stripeUrl = stripe.url;
          stripeId = stripe.paymentLinkId;
        }
      }

      const doc = await prisma.document.create({
        data: {
          type,
          numeroSequentiel,
          prefixe,
          numeroComplet,
          factureOrigineId: type === 'AVOIR' ? factureOrigineId : null,
          ...montants,
          stripePaymentLink: stripeUrl,
          stripePaymentId: stripeId,
          clientId: client.id,
          lignes: {
            create: lignes.map((l: Ligne) => ({
              description: l.description,
              quantite: l.quantite,
              prixUnitaire: l.prixUnitaire,
              montant: l.montant,
            })),
          },
        },
        include: { client: true, lignes: true },
      });

      return NextResponse.json({ success: true, document: doc });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
