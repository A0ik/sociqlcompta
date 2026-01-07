'use client';

import { useState, useCallback } from 'react';
import { FileText, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Edit3 } from 'lucide-react';
import MicButton from '@/components/MicButton';
import DossierSearch from '@/components/DossierSearch';
import FactureForm from '@/components/FactureForm';
import FacturePreview from '@/components/FacturePreview';
import ImportDossiers from '@/components/ImportDossiers';

interface Client {
  id: string;
  numDossier: string;
  raisonSociale: string;
  adresse?: string | null;
  siret?: string | null;
  domaineActivite?: string | null;
}

interface LigneFacture {
  id?: string;
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

interface FactureData {
  numeroComplet: string;
  date: Date;
  lignes: LigneFacture[];
  sousTotal: number;
  reduction: number;
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  stripePaymentLink?: string | null;
  client: Client;
}

interface ExtractionData {
  numDossier: string;
  lignes: LigneFacture[];
  reduction: number;
  sousTotal: number;
  montantHT: number;
}

type Step = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'editing' | 'creating' | 'success';

export default function Dashboard() {
  const [step, setStep] = useState<Step>('idle');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isEditingTranscription, setIsEditingTranscription] = useState(false);
  const [editedTranscription, setEditedTranscription] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ExtractionData | null>(null);
  const [createdFacture, setCreatedFacture] = useState<FactureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Gérer l'enregistrement audio terminé
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setStep('transcribing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcribeRes = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const transcribeData = await transcribeRes.json();

      if (!transcribeData.success) {
        throw new Error(transcribeData.error || 'Erreur de transcription');
      }

      setTranscription(transcribeData.transcription);
      setEditedTranscription(transcribeData.transcription);
      
      // Extraire automatiquement
      await extractFromTranscription(transcribeData.transcription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStep('idle');
    }
  }, []);

  // Extraire les infos depuis une transcription
  const extractFromTranscription = async (text: string) => {
    setStep('extracting');
    
    try {
      const extractRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract',
          transcription: text,
        }),
      });

      const extractData = await extractRes.json();

      if (!extractData.success) {
        throw new Error(extractData.error || 'Erreur d\'extraction');
      }

      setExtractedData(extractData.extraction);
      
      if (extractData.client) {
        setSelectedClient(extractData.client);
      }

      setStep('editing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStep('idle');
    }
  };

  // Réextraire après modification de la transcription
  const handleReextract = async () => {
    setIsEditingTranscription(false);
    setTranscription(editedTranscription);
    await extractFromTranscription(editedTranscription);
  };

  // Créer la facture
  const handleCreateFacture = useCallback(async (data: { numDossier: string; lignes: LigneFacture[]; reduction: number }) => {
    setStep('creating');
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          numDossier: data.numDossier,
          lignes: data.lignes,
          reduction: data.reduction,
          genererStripe: true,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erreur de création');
      }

      setCreatedFacture({
        ...result.facture,
        date: new Date(result.facture.date),
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStep('editing');
    }
  }, []);

  // Annuler et réinitialiser
  const handleCancel = useCallback(() => {
    setStep('idle');
    setTranscription('');
    setEditedTranscription('');
    setExtractedData(null);
    setError(null);
    setIsEditingTranscription(false);
  }, []);

  // Nouvelle facture
  const handleNewFacture = useCallback(() => {
    setStep('idle');
    setTranscription('');
    setEditedTranscription('');
    setExtractedData(null);
    setCreatedFacture(null);
    setSelectedClient(null);
    setError(null);
    setIsEditingTranscription(false);
  }, []);

  const handleImportComplete = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <div className="split-layout min-h-screen">
      {/* Panel Gauche - Noir */}
      <div className="panel-dark flex flex-col h-screen">
        <header className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">SmartCompta</h1>
              <p className="text-sm text-gray-500">Facturation vocale</p>
            </div>
            <ImportDossiers onImportComplete={handleImportComplete} />
          </div>
        </header>

        <div className="flex-1 flex flex-col">
          {/* Section Micro */}
          <div className="p-8 border-b border-white/10">
            <div className="flex flex-col items-center">
              <MicButton
                onRecordingComplete={handleRecordingComplete}
                isProcessing={step === 'transcribing' || step === 'extracting'}
                disabled={step === 'creating'}
              />

              {/* Transcription éditable */}
              {transcription && step !== 'idle' && (
                <div className="mt-6 w-full max-w-md">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Transcription</p>
                    {!isEditingTranscription && step === 'editing' && (
                      <button
                        onClick={() => setIsEditingTranscription(true)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        Modifier
                      </button>
                    )}
                  </div>
                  
                  {isEditingTranscription ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedTranscription}
                        onChange={(e) => setEditedTranscription(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-white/40"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleReextract}
                          className="flex-1 px-3 py-1.5 bg-white text-black text-sm rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Réanalyser
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingTranscription(false);
                            setEditedTranscription(transcription);
                          }}
                          className="px-3 py-1.5 border border-white/20 text-white text-sm rounded-lg hover:bg-white/10 transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-300 italic bg-white/5 rounded-lg p-3">
                      &ldquo;{transcription}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {step !== 'idle' && step !== 'success' && (
                <div className="mt-4 text-sm text-gray-500">
                  {step === 'transcribing' && 'Transcription en cours...'}
                  {step === 'extracting' && 'Extraction des informations...'}
                  {step === 'editing' && 'Vérifiez et modifiez si nécessaire'}
                  {step === 'creating' && 'Création de la facture...'}
                </div>
              )}
            </div>
          </div>

          {/* Liste des dossiers */}
          <div className="flex-1 overflow-hidden p-6" key={refreshKey}>
            <DossierSearch
              onSelectClient={setSelectedClient}
              selectedClientId={selectedClient?.id}
            />
          </div>
        </div>
      </div>

      {/* Panel Droit - Blanc */}
      <div className="panel-light flex flex-col h-screen">
        <header className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-gray-400" />
            <div>
              <h2 className="font-semibold text-black">
                {step === 'success' ? 'Facture créée' : 'Nouvelle facture'}
              </h2>
              <p className="text-sm text-gray-500">
                {step === 'success' 
                  ? createdFacture?.numeroComplet 
                  : 'Dictez ou sélectionnez un dossier'
                }
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {step === 'idle' && !selectedClient && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <p className="text-center">
                Dictez une facture ou<br />sélectionnez un dossier
              </p>
            </div>
          )}

          {(step === 'editing' || step === 'creating' || (step === 'idle' && selectedClient)) && (
            <FactureForm
              initialData={extractedData || undefined}
              selectedClient={selectedClient}
              onSubmit={handleCreateFacture}
              onCancel={handleCancel}
              isSubmitting={step === 'creating'}
            />
          )}

          {step === 'success' && createdFacture && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-700">Facture créée avec succès !</p>
                  <p className="text-sm text-green-600 mt-1">
                    N° {createdFacture.numeroComplet} • {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(createdFacture.montantTTC)} TTC
                  </p>
                </div>
              </div>

              {createdFacture.stripePaymentLink && (
                <a
                  href={createdFacture.stripePaymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition-all"
                >
                  <ExternalLink className="w-5 h-5" />
                  Ouvrir le lien de paiement
                </a>
              )}

              <FacturePreview facture={createdFacture} />

              <button
                onClick={handleNewFacture}
                className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-600 px-6 py-3 rounded-xl hover:bg-gray-50 transition-all"
              >
                <RefreshCw className="w-5 h-5" />
                Nouvelle facture
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
