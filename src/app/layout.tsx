import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "SociQl Compta - Facturation Intelligente",
  description: "Créez vos factures, devis et avoirs par la voix",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-black text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
