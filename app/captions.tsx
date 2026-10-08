'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { captionColumns, captionPages } from '@/lib/core';
import {
  acceptCaption,
  captionPageAt,
  visibleCaption,
  type CaptionSnapshot,
  type CaptionStyle,
  type CaptionView,
} from '@/lib/caption-state';
import { publicSettings, defaults } from '@/lib/settings';

/** Re-render on a steady tick so pages advance and expired captions disappear. */
export function useClock(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Draws the caption page that is current on the server clock, so the operator
 * preview, every TV and every OBS source show the same page at the same time.
 */
export function CaptionLayer({
  view,
  style,
  now,
}: {
  view: CaptionView | null;
  style: CaptionStyle;
  now: number;
}) {
  const reduceMotion = useReducedMotion();
  const text = visibleCaption(view, now);
  const columns = captionColumns(style);
  const pages = useMemo(
    () => (text ? captionPages(text, columns, style.lines) : []),
    [text, columns, style.lines],
  );
  const page =
    view && pages.length
      ? captionPageAt(pages.length, view.published, now + view.clockOffset)
      : 0;
  const current = pages[page] || '';
  const placement =
    style.position === 'bottom'
      ? { bottom: `${style.margin}%` }
      : style.position === 'top'
        ? { top: `${style.margin}%` }
        : { top: 0, bottom: 0 };
  const fade = reduceMotion ? 0 : 0.16;
  return (
    <AnimatePresence initial={false}>
      {current && (
        <motion.div
          key={`${view?.revision}:${page}:${columns}:${style.lines}`}
          className="caption-frame"
          style={{ ...placement, padding: `0 ${style.margin}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: fade } }}
          exit={{ opacity: 0, transition: { duration: fade * 0.75 } }}
        >
          <p
            className="caption"
            lang="en"
            style={{
              color: style.color,
              fontSize: `${style.fontSize / 19.2}cqw`,
            }}
          >
            {current}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Caption layer with its own clock, for previews that should not re-render a whole page. */
export function LiveCaptions({
  view,
  style,
}: {
  view: CaptionView | null;
  style: CaptionStyle;
}) {
  const now = useClock();
  return <CaptionLayer view={view} style={style} now={now} />;
}

type OutputData = CaptionSnapshot & { ttl: number };

/** The public screen for TVs and OBS. Shows nothing but captions. */
export default function Output() {
  const [view, setView] = useState<CaptionView | null>(null);
  const [style, setStyle] = useState<CaptionStyle>(() =>
    publicSettings(defaults),
  );
  const [tvMode, setTvMode] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const now = useClock();

  useEffect(() => {
    setTvMode(
      new URLSearchParams(window.location.search).get('background') === 'black',
    );
  }, []);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const poll = async () => {
      try {
        const r = await fetch('/api/output', {
          cache: 'no-store',
          signal: abort.signal,
        });
        if (r.status === 403) {
          setRevoked(true);
          setView(null);
          timer = setTimeout(poll, 5000);
          return;
        }
        if (!r.ok) throw new Error();
        const data = (await r.json()) as OutputData;
        if (closed) return;
        setRevoked(false);
        setStyle(data.settings);
        setView((old) => acceptCaption(old, data, Date.now()));
        timer = setTimeout(poll, 350);
      } catch {
        if (closed) return;
        // Never leave a stale sentence on screen while the server is unreachable.
        setView(null);
        timer = setTimeout(poll, 1500);
      }
    };
    const start = async () => {
      const token = location.hash.slice(1);
      if (token) {
        const r = await fetch('/api/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: abort.signal,
        });
        history.replaceState(null, '', location.pathname + location.search);
        if (!r.ok) {
          setRevoked(true);
          return;
        }
      }
      await poll();
    };
    void start().catch(() => {});
    return () => {
      closed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, []);

  const background = tvMode
    ? style.background
    : style.transparent
      ? 'transparent'
      : style.background;
  return (
    <div className="output-stage" style={{ background }}>
      <style>{'html, body {background:transparent!important;}'}</style>
      <CaptionLayer view={view} style={style} now={now} />
      {revoked && tvMode && (
        <p className="output-revoked" role="status">
          Ссылка экрана отозвана. Откройте новую ссылку из пульта оператора.
        </p>
      )}
    </div>
  );
}
