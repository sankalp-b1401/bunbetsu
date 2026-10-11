import React, { useState } from 'react';
import { Bookmark, X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Campus, CampusLocation, EventDetails, EntryGate } from '../../types/bunbetsu';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  campus: Campus;
  locations: CampusLocation[];
  eventDetails: EventDetails;
  entryGate: EntryGate | null;
  isGuest?: boolean;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  campus,
  locations,
  eventDetails,
  entryGate,
  isGuest = false,
}) => {
  const initialName = eventDetails.festName.trim()
    ? `${eventDetails.festName.trim()} Template`
    : `${campus.name} Setup`;

  const [templateName, setTemplateName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      setErrorMessage('Please provide a name for this template.');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      await onSave(templateName.trim());
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save template. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E1E8DE] w-full max-w-md overflow-hidden p-6 space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#EAF5E6] text-[#004B20] flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-[#103822]">
                {isGuest ? 'Sign in required' : 'Save as template'}
              </h3>
              <p className="text-[11px] text-[#667267] font-medium">
                {isGuest ? 'Guest planner restriction' : 'Reusable venue setup for future events'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-md text-[#667267] hover:text-[#202820] hover:bg-neutral-100 transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Guest Warning View */}
        {isGuest ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed space-y-1">
              <p className="font-bold">Templates require an account</p>
              <p className="text-[11px] text-amber-800">
                You are currently using Bunbetsu as a guest. Saving reusable templates requires signing in so your venue setups, activity allocations, and entry gates can be saved to your profile.
              </p>
            </div>
            <p className="text-xs text-[#5A6E62]">
              You can continue planning, configuring zones, and calculating waste predictions without saving.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#004B20] hover:bg-[#003B19] text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Continue planning as guest
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Save Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Configuration Snapshot Preview */}
            <div className="bg-[#F7F9F5] rounded-xl p-3 border border-[#E1E8DE] text-xs space-y-1.5">
              <div className="flex justify-between text-[#5F7366]">
                <span>Campus:</span>
                <span className="font-semibold text-[#103822] truncate max-w-[200px]">
                  {campus.name}
                </span>
              </div>
              <div className="flex justify-between text-[#5F7366]">
                <span>Configured locations:</span>
                <span className="font-semibold text-[#103822]">
                  {locations.length} {locations.length === 1 ? 'zone' : 'zones'}
                </span>
              </div>
              <div className="flex justify-between text-[#5F7366]">
                <span>Entry gate:</span>
                <span className="font-semibold text-[#103822]">
                  {entryGate ? 'Set' : 'Not set'}
                </span>
              </div>
              {eventDetails.durationDays > 0 && (
                <div className="flex justify-between text-[#5F7366]">
                  <span>Duration & Footfall:</span>
                  <span className="font-semibold text-[#103822]">
                    {eventDetails.durationDays}d • {eventDetails.expectedFootfall.toLocaleString()} attendees
                  </span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-tight">{errorMessage}</span>
              </div>
            )}

            {/* Template Name Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#183E28]">
                Template name
              </label>
              <input
                type="text"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Annual Fest Setup"
                disabled={isSaving}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#004B20] focus:ring-2 focus:ring-[#70D000]/25 text-xs text-[#113821] placeholder:text-[#95A79B] transition bg-white disabled:opacity-60 font-semibold"
                autoFocus
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#667267] hover:bg-neutral-100 transition cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !templateName.trim()}
                className="px-4 py-2 rounded-xl bg-[#004B20] hover:bg-[#003B19] active:bg-[#002B12] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save Template</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

