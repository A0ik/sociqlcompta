import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export async function creerLienPaiement(params: {
  montantTTC: number;
  numeroDocument: string;
  raisonSociale: string;
  description: string;
}): Promise<{ success: boolean; url?: string; paymentLinkId?: string; error?: string }> {
  if (!stripe) return { success: false, error: 'Stripe non configuré' };

  try {
    const product = await stripe.products.create({
      name: `Document ${params.numeroDocument}`,
      description: `${params.description} - ${params.raisonSociale}`,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(params.montantTTC * 100),
      currency: 'eur',
    });

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });

    return { success: true, url: paymentLink.url, paymentLinkId: paymentLink.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur Stripe' };
  }
}
