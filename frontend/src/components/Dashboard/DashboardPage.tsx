import React, { useState } from 'react';
import {
  AuthUser,
  DashboardEventItem,
  DashboardTemplateItem,
  getUserFirstName,
} from '../../types/bunbetsu';
import { Navbar } from '../Navbar';
import { DashboardActionCards } from './DashboardActionCards';
import { RecentEventsPanel } from './RecentEventsPanel';
import { SavedTemplatesPanel } from './SavedTemplatesPanel';

export type DashboardViewTab = 'dashboard' | 'events' | 'templates';

interface DashboardPageProps {
  user: AuthUser;
  onStartPlanning: () => void;
  onLogout: () => void;
  recentEvents?: DashboardEventItem[];
  savedTemplates?: DashboardTemplateItem[];
  onSelectEvent?: (event: DashboardEventItem) => void;
  onSelectTemplate?: (template: DashboardTemplateItem) => void;
  onDeleteTemplate?: (templateId: string) => void;
  isLoadingTemplates?: boolean;
  templatesError?: string | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  onStartPlanning,
  onLogout,
  recentEvents = [],
  savedTemplates = [],
  onSelectEvent,
  onSelectTemplate,
  onDeleteTemplate,
  isLoadingTemplates = false,
  templatesError = null,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardViewTab>('dashboard');

  const firstName = getUserFirstName(user.name);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F8FAF7] text-[#202820] select-none font-sans">
      {/* Top Navigation Bar: Same Navbar as step 1, 2, 3 */}
      <Navbar
        user={user}
        onLogout={onLogout}
        onGoToDashboard={() => setActiveTab('dashboard')}
        onStepClick={() => onStartPlanning()}
        isDashboard={true}
      />

      {/* Main Content Workspace (Full Width, No Sidebar, No Scrolling on Dashboard) */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* View 1: Main Dashboard Overview (fits comfortably in viewport without scroll) */}
        {activeTab === 'dashboard' && (
          <div className="w-full max-w-6xl mx-auto h-full flex flex-col justify-between p-4 sm:p-5 lg:p-6 overflow-hidden gap-3.5 sm:gap-4.5">
            {/* Personalized Welcome Header */}
            <div className="space-y-0.5 shrink-0">
              <h1 className="font-heading font-bold text-xl sm:text-2xl text-[#103822] tracking-tight">
                Welcome back, {firstName}!
              </h1>
              <p className="text-xs text-[#5F7366] font-medium leading-relaxed">
                Plan and manage your events, access templates, and create cleaner, more sustainable campuses.
              </p>
            </div>

            {/* Three Action Cards */}
            <div className="shrink-0">
              <DashboardActionCards
                onStartPlanning={onStartPlanning}
                onViewTemplates={() => setActiveTab('templates')}
                onViewHistory={() => setActiveTab('events')}
              />
            </div>

            {/* Lower Section: Recent Events & Saved Templates (5-10 items max, fits without scroll) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4.5 overflow-hidden">
              <RecentEventsPanel
                events={recentEvents}
                maxVisible={6}
                onViewAll={() => setActiveTab('events')}
                onStartPlanning={onStartPlanning}
                onSelectEvent={onSelectEvent}
              />

              <SavedTemplatesPanel
                templates={savedTemplates}
                maxVisible={6}
                onViewAll={() => setActiveTab('templates')}
                onStartPlanning={onStartPlanning}
                onSelectTemplate={onSelectTemplate}
                isLoading={isLoadingTemplates}
                error={templatesError}
              />
            </div>
          </div>
        )}

        {/* View 2: Full My Events Section (accessible via View all / View history) */}
        {activeTab === 'events' && (
          <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading font-bold text-xl sm:text-2xl text-[#103822] tracking-tight">
                  My Events
                </h1>
                <p className="text-xs text-[#5F7366] mt-0.5 font-medium">
                  All saved and historical campus venue waste plans.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-[#E1E8DE] p-5 sm:p-6 shadow-2xs">
              {recentEvents.length === 0 ? (
                <div className="py-14 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#183E28]">
                    No saved event plans found.
                  </p>
                  <p className="text-xs text-[#667267] max-w-md mx-auto leading-relaxed">
                    When you generate and save plans for your campus events, they will appear here for review and export.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onStartPlanning}
                      className="bg-[#0B4222] hover:bg-[#073419] text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>Plan a new event</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#F0F4EE]">
                  {recentEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => onSelectEvent?.(evt)}
                      className="py-3 px-3 rounded-lg text-sm font-semibold text-[#1F2937] hover:text-[#0B4222] hover:bg-[#F9FAF7] transition cursor-pointer flex items-center justify-between"
                    >
                      <span>{evt.name}</span>
                      <span className="text-xs text-[#667267]">Open plan →</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* View 3: Full Templates Section (accessible via View all / View templates) */}
        {activeTab === 'templates' && (
          <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading font-bold text-xl sm:text-2xl text-[#103822] tracking-tight">
                  Templates
                </h1>
                <p className="text-xs text-[#5F7366] mt-0.5 font-medium">
                  Pre-calibrated event archetypes to accelerate campus resource planning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-[#E1E8DE] p-5 sm:p-6 shadow-2xs">
              {isLoadingTemplates ? (
                <div className="py-14 text-center">
                  <p className="text-sm font-semibold text-[#183E28]">
                    Loading your saved templates...
                  </p>
                </div>
              ) : templatesError ? (
                <div className="py-14 text-center space-y-2">
                  <p className="text-sm font-semibold text-red-600">
                    {templatesError}
                  </p>
                  <p className="text-xs text-[#667267]">
                    Unable to retrieve saved templates from database.
                  </p>
                </div>
              ) : savedTemplates.length === 0 ? (
                <div className="py-14 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#183E28]">
                    No custom templates saved yet.
                  </p>
                  <p className="text-xs text-[#667267] max-w-md mx-auto leading-relaxed">
                    Templates allow you to save reusable waste profiles, footfall ratios, and bin setups across academic sessions.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onStartPlanning}
                      className="bg-[#0B4222] hover:bg-[#073419] text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>Start planning from scratch</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#F0F4EE]">
                  {savedTemplates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="py-3 px-3 rounded-lg text-sm font-semibold text-[#1F2937] hover:bg-[#F9FAF7] transition flex items-center justify-between"
                    >
                      <div
                        onClick={() => onSelectTemplate?.(tmpl)}
                        className="cursor-pointer hover:text-[#0B4222] flex-1 truncate"
                        title={tmpl.name}
                      >
                        <span>{tmpl.name}</span>
                        {tmpl.updated_at && (
                          <span className="text-xs text-[#8A9C8F] font-normal ml-2">
                            • Updated {new Date(tmpl.updated_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {onDeleteTemplate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTemplate(tmpl.id);
                            }}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 hover:bg-red-50 rounded transition cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectTemplate?.(tmpl)}
                          className="text-xs text-[#0B4222] font-bold hover:underline cursor-pointer"
                        >
                          Use template →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
