"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Mic,
  MicOff,
  Plus,
  Search,
  Link as LinkIcon,
  FileText,
  Trash2,
  Check,
  X,
  ChevronRight,
  ExternalLink,
  Upload,
  Settings,
  LogOut,
  RefreshCw,
  CreditCard,
  Receipt,
  FileSpreadsheet,
  Building2,
} from "lucide-react";

// Types
interface Ligne {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

interface Client {
  id: string;
  numDossier: string;
  raisonSociale: string;
  adresse?: string | null;
  siret?: string | null;
}

interface Company {
  id: string;
  nom: string;
  adresse?: string | null;
  siret?: string | null;
  email?: string | null;
  telephone?: string | null;
  stripeSecretKey?: string | null;
}

interface DocumentType {
  id: string;
  type: string;
  numeroComplet: string;
  createdAt: string;
  lignes: Ligne[];
  sousTotal: number;
  reduction: number;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  stripePaymentLink?: string | null;
  client: Client;
}

// Formatage
const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(d));

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // États principaux
  const [view, setView] = useState<"create" | "settings">("create");
  const [docType, setDocType] = useState<"FACTURE" | "AVOIR" | "DEVIS">("FACTURE");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [company, setCompany] = useState<Company | null>(null);

  // États lignes
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [reduction, setReduction] = useState(0);

  // États audio
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // États UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdDoc, setCreatedDoc] = useState<DocumentType | null>(null);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [needsCompanySetup, setNeedsCompanySetup] = useState(false);

  // Modals
  const [showAddClient, setShowAddClient] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [manualClient, setManualClient] = useState({
    numDossier: "",
    raisonSociale: "",
    siret: "",
    adresse: "",
  });

  // Company form
  const [companyForm, setCompanyForm] = useState({
    nom: "",
    adresse: "",
    siret: "",
    email: "",
    telephone: "",
    stripeSecretKey: "",
  });

  // Vérifier session et paiement
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && session?.user) {
      const user = session.user as any;
      if (user.subscriptionStatus !== "active" && !user.isFree) {
        setNeedsPayment(true);
      }
    }
  }, [status, session, router]);

  // Charger company
  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.company) {
        setCompany(data.company);
        setCompanyForm({
          nom: data.company.nom || "",
          adresse: data.company.adresse || "",
          siret: data.company.siret || "",
          email: data.company.email || "",
          telephone: data.company.telephone || "",
          stripeSecretKey: data.company.stripeSecretKey || "",
        });
      } else {
        setNeedsCompanySetup(true);
      }
    } catch {}
  }, []);

  // Charger clients
  const loadClients = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients?search=${searchQuery}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch {}
  }, [searchQuery]);

  useEffect(() => {
    if (status === "authenticated" && !needsPayment) {
      loadCompany();
      loadClients();
    }
  }, [status, needsPayment, loadCompany, loadClients]);

  // Paiement Stripe
  const handlePayment = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();

      if (data.free) {
        // Email gratuit
        setNeedsPayment(false);
        window.location.reload();
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Erreur lors du paiement");
    }
    setLoading(false);
  };

  // Sauvegarder company
  const saveCompany = async () => {
    if (!companyForm.nom) {
      setError("Le nom de l'entreprise est requis");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const data = await res.json();

      if (data.success) {
        setCompany(data.company);
        setNeedsCompanySetup(false);
        setSuccess("Profil enregistré !");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError("Erreur lors de la sauvegarde");
    }
    setLoading(false);
  };

  // Enregistrement audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        await processAudio(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Impossible d'accéder au micro");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setLoading(true);
    setError(null);

    try {
      // Transcription
      const form = new FormData();
      form.append("audio", blob);
      const transRes = await fetch("/api/generate", { method: "POST", body: form });
      const transData = await transRes.json();

      if (!transData.success) {
        setError(transData.error || "Erreur transcription");
        setLoading(false);
        return;
      }

      const newTranscription = transData.transcription;
      setTranscriptions((prev) => [...prev, newTranscription]);

      // Extraction
      const extractRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", texte: newTranscription }),
      });
      const extractData = await extractRes.json();

      if (extractData.lignes?.length) {
        setLignes((prev) => [...prev, ...extractData.lignes]);
        if (extractData.reduction) setReduction((r) => r + extractData.reduction);
      }
    } catch (e) {
      setError(String(e));
    }

    setLoading(false);
  };

  // Import fichier Excel/CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      // Mapper les colonnes
      const clients = json.map((row: any) => ({
        numDossier: row.numDossier || row.numero || row.dossier || row["N° Dossier"] || "",
        raisonSociale: row.raisonSociale || row.nom || row.entreprise || row["Raison Sociale"] || "",
        adresse: row.adresse || row.Adresse || "",
        siret: row.siret || row.SIRET || "",
        siren: row.siren || row.SIREN || "",
        email: row.email || row.Email || "",
        telephone: row.telephone || row.tel || row.Téléphone || "",
      }));

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clients }),
      });

      const result = await res.json();
      if (result.success) {
        setSuccess(`${result.created} créés, ${result.updated} mis à jour`);
        loadClients();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError("Erreur lors de l'import");
    }

    setLoading(false);
    e.target.value = "";
  };

  // Import par URL
  const addClientByUrl = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput, numDossier: manualClient.numDossier }),
      });
      const data = await res.json();

      if (data.success) {
        setClients((prev) => [data.client, ...prev]);
        setSelectedClient(data.client);
        setShowAddClient(false);
        setUrlInput("");
        setManualClient({ numDossier: "", raisonSociale: "", siret: "", adresse: "" });
        setSuccess("Client importé !");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Erreur extraction");
      }
    } catch {
      setError("Erreur lors de l'import");
    }

    setLoading(false);
  };

  // Ajouter client manuellement
  const addClientManual = async () => {
    if (!manualClient.numDossier || !manualClient.raisonSociale) {
      setError("Numéro et raison sociale requis");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualClient),
      });
      const data = await res.json();

      if (data.success) {
        setClients((prev) => [data.client, ...prev]);
        setSelectedClient(data.client);
        setShowAddClient(false);
        setManualClient({ numDossier: "", raisonSociale: "", siret: "", adresse: "" });
      } else {
        setError(data.error);
      }
    } catch {
      setError("Erreur lors de la création");
    }

    setLoading(false);
  };

  // Créer document
  const createDocument = async () => {
    if (!selectedClient || lignes.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          type: docType,
          clientId: selectedClient.id,
          lignes,
          reduction,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setCreatedDoc(data.document);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Erreur lors de la création");
    }

    setLoading(false);
  };

  // Reset
  const reset = () => {
    setSelectedClient(null);
    setLignes([]);
    setReduction(0);
    setTranscriptions([]);
    setCreatedDoc(null);
    setError(null);
  };

  // Calculs
  const sousTotal = lignes.reduce((s, l) => s + l.montant, 0);
  const montantHT = Math.max(0, sousTotal - reduction);
  const montantTVA = montantHT * 0.2;
  const montantTTC = montantHT + montantTVA;

  // Gestion lignes
  const addLigne = () => {
    setLignes([...lignes, { description: "", quantite: 1, prixUnitaire: 0, montant: 0 }]);
  };

  const updateLigne = (i: number, field: string, value: string | number) => {
    const updated = [...lignes];
    const l = { ...updated[i], [field]: value };
    if (field === "quantite" || field === "prixUnitaire") {
      l.montant = l.quantite * l.prixUnitaire;
    }
    updated[i] = l;
    setLignes(updated);
  };

  const removeLigne = (i: number) => {
    setLignes(lignes.filter((_, idx) => idx !== i));
  };

  // Loading
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Paywall
  if (needsPayment) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CreditCard className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Accès Premium Requis</h1>
          <p className="text-gray-400 mb-6">
            Pour accéder à SociQl Compta, un paiement unique de 300€ est requis.
          </p>
          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full bg-white text-black py-4 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? "Chargement..." : "Payer 300€ - Accès à vie"}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full mt-4 text-gray-400 hover:text-white"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  // Setup Company
  if (needsCompanySetup) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Configurez votre entreprise</h1>
            <p className="text-gray-400">Ces infos apparaîtront sur vos documents</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nom entreprise *</label>
              <input
                type="text"
                value={companyForm.nom}
                onChange={(e) => setCompanyForm({ ...companyForm, nom: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="Mon Cabinet"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Adresse</label>
              <input
                type="text"
                value={companyForm.adresse}
                onChange={(e) => setCompanyForm({ ...companyForm, adresse: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="123 rue..."
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">SIRET</label>
              <input
                type="text"
                value={companyForm.siret}
                onChange={(e) => setCompanyForm({ ...companyForm, siret: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="12345678901234"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="contact@entreprise.fr"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Téléphone</label>
              <input
                type="text"
                value={companyForm.telephone}
                onChange={(e) => setCompanyForm({ ...companyForm, telephone: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="01 23 45 67 89"
              />
            </div>
            <button
              onClick={saveCompany}
              disabled={loading}
              className="w-full bg-white text-black py-4 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Continuer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Document créé
  if (createdDoc) {
    return (
      <div className="min-h-screen bg-black text-white p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold mb-2">
              {createdDoc.type === "FACTURE"
                ? "Facture"
                : createdDoc.type === "AVOIR"
                ? "Avoir"
                : "Devis"}{" "}
              créé(e) !
            </h1>
            <p className="text-gray-400">{createdDoc.numeroComplet}</p>
          </div>

          {/* Prévisualisation */}
          <div className="bg-white text-black rounded-2xl overflow-hidden mb-6">
            <div className="bg-black text-white p-6">
              <div className="flex justify-between">
                <div>
                  <h2 className="text-xl font-bold">{company?.nom}</h2>
                  {company?.adresse && <p className="text-gray-400 text-sm">{company.adresse}</p>}
                  {company?.siret && <p className="text-gray-400 text-sm">SIRET: {company.siret}</p>}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{createdDoc.type}</p>
                  <p className="text-gray-400">{createdDoc.numeroComplet}</p>
                  <p className="text-gray-400">{fmtDate(createdDoc.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-b">
              <p className="text-xs text-gray-500 uppercase mb-2">Client</p>
              <p className="font-bold">{createdDoc.client.raisonSociale}</p>
              <p className="text-gray-600 text-sm">Dossier: {createdDoc.client.numDossier}</p>
            </div>

            <div className="p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2">Description</th>
                    <th className="text-center py-2 w-16">Qté</th>
                    <th className="text-right py-2 w-24">P.U.</th>
                    <th className="text-right py-2 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {createdDoc.lignes.map((l, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{l.description}</td>
                      <td className="py-2 text-center">{l.quantite}</td>
                      <td className="py-2 text-right">{fmt(l.prixUnitaire)}</td>
                      <td className="py-2 text-right font-medium">{fmt(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 flex justify-end">
                <div className="w-64 text-sm">
                  <div className="flex justify-between py-1">
                    <span>Sous-total</span>
                    <span>{fmt(createdDoc.sousTotal)}</span>
                  </div>
                  {createdDoc.reduction > 0 && (
                    <div className="flex justify-between py-1 text-red-600">
                      <span>Réduction</span>
                      <span>-{fmt(createdDoc.reduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span>HT</span>
                    <span>{fmt(createdDoc.montantHT)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>TVA 20%</span>
                    <span>{fmt(createdDoc.montantTVA)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold text-lg border-t mt-2">
                    <span>TTC</span>
                    <span>{fmt(createdDoc.montantTTC)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {createdDoc.stripePaymentLink && (
            <a
              href={createdDoc.stripePaymentLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-white text-black rounded-xl font-medium mb-4 hover:bg-gray-200"
            >
              <ExternalLink className="w-5 h-5" />
              Lien de paiement Stripe
            </a>
          )}

          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 w-full py-4 border border-white/20 rounded-xl hover:bg-white/5"
          >
            <RefreshCw className="w-5 h-5" />
            Nouveau document
          </button>
        </div>
      </div>
    );
  }

  // Dashboard principal
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">SQ</span>
            </div>
            <span className="font-semibold hidden sm:block">{company?.nom || "SociQl Compta"}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("create")}
              className={`px-4 py-2 rounded-lg text-sm ${
                view === "create" ? "bg-white text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Créer
            </button>
            <button
              onClick={() => setView("settings")}
              className={`px-4 py-2 rounded-lg text-sm ${
                view === "settings" ? "bg-white text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Paramètres
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-2 text-gray-400 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl">
            {success}
          </div>
        </div>
      )}

      {/* Settings View */}
      {view === "settings" && (
        <div className="max-w-2xl mx-auto p-6">
          <h2 className="text-2xl font-bold mb-6">Paramètres</h2>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold mb-4">Informations entreprise</h3>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Nom</label>
              <input
                type="text"
                value={companyForm.nom}
                onChange={(e) => setCompanyForm({ ...companyForm, nom: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Adresse</label>
              <input
                type="text"
                value={companyForm.adresse}
                onChange={(e) => setCompanyForm({ ...companyForm, adresse: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">SIRET</label>
              <input
                type="text"
                value={companyForm.siret}
                onChange={(e) => setCompanyForm({ ...companyForm, siret: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Téléphone</label>
              <input
                type="text"
                value={companyForm.telephone}
                onChange={(e) => setCompanyForm({ ...companyForm, telephone: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
              />
            </div>

            <hr className="border-white/10 my-6" />

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Clé Stripe (pour vos factures)
              </label>
              <input
                type="password"
                value={companyForm.stripeSecretKey}
                onChange={(e) => setCompanyForm({ ...companyForm, stripeSecretKey: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                placeholder="sk_live_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Optionnel - Pour générer des liens de paiement sur vos factures
              </p>
            </div>

            <button
              onClick={saveCompany}
              disabled={loading}
              className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Create View */}
      {view === "create" && (
        <main className="max-w-7xl mx-auto p-4 md:p-6">
          {/* Type de document */}
          <div className="flex justify-center mb-6">
            <div className="flex bg-white/5 rounded-xl p-1">
              {(["FACTURE", "DEVIS", "AVOIR"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    docType === t ? "bg-white text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t === "FACTURE" && <FileText className="w-4 h-4 inline mr-2" />}
                  {t === "DEVIS" && <FileSpreadsheet className="w-4 h-4 inline mr-2" />}
                  {t === "AVOIR" && <Receipt className="w-4 h-4 inline mr-2" />}
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Colonne gauche */}
            <div className="space-y-6">
              {/* Sélection client */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Client</h2>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-sm text-gray-400 hover:text-white cursor-pointer">
                      <Upload className="w-4 h-4" />
                      Import
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setShowAddClient(true)}
                      className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter
                    </button>
                  </div>
                </div>

                {selectedClient ? (
                  <div className="flex items-center justify-between bg-white/5 rounded-xl p-4">
                    <div>
                      <p className="font-medium">{selectedClient.raisonSociale}</p>
                      <p className="text-sm text-gray-400">{selectedClient.numDossier}</p>
                    </div>
                    <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher..."
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedClient(c)}
                          className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 text-left"
                        >
                          <div>
                            <p className="font-medium">{c.raisonSociale}</p>
                            <p className="text-sm text-gray-500">{c.numDossier}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        </button>
                      ))}
                      {clients.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          Aucun client. Importez ou ajoutez-en un.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Zone Micro */}
              {selectedClient && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                  <div className="text-center">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={loading}
                      className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto transition-all ${
                        isRecording ? "bg-red-500 recording-pulse" : "bg-white hover:scale-105"
                      }`}
                    >
                      {loading ? (
                        <div className="w-8 h-8 border-3 border-black border-t-transparent rounded-full animate-spin" />
                      ) : isRecording ? (
                        <MicOff className="w-10 h-10 text-white" />
                      ) : (
                        <Mic className="w-10 h-10 text-black" />
                      )}
                    </button>

                    <p className="mt-4 text-sm text-gray-400">
                      {loading ? "Traitement..." : isRecording ? "Parlez..." : "Cliquez pour dicter"}
                    </p>

                    {transcriptions.length > 0 && (
                      <div className="mt-6 text-left">
                        <p className="text-xs text-gray-500 mb-2">Transcriptions :</p>
                        {transcriptions.map((t, i) => (
                          <p key={i} className="text-sm text-gray-300 bg-white/5 rounded-lg p-2 mb-2">
                            "{t}"
                          </p>
                        ))}
                        <button
                          onClick={startRecording}
                          disabled={isRecording || loading}
                          className="text-sm text-gray-400 hover:text-white mt-2"
                        >
                          + Ajouter une dictée
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Colonne droite */}
            <div className="space-y-6">
              {/* Lignes */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Lignes</h2>
                  <button onClick={addLigne} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </button>
                </div>

                {lignes.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Dictez ou ajoutez des lignes</p>
                ) : (
                  <div className="space-y-3">
                    {lignes.map((l, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <input
                          type="text"
                          value={l.description}
                          onChange={(e) => updateLigne(i, "description", e.target.value)}
                          placeholder="Description"
                          className="flex-[3] px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30"
                        />
                        <input
                          type="number"
                          value={l.quantite}
                          onChange={(e) => updateLigne(i, "quantite", Number(e.target.value))}
                          className="w-16 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-center focus:outline-none"
                        />
                        <input
                          type="number"
                          value={l.prixUnitaire || ""}
                          onChange={(e) => updateLigne(i, "prixUnitaire", Number(e.target.value))}
                          placeholder="€"
                          className="w-20 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-right focus:outline-none"
                        />
                        <span className="w-24 py-2 text-right text-sm">{fmt(l.montant)}</span>
                        <button onClick={() => removeLigne(i)} className="p-2 text-gray-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Réduction */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Réduction</span>
                    <input
                      type="number"
                      value={reduction || ""}
                      onChange={(e) => setReduction(Number(e.target.value))}
                      className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-right focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="bg-white text-black rounded-2xl p-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sous-total</span>
                    <span>{fmt(sousTotal)}</span>
                  </div>
                  {reduction > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Réduction</span>
                      <span>-{fmt(reduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">HT</span>
                    <span>{fmt(montantHT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">TVA 20%</span>
                    <span>{fmt(montantTVA)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold pt-2 border-t">
                    <span>TTC</span>
                    <span>{fmt(montantTTC)}</span>
                  </div>
                </div>

                <button
                  onClick={createDocument}
                  disabled={!selectedClient || lignes.length === 0 || loading}
                  className="w-full mt-6 py-4 bg-black text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Créer {docType === "FACTURE" ? "la facture" : docType === "DEVIS" ? "le devis" : "l'avoir"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Modal Ajouter Client */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Ajouter un client</h2>
              <button onClick={() => setShowAddClient(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Par URL */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                <LinkIcon className="w-4 h-4 inline mr-1" />
                Depuis une URL (Pappers, Societe.com...)
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.pappers.fr/entreprise/..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30 mb-2"
              />
              <input
                type="text"
                value={manualClient.numDossier}
                onChange={(e) => setManualClient({ ...manualClient, numDossier: e.target.value.toUpperCase() })}
                placeholder="N° dossier (optionnel, sinon = SIRET)"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30 mb-2"
              />
              <button
                onClick={addClientByUrl}
                disabled={loading || !urlInput}
                className="w-full px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                {loading ? "Import..." : "Importer depuis l'URL"}
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-zinc-900 text-sm text-gray-500">ou manuellement</span>
              </div>
            </div>

            {/* Manuel */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Numéro de dossier *</label>
                <input
                  type="text"
                  value={manualClient.numDossier}
                  onChange={(e) => setManualClient({ ...manualClient, numDossier: e.target.value.toUpperCase() })}
                  placeholder="AB1234"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Raison sociale *</label>
                <input
                  type="text"
                  value={manualClient.raisonSociale}
                  onChange={(e) => setManualClient({ ...manualClient, raisonSociale: e.target.value })}
                  placeholder="Nom de l'entreprise"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">SIRET</label>
                <input
                  type="text"
                  value={manualClient.siret}
                  onChange={(e) => setManualClient({ ...manualClient, siret: e.target.value })}
                  placeholder="12345678901234"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Adresse</label>
                <input
                  type="text"
                  value={manualClient.adresse}
                  onChange={(e) => setManualClient({ ...manualClient, adresse: e.target.value })}
                  placeholder="123 rue..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <button
                onClick={addClientManual}
                disabled={loading || !manualClient.numDossier || !manualClient.raisonSociale}
                className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                Créer le client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
