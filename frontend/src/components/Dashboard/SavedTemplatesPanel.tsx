import React from 'react';
import { DashboardTemplateItem } from '../../types/bunbetsu';

interface SavedTemplatesPanelProps {
  templates: DashboardTemplateItem[];
  onViewAll: () => void;
  onStartPlanning: () => void;
  onSelectTemplate?: (template: DashboardTemplateItem) => void;
  maxVisible?: number;
}

export const SavedTemplatesPanel: React.FC<SavedTemplatesPanelProps> = ({
  templates,
  onViewAll,
  onStartPlanning,
  onSelectTemplate,
  maxVisible = 6,
}) => {
  const visibleTemplates = templates.slice(0, maxVisible);

  return (
    <div className="bg-white rounded-2xl border border-[#E1E8DE] p-4 sm:p-5 shadow-2xs flex flex-col justify-between overflow-hidden">
      <div>
        {/* Header with Title and View all button */}
        <div className="flex items-start justify-between gap-4 pb-2.5 sm:pb-3 border-b border-[#F0F4EE]">
          <div>
            <h3 className="font-heading font-bold text-base sm:text-lg text-[#103822] tracking-tight">
              Saved templates
            </h3>
            <p className="text-[11px] text-[#667267] mt-0.5 font-medium">
              Reusable event setups to save time.
            </p>
          </div>
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer transition select-none pt-0.5"
          >
            View all
          </button>
        </div>

        {/* Templates List (5-10 max fitting without scroll) or Empty State */}
        <div className="mt-1.5 overflow-hidden">
          {visibleTemplates.length === 0 ? (
            <div className="py-7 sm:py-9 text-center space-y-2">
              <p className="text-xs text-[#667267] font-medium leading-relaxed">
                No templates available yet.
              </p>
              <div>
                <button
                  type="button"
                  onClick={onStartPlanning}
                  className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Start planning</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F4EE]">
              {visibleTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => onSelectTemplate?.(tmpl)}
                  className="py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold text-[#1F2937] hover:text-[#0B4222] hover:bg-[#F9FAF7] transition cursor-pointer truncate"
                  title={tmpl.name}
                >
                  {tmpl.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
