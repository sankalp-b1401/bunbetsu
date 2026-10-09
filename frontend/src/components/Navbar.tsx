import React, { useState } from 'react';
import { Check, History, Users, X, Calendar, Download, Trophy, Sparkles, MessageSquare, ArrowRight, LayoutTemplate } from 'lucide-react';

interface NavbarProps {
  currentStep: 1 | 2;
  onStepClick: (step: 1 | 2) => void;
  step1Completed: boolean;
  onResetPlan?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStep,
  onStepClick,
  step1Completed,
  onResetPlan,
}) => {
  const [showEventHistory, setShowEventHistory] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <>
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-[#E1E8DE] shrink-0 z-30 select-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="w-full px-4 sm:px-6 h-13 sm:h-14 flex items-center justify-between gap-4">
          {/* Brand / Logo: sleek, clear, well-proportioned without bloating navbar height */}
          <div className="flex items-center shrink-0">
            <img
              src="/bunbetsu-logo.png"
              alt="BUNBETSU"
              className="h-8 sm:h-9 md:h-9.5 w-auto max-w-[200px] sm:max-w-[240px] object-contain cursor-pointer select-none transition-opacity hover:opacity-90 active:opacity-75"
              onClick={() => onStepClick(1)}
              title="Bunbetsu - Campus Venue Waste Planner"
            />
          </div>

          {/* Stepper with Architecturally Refined Slim Segmented Controls */}
          <nav className="flex items-center gap-1 bg-[#F4F6F2] p-0.5 rounded-lg border border-[#E1E8DE]">
            {/* Step 1: Campus */}
            <button
              type="button"
              onClick={() => onStepClick(1)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs cursor-pointer transition-all font-sans ${
                currentStep === 1
                  ? 'bg-white text-[#004B20] shadow-xs border border-[#E1E8DE]/90 font-bold'
                  : 'text-[#667267] hover:text-[#202820] hover:bg-white/60 font-medium'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  step1Completed && currentStep !== 1
                    ? 'bg-[#004B20] text-[#70D000]'
                    : currentStep === 1
                    ? 'bg-[#70D000] text-[#004B20]'
                    : 'bg-[#E1E8DE] text-[#667267]'
                }`}
              >
                {step1Completed && currentStep !== 1 ? (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                ) : (
                  '1'
                )}
              </div>
              <span>Campus</span>
            </button>

            <span className="text-[#C4D1BF] select-none text-[11px] font-light px-0.5">/</span>

            {/* Step 2: Configure & Plan */}
            <button
              type="button"
              onClick={() => step1Completed && onStepClick(2)}
              disabled={!step1Completed}
              title={!step1Completed ? 'Confirm Campus on Step 1 first' : ''}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all font-sans ${
                currentStep === 2
                  ? 'bg-[#004B20] text-white shadow-xs font-bold'
                  : step1Completed
                  ? 'text-[#667267] hover:text-[#202820] hover:bg-white/60 font-medium cursor-pointer'
                  : 'text-[#667267]/50 cursor-not-allowed opacity-50 font-medium'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep === 2
                    ? 'bg-[#70D000] text-[#004B20]'
                    : 'bg-[#E1E8DE] text-[#667267]'
                }`}
              >
                2
              </div>
              <span>Configure</span>
            </button>
          </nav>

          {/* Right Navigation */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Event History Button */}
            <button
              type="button"
              onClick={() => setShowEventHistory(true)}
              className="text-xs font-semibold text-[#667267] hover:text-[#202820] transition-colors hidden sm:flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-md hover:bg-[#F4F6F2]"
            >
              <History className="w-3.5 h-3.5 text-[#667267]" />
              <span>Event History</span>
            </button>

            {/* Community Button */}
            <button
              type="button"
              onClick={() => setShowCommunity(true)}
              className="text-xs font-semibold text-[#667267] hover:text-[#202820] transition-colors hidden sm:flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-md hover:bg-[#F4F6F2]"
            >
              <Users className="w-3.5 h-3.5 text-[#667267]" />
              <span>Community</span>
            </button>

            {/* Templates Button with Icon */}
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="text-xs font-semibold text-[#667267] hover:text-[#202820] transition-colors hidden md:flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-md hover:bg-[#F4F6F2]"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-[#667267]" />
              <span>Templates</span>
            </button>

            <div className="h-3.5 w-px bg-[#E1E8DE] hidden sm:block mx-0.5" />

            {/* User Profile Avatar Tile */}
            <button
              type="button"
              className="w-7.5 h-7.5 rounded-md bg-[#004B20] text-white flex items-center justify-center text-xs font-bold tracking-tight shadow-2xs hover:bg-[#003B19] transition-all cursor-pointer select-none border border-[#004B20]"
              title="Alex S. (Sustainability Coordinator)"
            >
              AS
            </button>
          </div>
        </div>
      </header>

      {/* EVENT HISTORY MODAL */}
      {showEventHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-2xl border border-[#E1E8DE] w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-[#F7F9F5] border-b border-[#E1E8DE] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#004B20] text-white flex items-center justify-center">
                  <History className="w-4 h-4 text-[#70D000]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-[#202820]">Campus Event History</h3>
                  <p className="text-[11px] text-[#667267] font-medium">
                    Archived fest waste resource plans and diversion reports
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEventHistory(false)}
                className="p-1.5 text-[#667267] hover:text-[#202820] hover:bg-white rounded-md cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {[
                {
                  id: 'evt-2024-avishkar',
                  name: 'Avishkar Techfest 2024',
                  campus: 'MNNIT Allahabad',
                  date: 'Nov 2024',
                  duration: '3 days',
                  footfall: '14,500',
                  wasteTotal: '3.9 tonnes',
                  divertedRate: '72% diverted',
                  color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                },
                {
                  id: 'evt-2024-culrav',
                  name: 'Culrav Cultural Fest 2024',
                  campus: 'MNNIT Allahabad',
                  date: 'Apr 2024',
                  duration: '4 days',
                  footfall: '22,000',
                  wasteTotal: '6.2 tonnes',
                  divertedRate: '68% diverted',
                  color: 'text-blue-700 bg-blue-50 border-blue-200',
                },
                {
                  id: 'evt-2023-gnosio',
                  name: 'Gnosiomania Quiz Festival 2023',
                  campus: 'MNNIT Allahabad',
                  date: 'Oct 2023',
                  duration: '2 days',
                  footfall: '4,800',
                  wasteTotal: '0.9 tonnes',
                  divertedRate: '81% diverted',
                  color: 'text-purple-700 bg-purple-50 border-purple-200',
                },
              ].map((evt) => (
                <div
                  key={evt.id}
                  className="p-3.5 bg-white rounded-md border border-[#E1E8DE] hover:border-[#004B20]/40 hover:shadow-xs transition flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-xs font-bold text-[#202820]">{evt.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${evt.color}`}>
                        {evt.divertedRate}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#667267] flex items-center gap-3">
                      <span>{evt.campus}</span>
                      <span>•</span>
                      <span>{evt.date} ({evt.duration})</span>
                      <span>•</span>
                      <span>{evt.footfall} attendees</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-heading text-xs font-bold text-[#004B20]">{evt.wasteTotal}</div>
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-[#004B20] hover:underline flex items-center gap-1 justify-end mt-0.5 cursor-pointer"
                      onClick={() => alert(`Loaded historical metrics for ${evt.name}`)}
                    >
                      <span>View audit</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 bg-[#F7F9F5] border-t border-[#E1E8DE] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#667267]">
                3 historical event plans stored on this device
              </span>
              <button
                type="button"
                onClick={() => setShowEventHistory(false)}
                className="px-3.5 py-1.5 bg-[#004B20] text-white rounded-md font-bold text-xs hover:bg-[#003B19] transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMMUNITY MODAL */}
      {showCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-2xl border border-[#E1E8DE] w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-[#F7F9F5] border-b border-[#E1E8DE] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#004B20] text-white flex items-center justify-center">
                  <Users className="w-4 h-4 text-[#70D000]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-[#202820]">Campus Sustainability Community</h3>
                  <p className="text-[11px] text-[#667267] font-medium">
                    Green team networks, vendor benchmarks, and student volunteer hubs
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCommunity(false)}
                className="p-1.5 text-[#667267] hover:text-[#202820] hover:bg-white rounded-md cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Leaderboard snippet */}
              <div className="p-3.5 bg-[#EAF5E6] rounded-md border border-[#70D000]/40 flex items-start gap-3">
                <Trophy className="w-4 h-4 text-[#004B20] shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <div className="font-bold text-[#004B20] font-heading">
                    Campus Zero-Waste Index: Rank #4 in North Zone
                  </div>
                  <p className="text-[11px] text-[#202820] leading-relaxed">
                    Institutes participating in Bunbetsu shared waste audits diverted 18.4 tonnes of organic compost and recyclables during fest season 2024.
                  </p>
                </div>
              </div>

              {/* Community features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#F7F9F5] rounded-md border border-[#E1E8DE] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#004B20]" />
                    <span className="font-heading text-xs font-bold text-[#202820]">Student Green Corps</span>
                  </div>
                  <p className="text-[11px] text-[#667267] leading-relaxed">
                    48 student coordinators active across campus. Schedule bin-monitoring volunteer shifts for upcoming fests.
                  </p>
                  <button
                    type="button"
                    onClick={() => alert('Green Corps coordinator list copied to clipboard')}
                    className="text-[10px] font-bold text-[#004B20] hover:underline cursor-pointer"
                  >
                    View volunteer roster →
                  </button>
                </div>

                <div className="p-3.5 bg-[#F7F9F5] rounded-md border border-[#E1E8DE] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[#004B20]" />
                    <span className="font-heading text-xs font-bold text-[#202820]">Aggregator Directory</span>
                  </div>
                  <p className="text-[11px] text-[#667267] leading-relaxed">
                    Connect directly with verified local composters, PET recyclers, and municipal organic processing facilities.
                  </p>
                  <button
                    type="button"
                    onClick={() => alert('Recycling vendor registry loaded')}
                    className="text-[10px] font-bold text-[#004B20] hover:underline cursor-pointer"
                  >
                    Find local recyclers →
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#F7F9F5] border-t border-[#E1E8DE] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#667267]">
                Connected to National Green Campus Network
              </span>
              <button
                type="button"
                onClick={() => setShowCommunity(false)}
                className="px-3.5 py-1.5 bg-[#004B20] text-white rounded-md font-bold text-xs hover:bg-[#003B19] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATES MODAL */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-2xl border border-[#E1E8DE] w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-[#F7F9F5] border-b border-[#E1E8DE] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#004B20] text-white flex items-center justify-center">
                  <LayoutTemplate className="w-4 h-4 text-[#70D000]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-[#202820]">Event Archetype Templates</h3>
                  <p className="text-[11px] text-[#667267] font-medium">
                    Pre-calibrated campus event models for quick waste resource planning
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="p-1.5 text-[#667267] hover:text-[#202820] hover:bg-white rounded-md cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {[
                {
                  id: 'tmpl-techfest',
                  name: '3-Day Technical Festival',
                  desc: 'High electronics, robotics packaging, and late-night food court volumes.',
                  benchRate: '0.45 kg/attendee-day',
                  recommendedBins: '3-stream paired bins with dedicated e-waste drops',
                },
                {
                  id: 'tmpl-cultfest',
                  name: '4-Day Mega Cultural Fest',
                  desc: 'Peak footfall, major open-air food stalls, stage props, and paper decorations.',
                  benchRate: '0.52 kg/attendee-day',
                  recommendedBins: 'High-capacity 240L compost stations with 2hr haul cycles',
                },
                {
                  id: 'tmpl-hackathon',
                  name: '48-Hour Zero-Waste Hackathon',
                  desc: 'Continuous indoor footfall, high coffee cup, snack wrapper, and PET bottle generation.',
                  benchRate: '0.38 kg/attendee-day',
                  recommendedBins: 'Clean paper & plastics baling hubs near coding labs',
                },
              ].map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="p-3.5 bg-white rounded-md border border-[#E1E8DE] hover:border-[#004B20]/40 hover:shadow-xs transition space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-xs font-bold text-[#202820]">{tmpl.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/30">
                      {tmpl.benchRate}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#667267] leading-relaxed">{tmpl.desc}</p>
                  <div className="text-[10px] text-[#202820] font-medium pt-1 border-t border-[#E1E8DE]/60 flex items-center justify-between">
                    <span>{tmpl.recommendedBins}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTemplates(false);
                        alert(`Applied "${tmpl.name}" baseline archetype to event settings`);
                      }}
                      className="text-[10px] font-bold text-[#004B20] hover:underline cursor-pointer"
                    >
                      Use template →
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 bg-[#F7F9F5] border-t border-[#E1E8DE] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#667267]">
                Templates calibrated using Central Pollution Control Board guidelines
              </span>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="px-3.5 py-1.5 bg-[#004B20] text-white rounded-md font-bold text-xs hover:bg-[#003B19] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
