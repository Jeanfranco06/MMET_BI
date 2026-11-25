'use client';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  compact?: boolean;
  subtitle?: string;
}

export function BrandLogo({
  variant = 'dark',
  compact = false,
  subtitle = 'Bienestar Universitario',
}: BrandLogoProps) {
  const isDark = variant === 'dark';

  return (
    <div className="flex items-center gap-3 select-none min-w-0">
      <div
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0 shadow-sm ${
          isDark
            ? 'bg-gradient-to-br from-teal-500/20 via-teal-500/10 to-indigo-500/20 border border-teal-400/25'
            : 'bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700'
        }`}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          aria-hidden="true"
        >
          {/* Analytical bars */}
          <rect x="5" y="18" width="3.5" height="8" rx="1.75" fill="#14B8A6" fillOpacity="0.55" />
          <rect x="11" y="14" width="3.5" height="12" rx="1.75" fill="#14B8A6" fillOpacity="0.8" />
          <rect x="17" y="10" width="3.5" height="16" rx="1.75" fill="#14B8A6" />
          <rect x="23" y="15" width="3.5" height="11" rx="1.75" fill="#6366F1" />
          {/* Calm brain/mindfulness wave */}
          <path
            d="M4 13.5C7 13.5 8.2 7.5 11.5 7.5C14.8 7.5 16 14 19.2 12.2C22.4 10.4 23.8 6.5 28 8"
            stroke="#5EEAD4"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-display text-[15px] font-bold tracking-tight truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              MindMetrics
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                isDark
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-400/20'
                  : 'bg-teal-50 text-teal-700 border border-teal-200'
              }`}
            >
              BI
            </span>
          </div>
          {subtitle && (
            <p
              className={`text-[11px] truncate mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
