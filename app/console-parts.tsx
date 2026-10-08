'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Candle-flame mark: light for the room, one word for everyone. */
export function Wordmark({ sub = true }: { sub?: boolean }) {
  return (
    <div className="wordmark">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5c.6 2.6 2.4 4.3 3.7 6.1 1 1.4 1.6 2.9 1.6 4.6a5.3 5.3 0 0 1-10.6 0c0-2.1 1-3.7 2.3-5 .2 1.5.9 2.6 1.9 3.2-.3-3.4.1-6.2 1.1-8.9Z" />
          <rect x="11" y="19.5" width="2" height="2.5" rx="1" />
        </svg>
      </span>
      <span className="wordmark-name">Слово</span>
      {sub && <span className="wordmark-sub">Перевод богослужения</span>}
    </div>
  );
}

export function Card({
  title,
  icon,
  aside,
  children,
  className = '',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <div className="card-head">
          {title && (
            <h2 className="card-title">
              {icon}
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  hint,
  children,
}: {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {value !== undefined && <em>{value}</em>}
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Pick({
  value,
  onChange,
  options,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (x: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  label: string;
}) {
  const available = options.length
    ? options
    : [{ value: 'system', label: 'Системный микрофон' }];
  return (
    <Select
      value={value}
      onValueChange={(x) => x && onChange(x)}
      disabled={disabled}
      items={available}
    >
      <SelectTrigger
        aria-label={label}
        className="h-[42px]! w-full min-w-0 rounded-[10px] bg-background! px-3 text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {available.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="kbd" aria-hidden="true">
      {children}
    </kbd>
  );
}

const SEGMENTS = 32;

/**
 * Segmented input meter. Reads the level from a ref on every animation frame
 * so 60 fps audio levels never re-render the whole console.
 */
export function Meter({ levelRef }: { levelRef: RefObject<number> }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    let shown = 0;
    const draw = () => {
      const el = box.current;
      if (el) {
        const target = Math.max(0, Math.min(1, levelRef.current || 0));
        // Fast attack, slow release reads like a real console meter.
        shown = target > shown ? target : shown * 0.9 + target * 0.1;
        const lit = Math.round(shown * SEGMENTS);
        const cells = el.children;
        for (let i = 0; i < cells.length; i++) {
          if (i < lit) cells[i].setAttribute('data-on', '');
          else cells[i].removeAttribute('data-on');
        }
        el.setAttribute('aria-valuenow', String(Math.round(target * 100)));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);
  return (
    <div
      ref={box}
      className="meter"
      role="meter"
      aria-label="Уровень входного сигнала"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i
          key={i}
          data-zone={
            i >= SEGMENTS - 2
              ? 'clip'
              : i >= SEGMENTS * 0.78
                ? 'hot'
                : i >= SEGMENTS * 0.6
                  ? 'mid'
                  : 'ok'
          }
        />
      ))}
    </div>
  );
}
