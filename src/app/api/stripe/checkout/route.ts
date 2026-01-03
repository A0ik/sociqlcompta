import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isEmailFree } from "@/lib/free-emails";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // Si email gratuit -> activer directement sans paiement
    if (isEmailFree(session.user.email)) {
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "active" },
      });
      return NextResponse.json({ free: true });
    }

    // Sinon créer session Stripe pour 300€ (paiement unique)
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "SociQl Compta - Accès Complet",
              description: "Accès illimité à vie à toutes les fonctionnalités",
            },
            unit_amount: 30000, // 300€
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?paid=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?cancelled=true`,
      metadata: { userId },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("Stripe error:", error);
    return NextResponse.json({ error: "Erreur paiement" }, { status: 500 });
  }
}
