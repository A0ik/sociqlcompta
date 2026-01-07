'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Plus, Search, Link, FileText, RefreshCw, 
  Trash2, Check, X, Building2, CreditCard, Receipt,
  ChevronRight, ExternalLink, Upload, FileSpreadsheet,
  Copy, Phone, Mail, MapPin
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
  type: 'FACTURE' | 'AVOIR' | 'DEVIS';
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
const fmtDate = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));

// Config entreprise (à personnaliser)
const ENTREPRISE = {
  nom: "Live & Best Consulting",
  adresse: "19 AVENUE JEAN MOULIN, 93100 MONTREUIL",
  siret: "805 360 963 00021",
  telephone: "06 58 67 06 46",
  email: "Liveandbest@gmail.com"
};

export default function Home() {
  // États principaux
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [docType, setDocType] = useState<'FACTURE' | 'AVOIR' | 'DEVIS'>('FACTURE');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // États lignes
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [reduction, setReduction] = useState(0);
  const [texteManuel, setTexteManuel] = useState('');
  
  // États audio - AMÉLIORÉ
  const [isRecording, setIsRecording] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // États UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdDoc, setCreatedDoc] = useState<Document | null>(null);
  
  // Modal ajout client
  const [showAddClient, setShowAddClient] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [manualClient, setManualClient] = useState({ numDossier: '', raisonSociale: '', siret: '', adresse: '' });

  // Charger les clients
  const loadClients = useCallback(async () => {
    try {
      const res = await fetch(`/api/dossiers?search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch (e) {
      console.error(e);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Debounce recherche
  useEffect(() => {
    const timer = setTimeout(() => loadClients(), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadClients]);

  // =============== ENREGISTREMENT AUDIO AMÉLIORÉ ===============
  const startRecording = async () => {
    try {
      setError(null);
      setAudioStatus('Accès au micro...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      
      setAudioStatus('🎙️ Parlez maintenant...');
      
      // Trouver le format supporté
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
      
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        
        if (audioChunksRef.current.length === 0) {
          setError('Aucun audio enregistré');
          setAudioStatus('');
          return;
        }
        
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        
        if (blob.size < 1000) {
          setError('Enregistrement trop court');
          setAudioStatus('');
          return;
        }
        
        await processAudio(blob);
      };
      
      recorder.onerror = () => {
        setError('Erreur d\'enregistrement');
        setIsRecording(false);
        setAudioStatus('');
      };
      
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      if (e.name === 'NotAllowedError') {
        setError('Micro refusé. Autorisez l\'accès dans votre navigateur.');
      } else if (e.name === 'NotFoundError') {
        setError('Aucun microphone détecté.');
      } else {
        setError(`Erreur: ${e.message}`);
      }
      setAudioStatus('');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      setAudioStatus('Traitement...');
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setLoading(true);
    setAudioStatus('Transcription en cours...');
    
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur transcription');
      }
      
      if (!data.transcription?.trim()) {
        setError('Aucune parole détectée. Parlez plus fort.');
        setAudioStatus('');
        setLoading(false);
        return;
      }
      
      setTranscriptions(prev => [...prev, data.transcription]);
      setAudioStatus('Extraction des lignes...');
      
      // Extraction
      const extRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', texte: data.transcription }),
      });
      const extData = await extRes.json();
      
      if (extData.lignes?.length) {
        setLignes(prev => [...prev, ...extData.lignes]);
        if (extData.reduction) setReduction(r => r + extData.reduction);
        setSuccess(`${extData.lignes.length} ligne(s) ajoutée(s)`);
      } else {
        setSuccess('Transcrit. Ajoutez les lignes manuellement.');
      }
      
      setTimeout(() => setSuccess(null), 3000);
      setAudioStatus('');
      
    } catch (e: unknown) {
      setError((e as Error).message || 'Erreur');
      setAudioStatus('');
    }
    
    setLoading(false);
  };

  // Extraire depuis texte manuel
  const extractFromText = async () => {
    if (!texteManuel.trim()) return;
    setLoading(true);
    
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', texte: texteManuel }),
      });
      const data = await res.json();
      
      if (data.lignes?.length) {
        setLignes(prev => [...prev, ...data.lignes]);
        setTexteManuel('');
        setSuccess(`${data.lignes.length} ligne(s) extraite(s)`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Pas de lignes extraites');
      }
    } catch {
      setError('Erreur extraction');
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
        setSuccess('Client importé !');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Erreur extraction');
      }
    } catch {
      setError('Erreur import');
    }

    setLoading(false);
  };

  // Ajouter client manuellement
  const addClientManual = async () => {
    if (!manualClient.numDossier || !manualClient.raisonSociale) {
      setError('Numéro et raison sociale requis');
      return;
    }
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
        setManualClient({ numDossier: '', raisonSociale: '', siret: '', adresse: '' });
        setMode('create');
      } else {
        setError(data.error);
      }
    } catch {
      setError('Erreur création');
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
    } catch {
      setError('Erreur création');
    }

    setLoading(false);
  };

  // Reset
  const reset = () => {
    setSelectedClient(null);
    setLignes([]);
    setReduction(0);
    setTranscriptions([]);
    setTexteManuel('');
    setCreatedDoc(null);
    setError(null);
    setMode('select');
  };

  // Calculs
  const sousTotal = lignes.reduce((s, l) => s + l.montant, 0);
  const montantHT = Math.max(0, sousTotal - reduction);
  const montantTVA = montantHT * 0.2;
  const montantTTC = montantHT + montantTVA;

  // Gestion lignes
  const addLigne = () => setLignes([...lignes, { description: '', quantite: 1, prixUnitaire: 0, montant: 0 }]);
  
  const updateLigne = (i: number, field: string, value: string | number) => {
    const updated = [...lignes];
    const l = { ...updated[i], [field]: value };
    if (field === 'quantite' || field === 'prixUnitaire') {
      l.montant = l.quantite * l.prixUnitaire;
    }
    updated[i] = l;
    setLignes(updated);
  };

  const removeLigne = (i: number) => setLignes(lignes.filter((_, idx) => idx !== i));

  // Copier lien
  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setSuccess('Lien copié !');
    setTimeout(() => setSuccess(null), 2000);
  };

  // =============== PRÉVISUALISATION DOCUMENT PRO ===============
  if (createdDoc) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Actions */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={reset} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <RefreshCw className="w-5 h-5" /> Nouveau document
            </button>
            {createdDoc.stripePaymentLink && (
              <button onClick={() => copyLink(createdDoc.stripePaymentLink!)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow hover:shadow-md">
                <Copy className="w-4 h-4" /> Copier le lien
              </button>
            )}
          </div>

          {/* Succès */}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Check className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">{createdDoc.type} créé(e) !</p>
              <p className="text-sm text-green-600">{createdDoc.numeroComplet}</p>
            </div>
          </div>

          {/* Document */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold mb-3">{ENTREPRISE.nom}</h1>
                  <div className="flex items-center gap-2 text-gray-300 text-sm mb-1">
                    <MapPin className="w-4 h-4" />{ENTREPRISE.adresse}
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 text-sm mb-1">
                    <Phone className="w-4 h-4" />{ENTREPRISE.telephone}
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 text-sm mb-1">
                    <Mail className="w-4 h-4" />{ENTREPRISE.email}
                  </div>
                  <p className="text-gray-400 text-sm mt-2">SIRET: {ENTREPRISE.siret}</p>
                </div>
                <div className="text-right">
                  <div className="inline-block bg-white/10 backdrop-blur rounded-xl px-6 py-4">
                    <p className="text-3xl font-bold tracking-wider">{createdDoc.type}</p>
                    <p className="text-xl text-gray-300 mt-1">{createdDoc.numeroComplet}</p>
                  </div>
                  <p className="text-gray-400 mt-4">{fmtDate(createdDoc.date)}</p>
                </div>
              </div>
            </div>

            {/* Client */}
            <div className="p-8 border-b border-gray-100">
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">Destinataire</p>
                <h2 className="text-xl font-bold text-gray-900 mb-1">{createdDoc.client.raisonSociale}</h2>
                <p className="text-gray-600 text-sm">Dossier: {createdDoc.client.numDossier}</p>
                {createdDoc.client.adresse && <p className="text-gray-600 text-sm mt-2">{createdDoc.client.adresse}</p>}
                {createdDoc.client.siret && <p className="text-gray-500 text-sm mt-1">SIRET: {createdDoc.client.siret}</p>}
              </div>
            </div>

            {/* Lignes */}
            <div className="p-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left py-4 font-semibold">Description</th>
                    <th className="text-center py-4 font-semibold w-20">Qté</th>
                    <th className="text-right py-4 font-semibold w-32">P.U.</th>
                    <th className="text-right py-4 font-semibold w-32">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {createdDoc.lignes.map((l, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-4 text-gray-700">{l.description}</td>
                      <td className="py-4 text-center text-gray-600">{l.quantite}</td>
                      <td className="py-4 text-right text-gray-600">{fmt(l.prixUnitaire)}</td>
                      <td className="py-4 text-right font-medium text-gray-900">{fmt(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totaux */}
              <div className="mt-8 flex justify-end">
                <div className="w-80 space-y-3">
                  <div className="flex justify-between text-gray-600"><span>Sous-total</span><span>{fmt(createdDoc.sousTotal)}</span></div>
                  {createdDoc.reduction > 0 && <div className="flex justify-between text-red-600"><span>Remise</span><span>-{fmt(createdDoc.reduction)}</span></div>}
                  <div className="flex justify-between text-gray-600"><span>Total HT</span><span>{fmt(createdDoc.montantHT)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>TVA 20%</span><span>{fmt(createdDoc.montantTVA)}</span></div>
                  <div className="flex justify-between pt-4 border-t-2 border-gray-900">
                    <span className="text-xl font-bold">Total TTC</span>
                    <span className="text-xl font-bold">{fmt(createdDoc.montantTTC)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stripe */}
            {createdDoc.stripePaymentLink && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-8 border-t border-green-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-green-800">Paiement en ligne</p>
                    <p className="text-sm text-green-600">Partagez ce lien</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => copyLink(createdDoc.stripePaymentLink!)} className="flex items-center gap-2 px-4 py-2 bg-white border border-green-200 rounded-lg hover:bg-green-50">
                      <Copy className="w-4 h-4" />Copier
                    </button>
                    <a href={createdDoc.stripePaymentLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                      <ExternalLink className="w-4 h-4" />Ouvrir
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-6 text-center text-sm text-gray-500">
              Document généré par {ENTREPRISE.nom}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =============== INTERFACE PRINCIPALE ===============
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <span className="font-bold">SC</span>
            </div>
            <span className="font-semibold text-lg">SociQl Compta</span>
          </div>
          {selectedClient && (
            <button onClick={reset} className="text-gray-400 hover:text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Nouveau
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="max-w-6xl mx-auto px-4">
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
          </div>
        )}
        {success && (
          <div className="mt-4 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4" />{success}
          </div>
        )}
      </div>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Sélection client */}
        {mode === 'select' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Créer un document</h1>
              <p className="text-gray-400">Sélectionnez ou ajoutez un client</p>
            </div>

            <div className="bg-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Clients</h2>
                <button onClick={() => setShowAddClient(true)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>

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

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedClient(c); setMode('create'); }}
                    className="w-full flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 text-left"
                  >
                    <div>
                      <p className="font-medium">{c.raisonSociale}</p>
                      <p className="text-sm text-gray-500">{c.numDossier}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  </button>
                ))}
                {clients.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Aucun client</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Création document */}
        {mode === 'create' && selectedClient && (
          <>
            {/* Type de document */}
            <div className="flex justify-center mb-6">
              <div className="flex bg-white/5 rounded-xl p-1">
                {(['FACTURE', 'DEVIS', 'AVOIR'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`px-6 py-2.5 rounded-lg font-medium transition ${docType === t ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    {t === 'FACTURE' && <FileText className="w-4 h-4 inline mr-2" />}
                    {t === 'DEVIS' && <FileSpreadsheet className="w-4 h-4 inline mr-2" />}
                    {t === 'AVOIR' && <Receipt className="w-4 h-4 inline mr-2" />}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Colonne gauche */}
              <div className="space-y-6">
                {/* Client sélectionné */}
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Client</p>
                      <p className="font-semibold text-lg">{selectedClient.raisonSociale}</p>
                      <p className="text-sm text-gray-500">{selectedClient.numDossier}</p>
                    </div>
                    <button onClick={() => setMode('select')} className="text-gray-400 hover:text-white">
                      Changer
                    </button>
                  </div>
                </div>

                {/* Dictée vocale */}
                <div className="bg-white/5 rounded-2xl p-6">
                  <h2 className="font-semibold mb-4">🎙️ Dictée vocale</h2>
                  
                  <div className="text-center mb-6">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={loading}
                      className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto transition-all shadow-xl ${
                        isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-purple-500 to-blue-500 hover:scale-105'
                      }`}
                    >
                      {loading ? (
                        <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                      ) : isRecording ? (
                        <MicOff className="w-10 h-10 text-white" />
                      ) : (
                        <Mic className="w-10 h-10 text-white" />
                      )}
                    </button>
                    <p className="mt-4 text-sm text-gray-400">
                      {audioStatus || (isRecording ? 'Cliquez pour arrêter' : 'Cliquez pour parler')}
                    </p>
                  </div>

                  {/* Transcriptions */}
                  {transcriptions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">Transcriptions :</p>
                      {transcriptions.map((t, i) => (
                        <div key={i} className="text-sm text-gray-300 bg-white/5 rounded-lg p-3 mb-2">"{t}"</div>
                      ))}
                      <button
                        onClick={startRecording}
                        disabled={isRecording || loading}
                        className="text-sm text-purple-400 hover:text-purple-300 mt-2"
                      >
                        + Continuer la dictée
                      </button>
                    </div>
                  )}

                  {/* Texte manuel */}
                  <div className="border-t border-white/10 pt-4 mt-4">
                    <p className="text-xs text-gray-500 mb-2">Ou saisissez manuellement :</p>
                    <textarea
                      value={texteManuel}
                      onChange={(e) => setTexteManuel(e.target.value)}
                      placeholder="Ex: Prestation web 5 jours à 400€, réduction 50€..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none resize-none h-24"
                    />
                    <button
                      onClick={extractFromText}
                      disabled={!texteManuel.trim() || loading}
                      className="w-full mt-2 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 disabled:opacity-50"
                    >
                      Extraire les lignes
                    </button>
                  </div>
                </div>
              </div>

              {/* Colonne droite */}
              <div className="space-y-6">
                {/* Lignes */}
                <div className="bg-white/5 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Lignes</h2>
                    <button onClick={addLigne} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                      <Plus className="w-4 h-4" /> Ajouter
                    </button>
                  </div>

                  {lignes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p>Dictez ou ajoutez des lignes</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lignes.map((l, i) => (
                        <div key={i} className="flex gap-2 items-start bg-white/5 rounded-xl p-3">
                          <input
                            type="text"
                            value={l.description}
                            onChange={(e) => updateLigne(i, 'description', e.target.value)}
                            placeholder="Description"
                            className="flex-1 px-3 py-2 bg-transparent border border-white/10 rounded-lg text-sm focus:outline-none"
                          />
                          <input
                            type="number"
                            value={l.quantite}
                            onChange={(e) => updateLigne(i, 'quantite', Number(e.target.value))}
                            className="w-16 px-2 py-2 bg-transparent border border-white/10 rounded-lg text-sm text-center focus:outline-none"
                            min="1"
                          />
                          <input
                            type="number"
                            value={l.prixUnitaire || ''}
                            onChange={(e) => updateLigne(i, 'prixUnitaire', Number(e.target.value))}
                            placeholder="€"
                            className="w-24 px-2 py-2 bg-transparent border border-white/10 rounded-lg text-sm text-right focus:outline-none"
                          />
                          <span className="w-24 py-2 text-right text-sm font-medium">{fmt(l.montant)}</span>
                          <button onClick={() => removeLigne(i)} className="p-2 text-gray-500 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Réduction */}
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-sm text-gray-400">Réduction (€)</span>
                    <input
                      type="number"
                      value={reduction || ''}
                      onChange={(e) => setReduction(Number(e.target.value))}
                      className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-right focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Total */}
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-6">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-400"><span>Sous-total</span><span>{fmt(sousTotal)}</span></div>
                    {reduction > 0 && <div className="flex justify-between text-red-400"><span>Réduction</span><span>-{fmt(reduction)}</span></div>}
                    <div className="flex justify-between text-gray-400"><span>HT</span><span>{fmt(montantHT)}</span></div>
                    <div className="flex justify-between text-gray-400"><span>TVA 20%</span><span>{fmt(montantTVA)}</span></div>
                    <div className="flex justify-between text-2xl font-bold pt-3 border-t border-white/10"><span>TTC</span><span>{fmt(montantTTC)}</span></div>
                  </div>

                  <button
                    onClick={createDocument}
                    disabled={lignes.length === 0 || loading}
                    className="w-full mt-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Créer {docType === 'FACTURE' ? 'la facture' : docType === 'DEVIS' ? 'le devis' : "l'avoir"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal Ajouter Client */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Ajouter un client</h2>
              <button onClick={() => setShowAddClient(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Par URL */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                <Link className="w-4 h-4 inline mr-1" />
                Import URL (Pappers, Societe.com...)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.pappers.fr/entreprise/..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none"
                />
                <button
                  onClick={addClientByUrl}
                  disabled={loading || !urlInput}
                  className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {loading ? '...' : 'Go'}
                </button>
              </div>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
              <div className="relative flex justify-center"><span className="px-4 bg-zinc-900 text-sm text-gray-500">ou</span></div>
            </div>

            {/* Manuel */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">N° Dossier *</label>
                  <input
                    type="text"
                    value={manualClient.numDossier}
                    onChange={(e) => setManualClient({ ...manualClient, numDossier: e.target.value.toUpperCase() })}
                    placeholder="AB1234"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SIRET</label>
                  <input
                    type="text"
                    value={manualClient.siret}
                    onChange={(e) => setManualClient({ ...manualClient, siret: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Raison sociale *</label>
                <input
                  type="text"
                  value={manualClient.raisonSociale}
                  onChange={(e) => setManualClient({ ...manualClient, raisonSociale: e.target.value })}
                  placeholder="Nom de l'entreprise"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Adresse</label>
                <input
                  type="text"
                  value={manualClient.adresse}
                  onChange={(e) => setManualClient({ ...manualClient, adresse: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none"
                />
              </div>
              <button
                onClick={addClientManual}
                disabled={loading || !manualClient.numDossier || !manualClient.raisonSociale}
                className="w-full py-4 bg-white text-black rounded-xl font-semibold hover:bg-gray-100 disabled:opacity-50"
              >
                {loading ? '...' : 'Créer le client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
