import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

export interface DatePickerProps {
  /** YYYY-MM-DD */
  value: string;
  /** Emits YYYY-MM-DD */
  onChange: (next: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  clearable?: boolean;
  className?: string;
}

function parseYmd(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  // Treat as local date (no timezone surprises).
  const d = parseISO(`${ymd}T00:00:00`);
  return isValid(d) ? d : undefined;
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  disabled,
  min,
  max,
  clearable = true,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [viewMonth, setViewMonth] = useState<Date>(new Date());

  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = btnRef.current;
    if (!el) return;
    setViewMonth(parseYmd(value) ?? parseYmd(draft) ?? new Date());
    const r = el.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(260, Math.min(360, r.width));
    const left = Math.min(window.innerWidth - margin - width, Math.max(margin, r.left));
    const top = r.bottom + margin;
    setPos({ left, top, width });

    const onResize = () => {
      const rr = el.getBoundingClientRect();
      const w = Math.max(260, Math.min(360, rr.width));
      const l = Math.min(window.innerWidth - margin - w, Math.max(margin, rr.left));
      const t = rr.bottom + margin;
      setPos({ left: l, top: t, width: w });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open]);

  const selected = useMemo(() => parseYmd(value), [value]);
  const minDate = useMemo(() => parseYmd(min ?? ''), [min]);
  const maxDate = useMemo(() => parseYmd(max ?? ''), [max]);

  const buttonText = useMemo(() => {
    const d = parseYmd(value);
    if (!d) return placeholder;
    return format(d, 'MMM d, yyyy');
  }, [placeholder, value]);

  return (
    <div className={className}>
      {label && <div className="block text-sm font-medium text-slate-700 mb-1">{label}</div>}

      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className={`w-full inline-flex items-center justify-between gap-3 px-4 py-2 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
            disabled ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className={`truncate ${selected ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{buttonText}</span>
          <span className="flex items-center gap-2">
            {clearable && value && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onChange('');
                    setOpen(false);
                  }
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                aria-label="Clear date"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </span>
            )}
            <CalendarIcon className="w-4 h-4 text-slate-400" />
          </span>
        </button>

        {open && pos && (
          <div
            ref={popoverRef}
            className="fixed z-[70] rounded-2xl border border-slate-200 bg-white shadow-xl p-3"
            style={{ left: pos.left, top: pos.top, width: 320, maxWidth: 'calc(100vw - 2rem)' }}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  const d = parseYmd(draft);
                  if (!d) return;
                  const ymd = toYmd(d);
                  onChange(ymd);
                  setOpen(false);
                }}
                className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Set
              </button>
            </div>

            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (!d) return;
                onChange(toYmd(d));
                setOpen(false);
              }}
              month={viewMonth}
              onMonthChange={setViewMonth}
              fromDate={minDate}
              toDate={maxDate}
              className="rdp"
              classNames={{
                months: 'flex flex-col',
                month: 'space-y-3',
                caption: 'flex items-center justify-between px-1',
                caption_label: 'text-sm font-semibold text-slate-800',
                nav: 'flex items-center gap-1',
                nav_button:
                  'h-8 w-8 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors',
                table: 'w-full border-collapse table-fixed',
                head_row: '',
                head_cell: 'py-1 text-center text-[11px] font-semibold text-slate-500',
                row: 'mt-1',
                cell: 'p-0 text-center align-middle',
                day: 'text-sm text-slate-700',
                day_button:
                  'mx-auto w-9 h-9 p-0 inline-flex items-center justify-center rounded-full hover:bg-indigo-50 transition-colors leading-none',
                day_selected: 'bg-indigo-600 text-white hover:bg-indigo-600',
                day_today: 'ring-2 ring-indigo-500/25',
                day_outside: 'text-slate-300',
                day_disabled: 'text-slate-300 opacity-50',
              }}
            />

            <div className="mt-3 text-[11px] text-slate-400">
              Tip: press <span className="font-semibold">Esc</span> to close.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatePicker;
