import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Config manquante" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook sig error:", err);
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: "active",
            subscriptionId: session.id,
          },
        });
        console.log(`User ${userId} activated via Stripe`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Erreur webhook" }, { status: 500 });
  }
}
