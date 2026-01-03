import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calculerMontants } from "@/lib/utils";
import Stripe from "stripe";

interface LigneType {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const contentType = req.headers.get("content-type") || "";

    // ========== TRANSCRIPTION AUDIO ==========
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audio = formData.get("audio") as Blob;

      if (!audio) {
        return NextResponse.json({ error: "Audio requis" }, { status: 400 });
      }

      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return NextResponse.json(
          { error: "GROQ_API_KEY non configurée sur Vercel" },
          { status: 500 }
        );
      }

      const form = new FormData();
      form.append("file", audio, "audio.webm");
      form.append("model", "whisper-large-v3");
      form.append("language", "fr");

      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: form,
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { error: `Erreur Groq: ${err}` },
          { status: 500 }
        );
      }

      const data = await res.json();
      return NextResponse.json({ success: true, transcription: data.text || "" });
    }

    // ========== ACTIONS JSON ==========
    const body = await req.json();

    // ----- EXTRACTION -----
    if (body.action === "extract") {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "OPENROUTER_API_KEY non configurée" },
          { status: 500 }
        );
      }

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Extrais lignes de facturation. JSON uniquement:
{"lignes":[{"description":"","quantite":1,"prixUnitaire":0,"montant":0}],"reduction":0}

Texte: "${body.texte}"`,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        return NextResponse.json({ lignes: [], reduction: 0 });
      }

      const aiData = await res.json();
      const content = aiData.choices?.[0]?.message?.content || "";
      const match = content.match(/\{[\s\S]*\}/);

      if (!match) {
        return NextResponse.json({ lignes: [], reduction: 0 });
      }

      try {
        const parsed = JSON.parse(match[0]);
        const lignes = (parsed.lignes || []).map((l: any) => ({
          description: String(l.description || ""),
          quantite: Math.max(1, Number(l.quantite) || 1),
          prixUnitaire: Number(l.prixUnitaire) || 0,
          montant: Number(l.montant) || Number(l.quantite || 1) * Number(l.prixUnitaire || 0),
        }));
        return NextResponse.json({ lignes, reduction: Number(parsed.reduction) || 0 });
      } catch {
        return NextResponse.json({ lignes: [], reduction: 0 });
      }
    }

    // ----- CRÉATION DOCUMENT -----
    if (body.action === "create") {
      const { type, clientId, lignes, reduction = 0 } = body;

      if (!type || !clientId || !lignes?.length) {
        return NextResponse.json(
          { error: "Données incomplètes" },
          { status: 400 }
        );
      }

      // Vérifier client
      const client = await prisma.client.findFirst({
        where: { id: clientId, userId },
      });

      if (!client) {
        return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
      }

      // Calculs
      const sousTotal = lignes.reduce(
        (s: number, l: LigneType) => s + l.montant,
        0
      );
      const montants = calculerMontants(sousTotal, reduction);

      // Numéro suivant
      const year = new Date().getFullYear();
      const seqId = `${userId}_${type}_${year}`;

      const seq = await prisma.sequence.upsert({
        where: { id: seqId },
        update: { numero: { increment: 1 } },
        create: { id: seqId, numero: 1 },
      });

      const prefixes: Record<string, string> = {
        FACTURE: "FA",
        AVOIR: "AV",
        DEVIS: "DV",
      };
      const prefix = prefixes[type] || "XX";
      const numeroComplet = `${prefix}-${year}-${seq.numero
        .toString()
        .padStart(4, "0")}`;

      // Stripe link si facture + clé configurée
      let stripePaymentLink: string | null = null;

      const company = await prisma.company.findUnique({ where: { userId } });

      if (type === "FACTURE" && company?.stripeSecretKey) {
        try {
          const userStripe = new Stripe(company.stripeSecretKey);

          const product = await userStripe.products.create({
            name: `Facture ${numeroComplet}`,
          });

          const price = await userStripe.prices.create({
            product: product.id,
            unit_amount: Math.round(montants.montantTTC * 100),
            currency: "eur",
          });

          const link = await userStripe.paymentLinks.create({
            line_items: [{ price: price.id, quantity: 1 }],
          });

          stripePaymentLink = link.url;
        } catch (e) {
          console.error("User Stripe error:", e);
        }
      }

      // Créer document
      const document = await prisma.document.create({
        data: {
          userId,
          type,
          numero: seq.numero,
          numeroComplet,
          ...montants,
          stripePaymentLink,
          clientId: client.id,
          lignes: {
            create: lignes.map((l: LigneType) => ({
              description: l.description,
              quantite: l.quantite,
              prixUnitaire: l.prixUnitaire,
              montant: l.montant,
            })),
          },
        },
        include: { client: true, lignes: true },
      });

      return NextResponse.json({ success: true, document });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
