import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Download,
  Copy,
  Check,
  BarChart3,
  Trash2,
  Recycle,
  Apple,
  MapPin,
  Calendar,
  Users,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { PredictionResult } from '../types/bunbetsu';
import { formatArea } from '../utils/geoUtils';

interface PredictionPlanModalProps {
  result: PredictionResult;
  onClose: () => void;
}

export const PredictionPlanModal: React.FC<PredictionPlanModalProps> = ({
  result,
  onClose,
}) => {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'assumptions' | 'json'>('overview');

  const {
    totalAttendeeDays,
    baselineTotalKg,
    total_waste_kg,
    totalWasteKg,
    totalWasteTonnes,
    wasteBreakdown,
    composition_percent,
    recyclable_kg,
    disposable_kg,
    locationAllocations,
    assumptions,
    payload,
  } = result;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify({ request: payload, response: result }, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleDownloadPlan = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(
        JSON.stringify(
          {
            request_payload: payload,
            model_prediction: result,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bunbetsu-waste-plan-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-md shadow-2xl border border-[#E1E8DE] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-[#F7F9F5] border-b border-[#E1E8DE] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#004B20] text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-[#70D000]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-bold text-[#202820] leading-tight">
                  Bunbetsu Waste Prediction & Action Plan
                </h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/30">
                  FastAPI Model Output
                </span>
              </div>
              <p className="text-xs text-[#667267] font-medium">
                Grounded in the frozen Python mathematical model with spatial allocation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadPlan}
              className="p-2 text-[#667267] hover:text-[#202820] hover:bg-[#EAF5E6]/60 rounded transition cursor-pointer"
              title="Download Plan JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#667267] hover:text-[#202820] hover:bg-[#EAF5E6]/60 rounded transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="px-6 pt-3 bg-white border-b border-[#E1E8DE] flex items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-3 border-b-2 cursor-pointer transition font-sans ${
              activeTab === 'overview'
                ? 'border-[#004B20] text-[#004B20] font-bold'
                : 'border-transparent text-[#667267] hover:text-[#202820]'
            }`}
          >
            Waste Forecast & Streams
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('locations')}
            className={`pb-2.5 px-3 border-b-2 cursor-pointer transition font-sans ${
              activeTab === 'locations'
                ? 'border-[#004B20] text-[#004B20] font-bold'
                : 'border-transparent text-[#667267] hover:text-[#202820]'
            }`}
          >
            Location Allocations & Bins ({locationAllocations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('assumptions')}
            className={`pb-2.5 px-3 border-b-2 cursor-pointer transition font-sans ${
              activeTab === 'assumptions'
                ? 'border-[#004B20] text-[#004B20] font-bold'
                : 'border-transparent text-[#667267] hover:text-[#202820]'
            }`}
          >
            Model Assumptions ({assumptions?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`pb-2.5 px-3 border-b-2 cursor-pointer transition font-sans ${
              activeTab === 'json'
                ? 'border-[#004B20] text-[#004B20] font-bold'
                : 'border-transparent text-[#667267] hover:text-[#202820]'
            }`}
          >
            API Contract & JSON
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Summary Metrics Banner in 3 clean cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-[#F7F9F5] p-4.5 rounded-md border border-[#E1E8DE] space-y-1 shadow-2xs">
                  <div className="font-heading text-xs text-[#667267] font-semibold uppercase tracking-wider">
                    Expected Total Waste
                  </div>
                  <div className="font-heading text-2xl font-bold text-[#202820]">
                    {totalWasteTonnes.mean} <span className="text-sm font-semibold text-[#667267]">tonnes</span>
                  </div>
                  <div className="text-[11px] text-[#667267]">
                    Range: {totalWasteTonnes.min} – {totalWasteTonnes.max} t ({totalWasteKg.mean.toLocaleString()} kg)
                  </div>
                </div>

                <div className="bg-[#F7F9F5] p-4.5 rounded-md border border-[#E1E8DE] space-y-1 shadow-2xs">
                  <div className="font-heading text-xs text-[#667267] font-semibold uppercase tracking-wider">
                    Attendee-Days
                  </div>
                  <div className="font-heading text-2xl font-bold text-[#202820]">
                    {totalAttendeeDays.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#667267]">
                    {payload.total_footfall.toLocaleString()} people/day × {payload.duration_days} days
                  </div>
                </div>

                <div className="bg-[#F7F9F5] p-4.5 rounded-md border border-[#E1E8DE] space-y-1 shadow-2xs">
                  <div className="font-heading text-xs text-[#667267] font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Baseline Benchmark</span>
                    {result.baseline_source_year && (
                      <span className="text-[10px] font-normal text-[#667267]">
                        CPCB {result.baseline_source_year}
                      </span>
                    )}
                  </div>
                  <div className="font-heading text-2xl font-bold text-[#202820]">
                    {typeof result.baseline_rate_kg_per_person_day === 'number' && result.baseline_rate_kg_per_person_day > 0 ? (
                      <>
                        {result.baseline_rate_kg_per_person_day}{' '}
                        <span className="text-sm font-semibold text-[#667267]">kg/person/day</span>
                      </>
                    ) : (
                      <span className="text-sm font-normal text-amber-700">Unknown Rate</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#667267]">
                    {result.baseline_is_national_fallback ? (
                      <span className="text-amber-800">
                        CPCB national fallback · {result.campus_state || 'State'}
                      </span>
                    ) : (
                      <span>
                        CPCB state baseline · {result.campus_state || 'State'}
                      </span>
                    )}
                    {typeof result.baseline_rate_kg_per_person_day === 'number' && (
                      <span> · Pre-multiplier: {baselineTotalKg.toLocaleString()} kg</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recyclable vs Disposable Split Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-md space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Recycle className="w-4 h-4 text-emerald-700" />
                      <span>Total Recyclable Waste</span>
                    </span>
                    <span className="text-xs font-bold text-emerald-800">
                      {Math.round(recyclable_kg.central).toLocaleString()} kg
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-snug">
                    Comprising Plastic, Paper, and Glass. Central estimate:{' '}
                    <strong>{(recyclable_kg.central / 1000).toFixed(2)} tonnes</strong> (Range:{' '}
                    {(recyclable_kg.low / 1000).toFixed(2)} – {(recyclable_kg.high / 1000).toFixed(2)} t).
                  </p>
                </div>

                <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-md space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-amber-700" />
                      <span>Total Disposable / Organic Waste</span>
                    </span>
                    <span className="text-xs font-bold text-amber-800">
                      {Math.round(disposable_kg.central).toLocaleString()} kg
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Comprising Food & Organic waste and inert materials. Central estimate:{' '}
                    <strong>{(disposable_kg.central / 1000).toFixed(2)} tonnes</strong> (Range:{' '}
                    {(disposable_kg.low / 1000).toFixed(2)} – {(disposable_kg.high / 1000).toFixed(2)} t).
                  </p>
                </div>
              </div>

              {/* Waste Composition Breakdown (All 5 Frozen Model Categories) */}
              <div className="bg-white rounded-md border border-[#E1E8DE] p-5 space-y-3.5 shadow-2xs">
                <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
                  Predicted Waste Streams by Category (Python Model Priors)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {/* Food */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded space-y-1">
                    <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5 font-heading">
                      <Apple className="w-3.5 h-3.5 text-amber-700" />
                      <span>Food</span>
                    </div>
                    <div className="text-base font-bold text-amber-950 font-heading">
                      {wasteBreakdown.foodOrganicKg.toLocaleString()} kg
                    </div>
                    <div className="text-[10px] text-amber-800 font-medium">
                      {composition_percent['Food'] ? `${(composition_percent['Food'] * 100).toFixed(1)}%` : 'Organic stream'}
                    </div>
                  </div>

                  {/* Plastic */}
                  <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded space-y-1">
                    <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5 font-heading">
                      <Recycle className="w-3.5 h-3.5 text-blue-700" />
                      <span>Plastic</span>
                    </div>
                    <div className="text-base font-bold text-blue-950 font-heading">
                      {wasteBreakdown.plasticsKg.toLocaleString()} kg
                    </div>
                    <div className="text-[10px] text-blue-800 font-medium">
                      {composition_percent['Plastic'] ? `${(composition_percent['Plastic'] * 100).toFixed(1)}%` : 'Recyclable'}
                    </div>
                  </div>

                  {/* Paper */}
                  <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded space-y-1">
                    <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5 font-heading">
                      <BarChart3 className="w-3.5 h-3.5 text-purple-700" />
                      <span>Paper</span>
                    </div>
                    <div className="text-base font-bold text-purple-950 font-heading">
                      {wasteBreakdown.paperCardboardKg.toLocaleString()} kg
                    </div>
                    <div className="text-[10px] text-purple-800 font-medium">
                      {composition_percent['Paper'] ? `${(composition_percent['Paper'] * 100).toFixed(1)}%` : 'Recyclable'}
                    </div>
                  </div>

                  {/* Glass */}
                  <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded space-y-1">
                    <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5 font-heading">
                      <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                      <span>Glass</span>
                    </div>
                    <div className="text-base font-bold text-teal-950 font-heading">
                      {wasteBreakdown.glassKg.toLocaleString()} kg
                    </div>
                    <div className="text-[10px] text-teal-800 font-medium">
                      {composition_percent['Glass'] ? `${(composition_percent['Glass'] * 100).toFixed(1)}%` : 'Recyclable'}
                    </div>
                  </div>

                  {/* Others */}
                  <div className="p-3 bg-[#F7F9F5] border border-[#E1E8DE] rounded space-y-1">
                    <div className="text-xs font-bold text-[#202820] flex items-center gap-1.5 font-heading">
                      <Trash2 className="w-3.5 h-3.5 text-[#667267]" />
                      <span>Others</span>
                    </div>
                    <div className="text-base font-bold text-[#202820] font-heading">
                      {wasteBreakdown.inertLandfillKg.toLocaleString()} kg
                    </div>
                    <div className="text-[10px] text-[#667267] font-medium">
                      {composition_percent['Others'] ? `${(composition_percent['Others'] * 100).toFixed(1)}%` : 'Residual'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sustainability Action Card */}
              <div className="bg-[#EAF5E6] border border-[#70D000]/40 rounded-md p-4 flex items-start gap-3.5 text-xs text-[#202820]">
                <Sparkles className="w-5 h-5 text-[#004B20] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-[#004B20] font-heading">Bunbetsu Campus Waste Recommendation</div>
                  <p className="leading-relaxed text-[#202820] font-medium">
                    Station paired multi-stream stations (compost, recyclables, landfill) in high-footfall zones and schedule regular clearance intervals to divert recyclable and organic fractions away from landfills.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LOCATIONS TAB */}
          {activeTab === 'locations' && (
            <div className="space-y-3.5">
              <div className="text-xs text-[#667267] font-medium">
                Spatial shares allocated according to model activity weights. Location IDs and areas are preserved from map selection.
              </div>

              <div className="space-y-3">
                {locationAllocations.map((alloc) => (
                  <div
                    key={alloc.id || alloc.location_id}
                    className="p-4 bg-white rounded-md border border-[#E1E8DE] shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-sm font-bold text-[#202820]">
                            {alloc.location_name}
                          </span>
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-[#F7F9F5] text-[#667267] rounded border border-[#E1E8DE]">
                            ID: {alloc.id || alloc.location_id}
                          </span>
                        </div>
                        <div className="text-xs text-[#667267] mt-0.5">
                          Activities: {alloc.activities.join(', ')} • Area: {formatArea(alloc.area)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-heading text-sm font-bold text-[#004B20]">
                          {alloc.estimatedWasteKg.toLocaleString()} kg
                        </div>
                        <div className="text-[11px] text-[#667267] font-medium">
                          {alloc.spatialSharePercent}% of total fest waste
                        </div>
                      </div>
                    </div>

                    {/* Stream Breakdown for this Location */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                      <div className="p-2 bg-[#F7F9F5] rounded border border-[#E1E8DE]">
                        <span className="text-[#667267]">Food: </span>
                        <span className="font-bold text-[#202820]">
                          {Math.round(alloc.composition_kg['Food']?.central || 0)} kg
                        </span>
                      </div>
                      <div className="p-2 bg-[#F7F9F5] rounded border border-[#E1E8DE]">
                        <span className="text-[#667267]">Recyclables: </span>
                        <span className="font-bold text-[#202820]">
                          {Math.round(alloc.recyclable_kg.central)} kg
                        </span>
                      </div>
                      <div className="p-2 bg-[#F7F9F5] rounded border border-[#E1E8DE]">
                        <span className="text-[#667267]">Residual: </span>
                        <span className="font-bold text-[#202820]">
                          {Math.round(alloc.disposable_kg.central)} kg
                        </span>
                      </div>
                      <div className="p-2 bg-[#F7F9F5] rounded border border-[#E1E8DE]">
                        <span className="text-[#667267]">Waste Range: </span>
                        <span className="font-bold text-[#202820]">
                          {Math.round(alloc.total_waste_kg.low)}–{Math.round(alloc.total_waste_kg.high)} kg
                        </span>
                      </div>
                    </div>

                    {/* Bin requirements */}
                    <div className="pt-2 border-t border-[#E1E8DE] flex items-center gap-4 text-xs">
                      <span className="font-semibold text-[#202820]">Recommended 240L Bins:</span>
                      <span className="text-amber-800 font-bold">
                        🍎 {alloc.binsRecommended.compost} Compost
                      </span>
                      <span className="text-blue-800 font-bold">
                        ♻️ {alloc.binsRecommended.recycling} Recycling
                      </span>
                      <span className="text-[#667267] font-bold">
                        🗑️ {alloc.binsRecommended.landfill} Landfill
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ASSUMPTIONS TAB */}
          {activeTab === 'assumptions' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#004B20]" />
                <span className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
                  Frozen Mathematical Model Assumptions & Notes
                </span>
              </div>
              <ul className="space-y-2 text-xs text-[#202820]">
                {assumptions?.map((assumption, idx) => (
                  <li
                    key={idx}
                    className="p-3 bg-[#F7F9F5] rounded-md border border-[#E1E8DE] leading-relaxed flex items-start gap-2.5"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#EAF5E6] text-[#004B20] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* JSON CONTRACT TAB */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-xs font-bold text-[#202820]">
                  Backend Request & Response Contracts
                </span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F9F5] hover:bg-[#EAF5E6] border border-[#E1E8DE] rounded text-xs font-bold text-[#202820] cursor-pointer transition font-sans"
                >
                  {copiedPayload ? <Check className="w-3.5 h-3.5 text-[#004B20]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPayload ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold text-[#667267] uppercase tracking-wider">
                  Request Payload (`POST /api/prediction/waste`)
                </span>
                <pre className="p-3 bg-[#202820] text-[#70D000] border border-[#E1E8DE]/20 rounded-md text-xs font-mono overflow-x-auto max-h-[180px]">
                  {JSON.stringify(payload, null, 2)}
                </pre>

                <span className="text-[11px] font-bold text-[#667267] uppercase tracking-wider block pt-2">
                  FastAPI Model Output
                </span>
                <pre className="p-3 bg-[#202820] text-[#70D000] border border-[#E1E8DE]/20 rounded-md text-xs font-mono overflow-x-auto max-h-[220px]">
                  {JSON.stringify(
                    {
                      campus_state: result.campus_state,
                      baseline_rate_kg_per_person_day: result.baseline_rate_kg_per_person_day,
                      baseline_source_year: result.baseline_source_year,
                      baseline_rate_source: result.baseline_rate_source,
                      baseline_is_national_fallback: result.baseline_is_national_fallback,
                      total_waste_kg: total_waste_kg,
                      composition_kg: result.composition_kg,
                      composition_percent: composition_percent,
                      recyclable_kg: recyclable_kg,
                      disposable_kg: disposable_kg,
                      location_allocations: locationAllocations,
                      heatmap_data: result.heatmap_data,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#F7F9F5] border-t border-[#E1E8DE] flex items-center justify-between">
          <span className="text-xs text-[#667267] font-medium">
            Executed with Bunbetsu FastAPI waste model
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#004B20] hover:bg-[#003B19] text-white text-xs font-bold rounded cursor-pointer transition shadow-xs font-sans"
          >
            Close Plan
          </button>
        </div>
      </div>
    </div>
  );
};
