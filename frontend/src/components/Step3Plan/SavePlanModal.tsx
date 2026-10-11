import React, { useState } from 'react';
import { History, X, AlertCircle, Loader2 } from 'lucide-react';
import { Campus, EventDetails, PredictionResult } from '../../types/bunbetsu';

interface SavePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventName: string, templateName?: string) => Promise<void>;
  campus: Campus;
  eventDetails: EventDetails;
  locationsCount: number;
  prediction: PredictionResult | null;
  isGuest?: boolean;
}

export const SavePlanModal: React.FC<SavePlanModalProps> = ({
  isOpen,
  onClose,
  onSave,
  campus,
  eventDetails,
  locationsCount,
  prediction,
  isGuest = false,
}) => {
  const initialName = eventDetails.festName.trim() || `${campus.name} Event`;

  const [eventName, setEventName] = useState(initialName);
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) {
      setErrorMessage('Please provide an event name.');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      await onSave(eventName.trim(), templateName.trim() || undefined);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save event to history. Please try again.');
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
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-[#103822]">
                {isGuest ? 'Sign in required' : 'Save to Event History'}
              </h3>
              <p className="text-[11px] text-[#667267] font-medium">
                {isGuest ? 'Guest planner restriction' : 'Archive this complete plan snapshot'}
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
              <p className="font-bold">Event history requires an account</p>
              <p className="text-[11px] text-amber-800">
                You are currently using Bunbetsu as a guest. Saving plans to your event history requires signing in so waste predictions, spatial bin allocations, and route layouts can be preserved and reviewed anytime.
              </p>
            </div>
            <p className="text-xs text-[#5A6E62]">
              You can still review the plan, explore heatmaps, and export recommendations in this session.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#004B20] hover:bg-[#003B19] text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Continue as guest
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Save Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Plan Snapshot Summary Preview */}
            <div className="bg-[#F7F9F5] rounded-xl p-3 border border-[#E1E8DE] text-xs space-y-1.5">
              <div className="flex justify-between text-[#5F7366]">
                <span>Campus:</span>
                <span className="font-semibold text-[#103822] truncate max-w-[200px]">
                  {campus.name}
                </span>
              </div>
              <div className="flex justify-between text-[#5F7366]">
                <span>Configured zones:</span>
                <span className="font-semibold text-[#103822]">
                  {locationsCount} {locationsCount === 1 ? 'location' : 'locations'}
                </span>
              </div>
              {eventDetails.expectedFootfall > 0 && (
                <div className="flex justify-between text-[#5F7366]">
                  <span>Daily footfall:</span>
                  <span className="font-semibold text-[#103822]">
                    {eventDetails.expectedFootfall.toLocaleString()} attendees ({eventDetails.durationDays}d)
                  </span>
                </div>
              )}
              {prediction && (
                <div className="flex justify-between text-[#5F7366]">
                  <span>Total waste estimate:</span>
                  <span className="font-semibold text-[#103822]">
                    {prediction.totalWasteTonnes?.mean?.toFixed(2) || '0.00'} tonnes ({Math.round(prediction.total_waste_kg?.central || 0).toLocaleString()} kg)
                  </span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Event Name Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="event-history-name"
                className="block text-xs font-bold text-[#103822]"
              >
                Event display name <span className="text-red-500">*</span>
              </label>
              <input
                id="event-history-name"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g., Techfest 2026 Finals"
                disabled={isSaving}
                className="w-full px-3 py-2 text-xs border border-[#C5D3C1] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#004B20]/20 focus:border-[#004B20] transition bg-white"
                autoFocus
              />
            </div>

            {/* Optional Template Association */}
            <div className="space-y-1.5">
              <label
                htmlFor="event-history-template-name"
                className="block text-xs font-bold text-[#5F7366]"
              >
                Associated template name <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                id="event-history-template-name"
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Annual Techfest Archetype"
                disabled={isSaving}
                className="w-full px-3 py-2 text-xs border border-[#C5D3C1] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#004B20]/20 focus:border-[#004B20] transition bg-white"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E1E8DE]">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-2 text-xs font-semibold text-[#5F7366] hover:text-[#202820] hover:bg-neutral-100 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !eventName.trim()}
                className="px-4 py-2 bg-[#004B20] hover:bg-[#003B19] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving plan...</span>
                  </>
                ) : (
                  <span>Save to History</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

