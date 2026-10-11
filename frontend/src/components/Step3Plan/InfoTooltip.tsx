import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export interface InfoTooltipProps {
  content: string;
  className?: string;
  iconClassName?: string;
  'aria-label'?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  className = '',
  iconClassName = '',
  'aria-label': ariaLabel = 'More information',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 260; // Max expected tooltip width
    const gap = 6;

    // Prefer below the trigger
    let top = rect.bottom + gap;
    // Check if overflowing viewport bottom
    if (top + 60 > window.innerHeight && rect.top - 60 > 0) {
      top = rect.top - gap - 40; // Place above if near bottom
    }

    // Align center with trigger, but clamp within viewport margins
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tooltipWidth - 12;
    }

    setCoords({ top, left });
  }, []);

  const showTooltip = useCallback(() => {
    updatePosition();
    setIsOpen(true);
  }, [updatePosition]);

  const hideTooltip = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        tooltipRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      hideTooltip();
    };

    const handleScrollOrResize = () => {
      hideTooltip();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, hideTooltip]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            hideTooltip();
          } else {
            showTooltip();
          }
        }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={`inline-flex items-center justify-center p-0.5 rounded text-[#667267] hover:text-[#004B20] focus:text-[#004B20] focus:outline-none focus-visible:ring-1.5 focus-visible:ring-[#004B20] cursor-pointer transition-colors shrink-0 ${className}`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
      >
        <Info className={`w-3.5 h-3.5 ${iconClassName}`} />
      </button>

      {isOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className="fixed z-[9999] px-2.5 py-1.5 text-[11px] leading-snug font-normal text-[#202820] bg-white border border-[#E1E8DE] rounded-lg shadow-lg max-w-[260px] sm:max-w-[280px] pointer-events-none select-none font-sans text-left animate-in fade-in zoom-in-95 duration-100"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};

