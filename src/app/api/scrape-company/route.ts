import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { genererNumDossier } from '@/lib/utils';

// Extraire infos entreprise avec IA depuis une URL
async function extraireInfosEntreprise(url: string): Promise<{
  ok: boolean;
  data?: {
    raisonSociale: string;
    siret: string;
    siren: string;
    adresse: string;
    codeNaf: string;
    formeJuridique: string;
    capital: string;
    dirigeant: string;
  };
  error?: string;
}> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openrouterKey) {
    return { ok: false, error: 'OPENROUTER_API_KEY manquante' };
  }

  try {
    // Étape 1: Récupérer le contenu de la page
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!pageRes.ok) {
      return { ok: false, error: `Impossible d'accéder à ${url}` };
    }

    const html = await pageRes.text();
    
    // Extraire le texte brut (simplification du HTML)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 8000); // Limiter pour l'API

    // Étape 2: Utiliser GPT pour extraire les infos
    const prompt = `Analyse ce texte d'une page web d'information sur une entreprise française et extrais les informations suivantes.
Réponds UNIQUEMENT avec un JSON valide:
{
  "raisonSociale": "nom de l'entreprise",
  "siret": "numéro SIRET (14 chiffres)",
  "siren": "numéro SIREN (9 chiffres)",
  "adresse": "adresse complète",
  "codeNaf": "code NAF/APE",
  "formeJuridique": "SAS, SARL, etc.",
  "capital": "capital social",
  "dirigeant": "nom du dirigeant"
}

Si une info n'est pas trouvée, mets une chaîne vide "".

Texte de la page:
${textContent}`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      return { ok: false, error: 'Erreur API IA' };
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: 'Impossible d\'extraire les informations' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      ok: true,
      data: {
        raisonSociale: String(parsed.raisonSociale || '').trim(),
        siret: String(parsed.siret || '').replace(/\s/g, ''),
        siren: String(parsed.siren || '').replace(/\s/g, ''),
        adresse: String(parsed.adresse || '').trim(),
        codeNaf: String(parsed.codeNaf || '').trim(),
        formeJuridique: String(parsed.formeJuridique || '').trim(),
        capital: String(parsed.capital || '').trim(),
        dirigeant: String(parsed.dirigeant || '').trim(),
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, numDossier } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL requise' }, { status: 400 });
    }

    // Extraire les infos
    const result = await extraireInfosEntreprise(url);

    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error || 'Extraction échouée' }, { status: 400 });
    }

    // Générer ou utiliser le numDossier fourni
    const finalNumDossier = numDossier?.trim() || genererNumDossier();

    // Vérifier si ce numéro existe déjà
    const existing = await prisma.client.findUnique({
      where: { numDossier: finalNumDossier },
    });

    if (existing) {
      return NextResponse.json({ 
        error: `Le numéro de dossier ${finalNumDossier} existe déjà`,
        suggestion: genererNumDossier(),
      }, { status: 409 });
    }

    // Créer le client
    const client = await prisma.client.create({
      data: {
        numDossier: finalNumDossier,
        raisonSociale: result.data.raisonSociale || 'Entreprise',
        adresse: result.data.adresse || null,
        siret: result.data.siret || null,
        siren: result.data.siren || null,
        codeNaf: result.data.codeNaf || null,
        formeJuridique: result.data.formeJuridique || null,
        capital: result.data.capital || null,
        dirigeant: result.data.dirigeant || null,
        siteWeb: url,
      },
    });

    return NextResponse.json({
      success: true,
      client,
      extracted: result.data,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
