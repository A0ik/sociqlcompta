'use client';

import { useState, useEffect } from 'react';
import { Check, X, AlertCircle, CreditCard, Plus, Trash2 } from 'lucide-react';

interface Client {
  id: string;
  numDossier: string;
  raisonSociale: string;
  adresse?: string | null;
  siret?: string | null;
}

interface LigneFacture {
  description: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

interface FactureFormData {
  numDossier: string;
  lignes: LigneFacture[];
  reduction: number;
}

interface ExtractionData {
  numDossier: string;
  lignes: LigneFacture[];
  reduction: number;
  sousTotal: number;
  montantHT: number;
}

interface FactureFormProps {
  initialData?: Partial<ExtractionData>;
  selectedClient?: Client | null;
  onSubmit: (data: FactureFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function FactureForm({
  initialData,
  selectedClient,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: FactureFormProps) {
  const [formData, setFormData] = useState<FactureFormData>({
    numDossier: initialData?.numDossier || '',
    lignes: initialData?.lignes || [{ description: '', quantite: 1, prixUnitaire: 0, montant: 0 }],
    reduction: initialData?.reduction || 0,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientValide, setClientValide] = useState<Client | null>(selectedClient || null);

  // Mettre à jour quand les données initiales changent (depuis la transcription)
  useEffect(() => {
    if (initialData) {
      setFormData({
        numDossier: initialData.numDossier || formData.numDossier,
        lignes: initialData.lignes && initialData.lignes.length > 0 
          ? initialData.lignes 
          : [{ description: '', quantite: 1, prixUnitaire: 0, montant: 0 }],
        reduction: initialData.reduction || 0,
      });
    }
  }, [initialData]);

  // Mettre à jour quand un client est sélectionné dans la liste
  useEffect(() => {
    if (selectedClient) {
      setFormData(prev => ({ ...prev, numDossier: selectedClient.numDossier }));
      setClientValide(selectedClient);
      setErrors(prev => ({ ...prev, numDossier: '' }));
    }
  }, [selectedClient]);

  // Vérifier le dossier quand le numéro change
  useEffect(() => {
    const verifierDossier = async () => {
      if (!formData.numDossier || formData.numDossier.length < 2) {
        setClientValide(null);
        return;
      }

      try {
        const response = await fetch('/api/dossiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numDossier: formData.numDossier }),
        });
        
        const data = await response.json();
        
        if (data.success && data.client) {
          setClientValide(data.client);
          setErrors(prev => ({ ...prev, numDossier: '' }));
        } else {
          setClientValide(null);
          setErrors(prev => ({ ...prev, numDossier: 'Dossier non trouvé' }));
        }
      } catch {
        setClientValide(null);
      }
    };

    const debounce = setTimeout(verifierDossier, 500);
    return () => clearTimeout(debounce);
  }, [formData.numDossier]);

  // Calculs
  const sousTotal = formData.lignes.reduce((sum, l) => sum + l.montant, 0);
  const montantHT = Math.max(0, sousTotal - formData.reduction);
  const montantTVA = montantHT * 0.20;
  const montantTTC = montantHT + montantTVA;

  // Mettre à jour une ligne
  const updateLigne = (index: number, field: keyof LigneFacture, value: string | number) => {
    const newLignes = [...formData.lignes];
    const ligne = { ...newLignes[index] };
    
    if (field === 'description') {
      ligne.description = value as string;
    } else if (field === 'quantite') {
      ligne.quantite = Math.max(1, Number(value) || 1);
      ligne.montant = ligne.quantite * ligne.prixUnitaire;
    } else if (field === 'prixUnitaire') {
      ligne.prixUnitaire = Math.max(0, Number(value) || 0);
      ligne.montant = ligne.quantite * ligne.prixUnitaire;
    }
    
    newLignes[index] = ligne;
    setFormData({ ...formData, lignes: newLignes });
  };

  // Ajouter une ligne
  const addLigne = () => {
    setFormData({
      ...formData,
      lignes: [...formData.lignes, { description: '', quantite: 1, prixUnitaire: 0, montant: 0 }],
    });
  };

  // Supprimer une ligne
  const removeLigne = (index: number) => {
    if (formData.lignes.length > 1) {
      const newLignes = formData.lignes.filter((_, i) => i !== index);
      setFormData({ ...formData, lignes: newLignes });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Record<string, string> = {};
    
    if (!formData.numDossier) {
      newErrors.numDossier = 'Numéro de dossier requis';
    } else if (!clientValide) {
      newErrors.numDossier = 'Dossier non trouvé dans la base';
    }
    
    const lignesValides = formData.lignes.filter(l => l.description && l.montant > 0);
    if (lignesValides.length === 0) {
      newErrors.lignes = 'Au moins une ligne avec description et montant requise';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({
      ...formData,
      lignes: lignesValides,
    });
  };

  const formatMontant = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Numéro de dossier */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Numéro de dossier
        </label>
        <div className="relative">
          <input
            type="text"
            value={formData.numDossier}
            onChange={(e) => setFormData({ ...formData, numDossier: e.target.value.toUpperCase() })}
            className={`
              w-full px-4 py-3 rounded-xl border-2 
              focus:outline-none transition-all
              ${errors.numDossier 
                ? 'border-red-300 focus:border-red-500' 
                : clientValide 
                  ? 'border-green-300 focus:border-green-500' 
                  : 'border-gray-200 focus:border-black'
              }
            `}
            placeholder="Ex: AM0028"
          />
          {clientValide && (
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
          )}
          {errors.numDossier && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
          )}
        </div>
        {clientValide && (
          <p className="mt-2 text-sm text-green-600">
            ✓ {clientValide.raisonSociale}
          </p>
        )}
        {errors.numDossier && (
          <p className="mt-2 text-sm text-red-500">{errors.numDossier}</p>
        )}
      </div>

      {/* Lignes de facturation */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Détail des prestations
          </label>
          <button
            type="button"
            onClick={addLigne}
            className="flex items-center gap-1 text-sm text-black hover:text-gray-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter une ligne
          </button>
        </div>
        
        <div className="space-y-3">
          {formData.lignes.map((ligne, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-[3]">
                <input
                  type="text"
                  value={ligne.description}
                  onChange={(e) => updateLigne(index, 'description', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-black text-sm"
                  placeholder="Description"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  value={ligne.quantite}
                  onChange={(e) => updateLigne(index, 'quantite', e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-black text-sm text-center"
                  placeholder="Qté"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  value={ligne.prixUnitaire || ''}
                  onChange={(e) => updateLigne(index, 'prixUnitaire', e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-black text-sm text-right"
                  placeholder="Prix €"
                />
              </div>
              <div className="flex-1 flex items-center justify-end gap-2">
                <span className="text-sm font-medium text-gray-700 min-w-[70px] text-right">
                  {formatMontant(ligne.montant)}
                </span>
                {formData.lignes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLigne(index)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {errors.lignes && (
          <p className="mt-2 text-sm text-red-500">{errors.lignes}</p>
        )}
      </div>

      {/* Réduction */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Réduction (€)
        </label>
        <input
          type="number"
          value={formData.reduction || ''}
          onChange={(e) => setFormData({ ...formData, reduction: parseFloat(e.target.value) || 0 })}
          step="0.01"
          min="0"
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-black transition-all"
          placeholder="0.00"
        />
      </div>

      {/* Récapitulatif des montants */}
      {sousTotal > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Sous-total</span>
            <span className="font-medium">{formatMontant(sousTotal)}</span>
          </div>
          {formData.reduction > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Réduction</span>
              <span>- {formatMontant(formData.reduction)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="text-gray-600">Montant HT</span>
            <span className="font-medium">{formatMontant(montantHT)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">TVA (20%)</span>
            <span className="font-medium">{formatMontant(montantTVA)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="font-semibold">Total TTC</span>
            <span className="font-bold text-lg">{formatMontant(montantTTC)}</span>
          </div>
        </div>
      )}

      {/* Boutons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="
            flex-1 px-4 py-3 rounded-xl
            border-2 border-gray-200 text-gray-600
            hover:bg-gray-50 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
          "
        >
          <X className="w-5 h-5" />
          Annuler
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !clientValide}
          className="
            flex-1 px-4 py-3 rounded-xl
            bg-black text-white font-medium
            hover:bg-gray-800 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
          "
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Création...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Créer la facture
            </>
          )}
        </button>
      </div>
    </form>
  );
}
