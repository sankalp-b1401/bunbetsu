import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { AuthUser, getUserInitials } from '../types/bunbetsu';

interface NavbarProps {
  currentStep?: 1 | 2 | 3;
  onStepClick?: (step: 1 | 2 | 3) => void;
  step1Completed?: boolean;
  canGoToPlan?: boolean;
  onResetPlan?: () => void;
  onLogout?: () => void;
  onGoToDashboard?: () => void;
  user?: AuthUser | null;
  isDashboard?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStep = 1,
  onStepClick,
  step1Completed = false,
  canGoToPlan = false,
  onResetPlan,
  onLogout,
  onGoToDashboard,
  user,
  isDashboard = false,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const initials = user ? getUserInitials(user.name) : 'AS';

  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-[#E1E8DE] shrink-0 z-30 select-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="w-full px-4 sm:px-6 h-13 sm:h-14 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center shrink-0">
          <img
            src="/bunbetsu-logo.png"
            alt="BUNBETSU"
            className="h-8 sm:h-9 md:h-9.5 w-auto max-w-[200px] sm:max-w-[240px] object-contain cursor-pointer select-none transition-opacity hover:opacity-90 active:opacity-75"
            onClick={() => (onGoToDashboard ? onGoToDashboard() : onStepClick?.(1))}
            title="Bunbetsu - Campus Venue Waste Planner"
          />
        </div>

        {/* Stepper with Architecturally Refined Slim Segmented Controls (Campus selection page chain only) */}
        {!isDashboard && (
          <nav className="flex items-center gap-1 bg-[#F4F6F2] p-0.5 rounded-lg border border-[#E1E8DE]">
            {/* Step 1: Campus */}
            <button
              type="button"
              onClick={() => onStepClick?.(1)}
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

            <span className="text-[#C4D1BF] select-none text-[11px] font-light px-0.5">→</span>

            {/* Step 2: Configure */}
            <button
              type="button"
              onClick={() => step1Completed && onStepClick?.(2)}
              disabled={!step1Completed}
              title={!step1Completed ? 'Confirm Campus on Step 1 first' : ''}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all font-sans ${
                currentStep === 2
                  ? 'bg-white text-[#004B20] shadow-xs border border-[#E1E8DE]/90 font-bold'
                  : currentStep > 2
                  ? 'text-[#667267] hover:text-[#202820] hover:bg-white/60 font-medium cursor-pointer'
                  : step1Completed
                  ? 'text-[#667267] hover:text-[#202820] hover:bg-white/60 font-medium cursor-pointer'
                  : 'text-[#667267]/50 cursor-not-allowed opacity-50 font-medium'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep > 2
                    ? 'bg-[#004B20] text-[#70D000]'
                    : currentStep === 2
                    ? 'bg-[#70D000] text-[#004B20]'
                    : 'bg-[#E1E8DE] text-[#667267]'
                }`}
              >
                {currentStep > 2 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '2'}
              </div>
              <span>Configure</span>
            </button>

            <span className="text-[#C4D1BF] select-none text-[11px] font-light px-0.5">→</span>

            {/* Step 3: Plan */}
            <button
              type="button"
              onClick={() => canGoToPlan && onStepClick?.(3)}
              disabled={!canGoToPlan}
              title={!canGoToPlan ? 'Configure event details and locations first' : ''}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all font-sans ${
                currentStep === 3
                  ? 'bg-[#004B20] text-white shadow-xs font-bold'
                  : canGoToPlan
                  ? 'text-[#667267] hover:text-[#202820] hover:bg-white/60 font-medium cursor-pointer'
                  : 'text-[#667267]/50 cursor-not-allowed opacity-50 font-medium'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep === 3
                    ? 'bg-[#70D000] text-[#004B20]'
                    : 'bg-[#E1E8DE] text-[#667267]'
                }`}
              >
                3
              </div>
              <span>Plan</span>
            </button>
          </nav>
        )}

        {/* Right Navigation */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

          {/* Authenticated User Profile Corner */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowDropdown((prev) => !prev)}
              className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-[#F4F6F2] transition cursor-pointer select-none"
              aria-expanded={showDropdown}
              title={user?.name || 'Aarav Sharma'}
            >
              {/* User Initials Avatar Circle */}
              <div className="w-8 h-8 rounded-full bg-[#0B4222] text-white flex items-center justify-center text-xs font-bold tracking-tight shadow-2xs select-none">
                {initials}
              </div>
              <span className="text-xs text-[#526857] select-none pr-0.5">
                {showDropdown ? '▴' : '▾'}
              </span>
            </button>

            {/* User Account Dropdown Menu: Shows user name and logout button */}
            {showDropdown && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-[#E1E8DE] py-2 z-50 animate-in fade-in duration-100">
                <div className="px-4 py-2 border-b border-[#F0F4EE]">
                  <div className="text-xs font-bold text-[#183E28] truncate">
                    {user?.name || 'Aarav Sharma'}
                  </div>
                  {user?.email && (
                    <div className="text-[11px] text-[#667267] truncate mt-0.5">{user.email}</div>
                  )}
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onLogout?.();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer flex items-center justify-between"
                  >
                    <span>Log out</span>
                    <span className="text-[11px] text-red-400">→</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
