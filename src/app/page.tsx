"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Mic,
  FileText,
  CreditCard,
  Users,
  Shield,
  Zap,
  ChevronRight,
  Check,
  Menu,
  X,
  Receipt,
} from "lucide-react";

export default function HomePage() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  const handleContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setContactLoading(true);

    const form = e.currentTarget;
    const data = {
      nom: (form.elements.namedItem("nom") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setContactSent(true);
    setContactLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-4">
        <div className="max-w-7xl mx-auto bg-black/80 backdrop-blur border border-white/10 rounded-2xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">SQ</span>
            </div>
            <span className="font-semibold">SociQl Compta</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-400 hover:text-white">
              Fonctionnalités
            </a>
            <a href="#pricing" className="text-gray-400 hover:text-white">
              Tarif
            </a>
            <a href="#contact" className="text-gray-400 hover:text-white">
              Contact
            </a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {session ? (
              <Link
                href="/dashboard"
                className="bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-gray-200"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-gray-300 hover:text-white">
                  Connexion
                </Link>
                <Link
                  href="/register"
                  className="bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-gray-200"
                >
                  Commencer
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-black/90 backdrop-blur border border-white/10 rounded-2xl mt-2 mx-4 p-6">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-gray-300">
                Fonctionnalités
              </a>
              <a href="#pricing" className="text-gray-300">
                Tarif
              </a>
              <a href="#contact" className="text-gray-300">
                Contact
              </a>
              <hr className="border-white/10" />
              {session ? (
                <Link href="/dashboard" className="text-white font-medium">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="text-gray-300">
                    Connexion
                  </Link>
                  <Link
                    href="/register"
                    className="bg-white text-black px-4 py-2 rounded-full font-medium text-center"
                  >
                    Commencer
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex items-center justify-center pt-20 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[150px]" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-8">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-300">
              Facturation propulsée par l'IA
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            Dictez vos factures,
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              l'IA fait le reste
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Créez vos factures, devis et avoirs en parlant simplement. SociQl
            Compta transcrit, calcule et génère tout automatiquement.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="group bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-gray-200 flex items-center gap-2"
            >
              Commencer maintenant
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </Link>
            <a
              href="#features"
              className="px-8 py-4 rounded-full font-semibold text-lg border border-white/20 hover:bg-white/5"
            >
              Voir les fonctionnalités
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-xl text-gray-400">
              Une solution complète pour votre facturation
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Mic,
                title: "Dictée Vocale",
                desc: "Dictez vos factures. L'IA transcrit et extrait les montants automatiquement.",
                color: "text-purple-400",
              },
              {
                icon: FileText,
                title: "Multi-Documents",
                desc: "Factures, devis et avoirs. Numérotation automatique et conforme.",
                color: "text-blue-400",
              },
              {
                icon: Users,
                title: "Gestion Clients",
                desc: "Importez via Excel, CSV ou depuis Pappers.fr avec extraction IA.",
                color: "text-green-400",
              },
              {
                icon: CreditCard,
                title: "Paiement Stripe",
                desc: "Connectez votre Stripe et générez des liens de paiement automatiques.",
                color: "text-yellow-400",
              },
              {
                icon: Shield,
                title: "Données Isolées",
                desc: "Chaque compte a sa propre base de données sécurisée.",
                color: "text-red-400",
              },
              {
                icon: Receipt,
                title: "Calculs Auto",
                desc: "TVA, réductions, totaux calculés automatiquement sans erreur.",
                color: "text-cyan-400",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition"
              >
                <div
                  className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 ${f.color}`}
                >
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
                <p className="text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-purple-900/10 to-black" />

        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Un prix unique, accès à vie
            </h2>
            <p className="text-xl text-gray-400">
              Pas d'abonnement, pas de frais cachés
            </p>
          </div>

          <div className="bg-white/5 border border-white/20 rounded-3xl p-8 md:p-12">
            <div className="text-center mb-10">
              <div className="inline-flex items-baseline gap-2">
                <span className="text-6xl md:text-7xl font-bold">300€</span>
                <span className="text-2xl text-gray-400">une fois</span>
              </div>
              <p className="text-gray-400 mt-4">
                Paiement unique • Accès illimité à vie
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {[
                "Dictée vocale illimitée",
                "Factures, devis et avoirs",
                "Import Excel/CSV",
                "Import depuis Pappers.fr",
                "Intégration Stripe",
                "Calculs TVA automatiques",
                "Numérotation automatique",
                "Support inclus",
                "Données sécurisées",
                "Mises à jour à vie",
              ].map((a) => (
                <div key={a} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-gray-300">{a}</span>
                </div>
              ))}
            </div>

            <div className="text-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-gray-200"
              >
                Commencer maintenant
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-32">
        <div className="max-w-xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Une question ?
            </h2>
            <p className="text-xl text-gray-400">
              Notre équipe vous répond rapidement
            </p>
          </div>

          {contactSent ? (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Message envoyé !</h3>
              <p className="text-gray-400">Nous vous répondrons rapidement.</p>
            </div>
          ) : (
            <form
              onSubmit={handleContact}
              className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6"
            >
              <div>
                <label className="block text-sm text-gray-400 mb-2">Nom</label>
                <input
                  type="text"
                  name="nom"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                  placeholder="Votre nom"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                  placeholder="vous@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Message
                </label>
                <textarea
                  name="message"
                  required
                  rows={4}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30 resize-none"
                  placeholder="Votre message..."
                />
              </div>
              <button
                type="submit"
                disabled={contactLoading}
                className="w-full bg-white text-black py-4 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                {contactLoading ? "Envoi..." : "Envoyer"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">SQ</span>
            </div>
            <span className="font-semibold">SociQl Compta</span>
          </div>
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} SociQl Compta. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
