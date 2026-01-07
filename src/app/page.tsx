'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Plus, Search, Link, FileText, RefreshCw, 
  Trash2, Check, X, Building2, CreditCard, Receipt,
  ChevronRight, ExternalLink, Upload
} from 'lucide-react';

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

interface Document {
  id: string;
  type: 'FACTURE' | 'AVOIR';
  numeroComplet: string;
  date: string;
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
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

export default function Home() {
  // États principaux
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [docType, setDocType] = useState<'FACTURE' | 'AVOIR'>('FACTURE');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
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
  const [createdDoc, setCreatedDoc] = useState<Document | null>(null);
  
  // Modal ajout client
  const [showAddClient, setShowAddClient] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [manualClient, setManualClient] = useState({ numDossier: '', raisonSociale: '', siret: '' });

  // Charger les clients
  const loadClients = useCallback(async () => {
    const res = await fetch(`/api/dossiers?search=${searchQuery}`);
    const data = await res.json();
    setClients(data.clients || []);
  }, [searchQuery]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Enregistrement audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await processAudio(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      setError('Impossible d\'accéder au micro');
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
      form.append('audio', blob);
      const transRes = await fetch('/api/generate', { method: 'POST', body: form });
      const transData = await transRes.json();

      if (!transData.success) {
        setError(transData.error || 'Erreur transcription');
        setLoading(false);
        return;
      }

      const newTranscription = transData.transcription;
      setTranscriptions(prev => [...prev, newTranscription]);

      // Extraction
      const extractRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', texte: newTranscription }),
      });
      const extractData = await extractRes.json();

      if (extractData.success && extractData.lignes?.length) {
        setLignes(prev => [...prev, ...extractData.lignes]);
        if (extractData.reduction) setReduction(r => r + extractData.reduction);
      }
    } catch (e) {
      setError(String(e));
    }

    setLoading(false);
  };

  // Ajouter client par URL
  const addClientByUrl = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/scrape-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json();

      if (data.success) {
        setClients(prev => [data.client, ...prev]);
        setSelectedClient(data.client);
        setShowAddClient(false);
        setUrlInput('');
        setMode('create');
      } else {
        setError(data.error || 'Erreur extraction');
      }
    } catch (e) {
      setError(String(e));
    }

    setLoading(false);
  };

  // Ajouter client manuellement
  const addClientManual = async () => {
    if (!manualClient.numDossier || !manualClient.raisonSociale) return;
    setLoading(true);

    try {
      const res = await fetch('/api/dossiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...manualClient }),
      });
      const data = await res.json();

      if (data.success) {
        setClients(prev => [data.client, ...prev]);
        setSelectedClient(data.client);
        setShowAddClient(false);
        setManualClient({ numDossier: '', raisonSociale: '', siret: '' });
        setMode('create');
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError(String(e));
    }

    setLoading(false);
  };

  // Créer le document
  const createDocument = async () => {
    if (!selectedClient || lignes.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
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
    } catch (e) {
      setError(String(e));
    }

    setLoading(false);
  };

  // Reset
  const reset = () => {
    setMode('select');
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

  // Ajouter ligne manuelle
  const addLigne = () => {
    setLignes([...lignes, { description: '', quantite: 1, prixUnitaire: 0, montant: 0 }]);
  };

  const updateLigne = (i: number, field: string, value: string | number) => {
    const updated = [...lignes];
    const l = { ...updated[i], [field]: value };
    if (field === 'quantite' || field === 'prixUnitaire') {
      l.montant = l.quantite * l.prixUnitaire;
    }
    updated[i] = l;
    setLignes(updated);
  };

  const removeLigne = (i: number) => {
    setLignes(lignes.filter((_, idx) => idx !== i));
  };

  // Document créé - Affichage succès
  if (createdDoc) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold mb-2">
              {createdDoc.type === 'FACTURE' ? 'Facture' : 'Avoir'} créé(e) !
            </h1>
            <p className="text-gray-400">{createdDoc.numeroComplet}</p>
          </div>

          {/* Aperçu */}
          <div className="bg-white text-black rounded-2xl p-8 mb-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-sm text-gray-500">Client</p>
                <p className="font-bold">{createdDoc.client.raisonSociale}</p>
                <p className="text-sm text-gray-500">{createdDoc.client.numDossier}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{fmt(createdDoc.montantTTC)}</p>
                <p className="text-sm text-gray-500">TTC</p>
              </div>
            </div>

            <div className="border-t pt-4">
              {createdDoc.lignes.map((l, i) => (
                <div key={i} className="flex justify-between py-2 text-sm">
                  <span>{l.quantite}x {l.description}</span>
                  <span>{fmt(l.montant)}</span>
                </div>
              ))}
            </div>

            {createdDoc.reduction > 0 && (
              <div className="flex justify-between py-2 text-red-500">
                <span>Réduction</span>
                <span>-{fmt(createdDoc.reduction)}</span>
              </div>
            )}

            <div className="border-t mt-4 pt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>HT</span><span>{fmt(createdDoc.montantHT)}</span>
              </div>
              <div className="flex justify-between">
                <span>TVA 20%</span><span>{fmt(createdDoc.montantTVA)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2">
                <span>TTC</span><span>{fmt(createdDoc.montantTTC)}</span>
              </div>
            </div>
          </div>

          {createdDoc.stripePaymentLink && (
            <a
              href={createdDoc.stripePaymentLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-white text-black rounded-xl font-medium mb-4 hover:bg-gray-100 transition"
            >
              <ExternalLink className="w-5 h-5" />
              Lien de paiement Stripe
            </a>
          )}

          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 w-full py-4 border border-white/20 rounded-xl hover:bg-white/5 transition"
          >
            <RefreshCw className="w-5 h-5" />
            Nouveau document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">SmartCompta</h1>
            <p className="text-sm text-gray-500">Facturation vocale</p>
          </div>
          
          {/* Toggle Facture / Avoir */}
          <div className="flex bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setDocType('FACTURE')}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                docType === 'FACTURE' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Facture
            </button>
            <button
              onClick={() => setDocType('AVOIR')}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                docType === 'AVOIR' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4 inline mr-2" />
              Avoir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Colonne gauche - Client + Micro */}
          <div className="space-y-6">
            {/* Sélection client */}
            <div className="bg-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Client</h2>
                <button
                  onClick={() => setShowAddClient(true)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter
                </button>
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
                    {clients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedClient(c); setMode('create'); }}
                        className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition text-left"
                      >
                        <div>
                          <p className="font-medium">{c.raisonSociale}</p>
                          <p className="text-sm text-gray-500">{c.numDossier}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      </button>
                    ))}
                    {clients.length === 0 && (
                      <p className="text-center text-gray-500 py-8">Aucun client</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Zone Micro */}
            {selectedClient && (
              <div className="bg-white/5 rounded-2xl p-8">
                <div className="text-center">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={loading}
                    className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto transition-all ${
                      isRecording 
                        ? 'bg-red-500 recording-pulse' 
                        : 'bg-white hover:scale-105'
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
                    {loading ? 'Traitement...' : isRecording ? 'Parlez...' : 'Cliquez pour dicter'}
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

          {/* Colonne droite - Lignes + Total */}
          <div className="space-y-6">
            {/* Lignes */}
            <div className="bg-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Lignes</h2>
                <button onClick={addLigne} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                  <Plus className="w-4 h-4" />
                  Ajouter
                </button>
              </div>

              {lignes.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  Dictez ou ajoutez des lignes
                </p>
              ) : (
                <div className="space-y-3">
                  {lignes.map((l, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={l.description}
                        onChange={(e) => updateLigne(i, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-[3] px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30"
                      />
                      <input
                        type="number"
                        value={l.quantite}
                        onChange={(e) => updateLigne(i, 'quantite', Number(e.target.value))}
                        className="w-16 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-center focus:outline-none"
                      />
                      <input
                        type="number"
                        value={l.prixUnitaire || ''}
                        onChange={(e) => updateLigne(i, 'prixUnitaire', Number(e.target.value))}
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
                    value={reduction || ''}
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
                className="w-full mt-6 py-4 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Créer {docType === 'FACTURE' ? 'la facture' : "l'avoir"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Ajouter Client */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Ajouter un client</h2>
              <button onClick={() => setShowAddClient(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Par URL */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                <Link className="w-4 h-4 inline mr-1" />
                Depuis une URL (Pappers, Societe.com...)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.pappers.fr/entreprise/..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
                <button
                  onClick={addClientByUrl}
                  disabled={loading || !urlInput}
                  className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {loading ? '...' : 'Importer'}
                </button>
              </div>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-zinc-900 text-sm text-gray-500">ou</span>
              </div>
            </div>

            {/* Manuel */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Numéro de dossier</label>
                <input
                  type="text"
                  value={manualClient.numDossier}
                  onChange={(e) => setManualClient({ ...manualClient, numDossier: e.target.value.toUpperCase() })}
                  placeholder="Ex: AB1234"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Raison sociale</label>
                <input
                  type="text"
                  value={manualClient.raisonSociale}
                  onChange={(e) => setManualClient({ ...manualClient, raisonSociale: e.target.value })}
                  placeholder="Nom de l'entreprise"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">SIRET (optionnel)</label>
                <input
                  type="text"
                  value={manualClient.siret}
                  onChange={(e) => setManualClient({ ...manualClient, siret: e.target.value })}
                  placeholder="12345678901234"
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
