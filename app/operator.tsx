'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  Info,
  KeyRound,
  Link2,
  LogOut,
  Mic,
  MonitorPlay,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Wallet,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  defaults,
  percentile,
  publicSettings,
  type Settings,
} from '@/lib/settings';
import { LiveSession, api, micError, type LiveUpdate } from '@/lib/live';
import { acceptCaption, type CaptionView } from '@/lib/caption-state';
import { CaptionLayer, LiveCaptions } from './captions';
import {
  Card,
  Field,
  Kbd,
  Meter,
  Pick,
  Segmented,
  Wordmark,
} from './console-parts';

type Status = {
  active: boolean;
  started: number;
  ended: number;
  hidden: boolean;
  settings: Settings;
  caption: string;
  source: string;
  revision: number;
  published: number;
  expires: number;
  serverNow: number;
  translationCost: number;
  unknownCost: boolean;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
  asrModel: string;
  ready: boolean;
  prices: { asr: number | null; input: number | null; output: number | null };
  viewerToken: string;
};
type EvaluateResult = {
  text: string;
  provider: string;
  model: string;
  translationMs: number;
  cost: number | null;
  input: number;
  output: number;
};
type AuthResponse = {
  local?: boolean;
  authenticated: boolean;
  configured: boolean;
};
/** One spoken phrase and its translation. Kept only in this browser tab. */
type FeedEntry = {
  id: number;
  ru: string;
  en: string | null;
  at: number;
  ms?: number;
};

const clock = (ms: number) =>
  new Date(Math.max(0, ms)).toISOString().slice(11, 19);
const timeOfDay = (t: number) =>
  new Date(t).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const providerName = (p?: string) =>
  p === 'gemini' ? 'Gemini' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI';
const SAMPLE =
  'Grace and peace to you from God our Father and the Lord Jesus Christ. Today we open the Gospel of John, chapter three.';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="slider"]',
    ),
  );
}

export default function Operator() {
  const [local, setLocal] = useState(false);
  const [auth, setAuth] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [s, setS] = useState<Settings>(defaults);
  const [savedSettings, setSavedSettings] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('system');
  const [live, setLive] = useState<LiveUpdate>({
    status: 'Сеанс не начат',
    running: false,
    pending: 0,
  });
  const [now, setNow] = useState(() => Date.now());
  const [url, setUrl] = useState('');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<EvaluateResult | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [gaps, setGaps] = useState(0);
  const [tab, setTab] = useState('live');
  const [view, setView] = useState<CaptionView | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const engine = useRef<LiveSession | null>(null);
  const levelRef = useRef(0);
  const feedId = useRef(0);
  const feedBox = useRef<HTMLOListElement>(null);
  const stickToEnd = useRef(true);
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => {});

  const load = useCallback(async (initial = false) => {
    const r = await fetch('/api/control', { cache: 'no-store' });
    if (r.status === 401) {
      setAuth(false);
      return;
    }
    const d = (await r.json()) as Status & { error?: string };
    if (!r.ok) throw new Error(d.error);
    const receivedAt = Date.now();
    setStatus(d);
    if (typeof d.revision === 'number') {
      setView((old) =>
        acceptCaption(
          old,
          {
            revision: d.revision,
            text: d.caption,
            published: d.published ?? 0,
            expires: d.expires ?? 0,
            serverNow: d.serverNow ?? receivedAt,
            settings: publicSettings(d.settings),
          },
          receivedAt,
        ),
      );
    }
    if (initial) {
      setS(d.settings);
      setSavedSettings(JSON.stringify(d.settings));
    }
    setUrl(`${location.origin}/output#${d.viewerToken}`);
  }, []);

  useEffect(() => {
    void fetch('/api/auth')
      .then((r) => r.json() as Promise<AuthResponse>)
      .then((d) => {
        setLocal(Boolean(d.local));
        setAuth(d.authenticated);
        setConfigured(d.configured);
        if (d.authenticated) void load(true).catch((e) => setError(e.message));
      })
      .catch(() => setError('Не удалось связаться с сервером.'));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      void engine.current?.stop();
    };
  }, [load]);

  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(timer);
  }, [auth, load]);

  const scan = useCallback(async () => {
    if (!navigator.mediaDevices) return;
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(
        (x) => x.kind === 'audioinput',
      );
      setDevices(list);
      setDevice((old) =>
        list.some((x) => x.deviceId === old)
          ? old
          : list[0]?.deviceId || 'system',
      );
    } catch (e) {
      setError(micError(e));
    }
  }, []);

  useEffect(() => {
    void scan();
    navigator.mediaDevices?.addEventListener('devicechange', scan);
    return () =>
      navigator.mediaDevices?.removeEventListener('devicechange', scan);
  }, [scan]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3800);
    return () => clearTimeout(t);
  }, [notice]);

  // Keep the newest phrase in view unless the operator scrolled up to read.
  useEffect(() => {
    const el = feedBox.current;
    if (el && stickToEnd.current) el.scrollTop = el.scrollHeight;
  }, [feed, live.partial]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(micError(e));
    } finally {
      setBusy(false);
    }
  }

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((old) => ({ ...old, [key]: value }));

  async function save() {
    const r = await api<{ settings: Settings }>('settings', { settings: s });
    setS(r.settings);
    setSavedSettings(JSON.stringify(r.settings));
    await load();
    setNotice('Настройки сохранены.');
  }

  function onLive(v: LiveUpdate) {
    if (v.level !== undefined) levelRef.current = v.level;
    const rest: LiveUpdate = { ...v };
    delete rest.level;
    if (!Object.keys(rest).length) return;
    setLive((old) => ({ ...old, ...rest }));
    if (v.error) setError(v.error);
    if (v.gap) setGaps((x) => x + 1);
    if (v.estimatedMs !== undefined)
      setSamples((old) => [...old, v.estimatedMs!].slice(-2000));
    if (v.caption && typeof v.caption.revision === 'number') {
      const caption = v.caption;
      setView((old) => acceptCaption(old, caption, Date.now()));
    }
    if (v.source) {
      const ru = v.source;
      setFeed((old) =>
        [...old, { id: ++feedId.current, ru, en: null, at: Date.now() }].slice(
          -80,
        ),
      );
    }
    if (v.text) {
      const en = v.text;
      setFeed((old) => {
        const i = old.findLastIndex((x) => x.en === null);
        if (i < 0)
          return [
            ...old,
            { id: ++feedId.current, ru: '', en, at: Date.now() },
          ].slice(-80);
        const next = old.slice();
        next[i] = { ...next[i], en, ms: v.estimatedMs };
        return next;
      });
    }
  }

  async function start() {
    setStarting(true);
    try {
      setError('');
      setNotice('');
      setSamples([]);
      setGaps(0);
      setFeed([]);
      stickToEnd.current = true;
      levelRef.current = 0;
      setLive({
        status: 'Запуск…',
        running: false,
        pending: 0,
        text: '',
        source: '',
        partial: '',
      });
      const session = new LiveSession(onLive);
      engine.current = session;
      if (JSON.stringify(s) !== savedSettings) await save();
      await session.start(device, s);
      await load();
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (engine.current) {
      await engine.current.stop();
      engine.current = null;
    } else await api('stop');
    levelRef.current = 0;
    setLive((old) => ({
      ...old,
      running: false,
      text: '',
      partial: '',
      status: 'Сеанс завершён',
    }));
    await load();
  }

  async function toggleHidden() {
    await api('screen', { hidden: !status?.hidden });
    await load();
  }

  async function clearScreen() {
    await api('screen', { clear: true });
    setView((old) => (old ? { ...old, text: '', expires: 0 } : old));
    await load();
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    setNotice('Ссылка на экран скопирована.');
  }

  async function rotate() {
    if (
      !window.confirm(
        'Отозвать текущую ссылку экрана? Все телевизоры и источники OBS со старой ссылкой перестанут показывать субтитры.',
      )
    )
      return;
    await api('screen', { rotate: true });
    await load();
    setNotice('Прежняя ссылка отозвана. Замените её в источниках OBS.');
  }

  const active = Boolean(live.running || status?.active);
  const dirty = JSON.stringify(s) !== savedSettings;
  const elapsed = status?.started
    ? (active ? now : status.ended || now) - status.started
    : 0;
  const estimated =
    (status?.translationCost || 0) +
    ((status?.prices.asr ?? 0) * elapsed) / 60000;
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const budget = status?.settings.budget ?? s.budget;
  const budgetRatio = status?.started ? Math.min(1, estimated / budget) : 0;
  const screenUrl = url.replace('/output#', '/output?background=black#');
  const liveStyle = useMemo(
    () => publicSettings(status?.settings ?? s),
    [status?.settings, s],
  );
  const draftStyle = useMemo(() => publicSettings(s), [s]);
  const sampleView = useMemo<CaptionView>(
    () => ({
      revision: 0,
      text: SAMPLE,
      published: 0,
      expires: Number.MAX_SAFE_INTEGER,
      clockOffset: 0,
      settings: draftStyle,
    }),
    [draftStyle],
  );

  function downloadMetrics() {
    const data = {
      generatedAt: new Date().toISOString(),
      scope:
        'operator preview; estimated from receipt of VAD speech_stopped minus 450 ms; not physical screen or acoustic measurement',
      samples: samples.length,
      p50Ms: p50,
      p95Ms: p95,
      estimatedSessionUsd: estimated,
      uncertainCost: status?.unknownCost,
      durationSeconds: elapsed / 1000,
      reconnectionWarnings: gaps,
      transcription: status?.asrModel,
      translation: status?.model,
    };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    link.download = 'church-session-metrics.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // H hides or shows captions, C clears the screen. Physical keys, so the
  // Russian keyboard layout works too.
  useEffect(() => {
    shortcuts.current = (e: KeyboardEvent) => {
      if (tab !== 'live' || !status || busy) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target))
        return;
      if (e.code === 'KeyH') {
        e.preventDefault();
        void run(toggleHidden);
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        void run(clearScreen);
      }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => shortcuts.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ---------- Loading ---------- */
  if (auth === null)
    return (
      <main className="app auth">
        <div className="loading">
          <Wordmark sub={false} />
          {error ? (
            <div className="banner banner-error" role="alert">
              <AlertTriangle />
              <div className="banner-body">{error}</div>
            </div>
          ) : (
            <>
              <span className="spinner" aria-hidden="true" />
              Подключение к пульту…
            </>
          )}
        </div>
      </main>
    );

  /* ---------- Sign in ---------- */
  if (!auth)
    return (
      <main className="app auth">
        <div className="auth-card">
          <div className="auth-hero">
            <Wordmark />
            <h1>Пусть каждый услышит.</h1>
            <p>
              Русская речь превращается в английские субтитры на экранах церкви
              и в трансляции.
            </p>
          </div>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password }),
                });
                const d = (await r.json()) as { error?: string };
                if (!r.ok) throw new Error(d.error);
                setPassword('');
                setAuth(true);
                await load(true);
              });
            }}
          >
            <h2 className="card-title">
              <KeyRound />
              Вход для оператора
            </h2>
            {!configured && (
              <div className="banner">
                <Info />
                <div className="banner-body">
                  Первоначальная настройка не завершена. Администратору нужно
                  задать пароль оператора на сервере. Инструкция есть в README
                  проекта.
                </div>
              </div>
            )}
            <Field label="Пароль оператора">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || !configured}
            >
              {busy ? <span className="spinner" /> : <ShieldCheck />}
              Войти в пульт
            </button>
            {error && (
              <div className="banner banner-error" role="alert">
                <AlertTriangle />
                <div className="banner-body">{error}</div>
              </div>
            )}
            <p className="hint">
              Управление и запуск AI защищены паролем. Для зрителей используется
              отдельная ссылка, которая открывает только субтитры.
            </p>
          </form>
        </div>
      </main>
    );

  /* ---------- Console ---------- */
  const stageFlag = status?.hidden ? (
    <span className="tag tag-warn">
      <EyeOff size={12} />
      Скрыто
    </span>
  ) : active ? (
    <span className="tag tag-live">В эфире</span>
  ) : (
    <span className="tag">Не в эфире</span>
  );
  const showFallback =
    !feed.length && !live.partial && (status?.source || status?.caption);

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(String(v))}>
      <div className="app">
        <header className="topbar">
          <Wordmark />
          <Tabs.List className="nav" aria-label="Разделы пульта">
            <Tabs.Tab className="nav-tab" value="live">
              <Radio />
              <span>Служение</span>
            </Tabs.Tab>
            <Tabs.Tab className="nav-tab" value="settings">
              <SlidersHorizontal />
              <span>Настройки</span>
              {dirty && (
                <i className="nav-dot" title="Есть несохранённые изменения" />
              )}
            </Tabs.Tab>
            <Tabs.Tab className="nav-tab" value="test">
              <FlaskConical />
              <span>Проверка</span>
            </Tabs.Tab>
          </Tabs.List>
          <div className="topbar-end">
            {active ? (
              <span className="pill pill-live" role="status">
                <i className="dot dot-live" />
                <span className="pill-label">В эфире</span>
                <time>{clock(elapsed)}</time>
              </span>
            ) : (
              <span className="pill" role="status">
                <i className={`dot ${status?.ready ? 'dot-ok' : 'dot-warn'}`} />
                {status?.ready ? 'Готов' : 'AI не настроен'}
              </span>
            )}
            {!local && (
              <button
                className="btn btn-ghost btn-icon"
                aria-label="Выйти"
                title="Выйти"
                disabled={active || busy}
                onClick={() =>
                  void run(async () => {
                    await fetch('/api/auth', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'logout' }),
                    });
                    setAuth(false);
                  })
                }
              >
                <LogOut />
              </button>
            )}
          </div>
        </header>

        <main className="page">
          {(error || (status && !status.ready)) && (
            <div className="banners">
              {error && (
                <div className="banner banner-error" role="alert">
                  <AlertTriangle />
                  <div className="banner-body">{error}</div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setError('')}
                  >
                    Понятно
                  </button>
                </div>
              )}
              {status && !status.ready && (
                <div className="banner">
                  <Info />
                  <div className="banner-body">
                    AI ещё не подключён. Добавьте ключи OpenAI и{' '}
                    {providerName(status.provider)} в конфигурацию сервера.
                    Захват и платные запросы не запущены.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------- Live service ---------- */}
          <Tabs.Panel value="live">
            <div className="live-grid">
              <div className="stack">
                <Card
                  title="Экран субтитров"
                  className="area-screen"
                  icon={<MonitorPlay />}
                  aside={
                    <span className="card-sub">16:9 · как видят зрители</span>
                  }
                >
                  <div
                    className={`stage ${liveStyle.transparent ? 'stage-transparent' : ''} ${status?.hidden ? 'stage-hidden' : ''}`}
                    style={
                      liveStyle.transparent
                        ? undefined
                        : { background: liveStyle.background }
                    }
                  >
                    <div className="stage-flag">{stageFlag}</div>
                    <LiveCaptions view={view} style={liveStyle} />
                    {(!view?.text ||
                      view.expires <= now + view.clockOffset) && (
                      <div className="stage-empty">
                        <MonitorPlay />
                        {active
                          ? 'Ожидание английского перевода'
                          : 'Субтитры появятся здесь во время служения'}
                      </div>
                    )}
                  </div>
                  <div className="toolbar">
                    <button
                      className="btn"
                      disabled={!status || busy}
                      onClick={() => void run(toggleHidden)}
                    >
                      {status?.hidden ? <Eye /> : <EyeOff />}
                      {status?.hidden ? 'Показать' : 'Скрыть'}
                      <Kbd>H</Kbd>
                    </button>
                    <button
                      className="btn"
                      disabled={!status || busy}
                      onClick={() => void run(clearScreen)}
                    >
                      <Eraser />
                      Очистить
                      <Kbd>C</Kbd>
                    </button>
                    <span className="spacer" />
                    <a
                      className="btn"
                      href={screenUrl || undefined}
                      aria-disabled={!url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      Открыть экран
                    </a>
                  </div>
                </Card>

                <Card
                  title="Лента перевода"
                  className="area-feed"
                  icon={<Activity />}
                  aside={
                    <span className="card-sub">
                      {feed.length
                        ? `${feed.length} фраз · только в этой вкладке`
                        : 'Текст не сохраняется'}
                    </span>
                  }
                >
                  {feed.length || live.partial ? (
                    <ol
                      className="feed"
                      ref={feedBox}
                      aria-live="polite"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        stickToEnd.current =
                          el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                      }}
                    >
                      {feed.map((entry) => (
                        <li className="feed-item" key={entry.id}>
                          <div className="feed-meta">
                            <time>{timeOfDay(entry.at)}</time>
                            {entry.ms !== undefined && (
                              <span>{(entry.ms / 1000).toFixed(1)} с</span>
                            )}
                          </div>
                          <p className="feed-ru" lang="ru">
                            {entry.ru}
                          </p>
                          <p className="feed-en" lang="en">
                            {entry.en ??
                              (live.running ? (
                                <span className="typing" aria-label="Перевожу">
                                  <i />
                                  <i />
                                  <i />
                                </span>
                              ) : (
                                <span className="feed-missing" lang="ru">
                                  Не переведено: сеанс остановлен
                                </span>
                              ))}
                          </p>
                        </li>
                      ))}
                      {live.partial && (
                        <li className="feed-item feed-partial">
                          <div className="feed-meta">
                            <span>слышу…</span>
                          </div>
                          <p className="feed-ru" lang="ru">
                            {live.partial}
                          </p>
                        </li>
                      )}
                    </ol>
                  ) : showFallback ? (
                    <ol className="feed">
                      <li className="feed-item">
                        <div className="feed-meta">
                          <span>последняя</span>
                        </div>
                        <p className="feed-ru" lang="ru">
                          {status?.source}
                        </p>
                        <p className="feed-en" lang="en">
                          {status?.caption}
                        </p>
                      </li>
                    </ol>
                  ) : (
                    <div className="empty-state">
                      <Radio />
                      <strong>Здесь появится перевод по фразам</strong>
                      <span>
                        Сверху русская речь, крупно английский перевод. Речь
                        обрабатывается фрагментами примерно по 3 секунды.
                      </span>
                    </div>
                  )}
                </Card>
              </div>

              <aside className="side">
                <Card title="Сеанс" icon={<Mic />} className="area-session">
                  <div className="stack">
                    <Field label="Микрофон или вход пульта">
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <Pick
                          label="Микрофон"
                          value={device}
                          onChange={setDevice}
                          disabled={active || busy}
                          options={devices
                            .filter((d) => d.deviceId)
                            .map((d, i) => ({
                              value: d.deviceId,
                              label: d.label || `Микрофон ${i + 1}`,
                            }))}
                        />
                        <button
                          className="btn btn-icon"
                          title="Разрешить доступ и обновить список"
                          aria-label="Разрешить доступ и обновить список"
                          disabled={active || busy}
                          onClick={() =>
                            void run(async () => {
                              const stream =
                                await navigator.mediaDevices.getUserMedia({
                                  audio: true,
                                  video: false,
                                });
                              stream.getTracks().forEach((t) => t.stop());
                              await scan();
                            })
                          }
                        >
                          <RefreshCw />
                        </button>
                      </div>
                    </Field>
                    <div>
                      <Meter levelRef={levelRef} />
                      <div className="meter-scale">
                        <span>−∞</span>
                        <span>
                          {s.cleanInput
                            ? 'Чистый вход пульта'
                            : 'Обработка микрофона'}
                        </span>
                        <span>0 dB</span>
                      </div>
                    </div>
                    {active || starting ? (
                      <button
                        className="btn btn-stop btn-lg btn-block"
                        disabled={!active && !starting}
                        onClick={() => void run(stop)}
                      >
                        <Square fill="currentColor" />
                        Остановить
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-lg btn-block"
                        disabled={busy || !device || !status?.ready}
                        onClick={() => void run(start)}
                      >
                        <Play fill="currentColor" />
                        Начать перевод
                      </button>
                    )}
                    <dl className="checks">
                      <div>
                        <dt>Распознавание</dt>
                        <dd>
                          <i
                            className={`dot ${live.running ? 'dot-ok' : ''}`}
                          />
                          {live.status}
                        </dd>
                      </div>
                      <div>
                        <dt>AI</dt>
                        <dd>
                          <i
                            className={`dot ${status?.ready ? 'dot-ok' : 'dot-warn'}`}
                          />
                          {status?.ready ? 'Настроен' : 'Не настроен'}
                        </dd>
                      </div>
                      <div>
                        <dt>В очереди</dt>
                        <dd>{live.pending || 0}</dd>
                      </div>
                      <div>
                        <dt>Разрывы связи</dt>
                        <dd>
                          {gaps > 0 && <i className="dot dot-warn" />}
                          {gaps}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </Card>

                <Card
                  title="Показатели"
                  icon={<Wallet />}
                  className="area-stats"
                >
                  <div className="stats">
                    <div className="stat">
                      <span className="stat-label">Длительность</span>
                      <strong className="stat-value">{clock(elapsed)}</strong>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Задержка · P50</span>
                      <strong className="stat-value">
                        {p50 === null ? '—' : `${(p50 / 1000).toFixed(1)} с`}
                      </strong>
                      <span className="stat-sub">
                        P95{' '}
                        {p95 === null ? '—' : `${(p95 / 1000).toFixed(1)} с`} ·{' '}
                        {samples.length} фраз
                      </span>
                    </div>
                    <div className="stat stat-wide">
                      <span className="stat-label">
                        Расход · оценка из ${budget.toFixed(2)}
                      </span>
                      <strong className="stat-value">
                        {status?.started ? `$${estimated.toFixed(3)}` : '—'}
                      </strong>
                      <div
                        className="budget"
                        data-level={
                          budgetRatio > 0.9
                            ? 'high'
                            : budgetRatio > 0.7
                              ? 'warn'
                              : 'ok'
                        }
                        role="progressbar"
                        aria-label="Расход бюджета"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(budgetRatio * 100)}
                      >
                        <div style={{ width: `${budgetRatio * 100}%` }} />
                      </div>
                      <span className="stat-sub">
                        При достижении ориентира сеанс остановится.
                        {status?.unknownCost
                          ? ' Часть стоимости неизвестна.'
                          : ''}
                      </span>
                    </div>
                  </div>
                  <p className="hint" style={{ marginTop: 12 }}>
                    Последний перевод:{' '}
                    {live.translationMs
                      ? `${(live.translationMs / 1000).toFixed(2)} с`
                      : '—'}
                    . Задержка оценена до предпросмотра, а не до телевизора.
                  </p>
                </Card>

                <Card
                  title="Ссылка для OBS"
                  icon={<Link2 />}
                  className="area-link"
                >
                  <div className="stack-sm">
                    <div className="linkbox">
                      <code title={url}>{url || 'Загрузка ссылки…'}</code>
                      <button
                        className="btn"
                        disabled={!url}
                        onClick={() => void run(copy)}
                      >
                        {copied ? <Check /> : <Copy />}
                        {copied ? 'Готово' : 'Копировать'}
                      </button>
                    </div>
                    <p className="hint">
                      Источник браузера 1920 × 1080. Ссылка открывает только
                      субтитры. На опубликованной версии Sites экран также
                      требует входа владельца.
                    </p>
                    <button
                      className="btn btn-ghost"
                      style={{ justifySelf: 'start', paddingLeft: 0 }}
                      onClick={downloadMetrics}
                      disabled={!samples.length}
                    >
                      <Download />
                      Скачать метрики без текста
                    </button>
                  </div>
                </Card>
              </aside>
            </div>
          </Tabs.Panel>

          {/* ---------- Settings ---------- */}
          <Tabs.Panel value="settings">
            {active && (
              <div className="banners">
                <div className="banner">
                  <Info />
                  <div className="banner-body">
                    Идёт сеанс. Настройки можно менять после остановки.
                  </div>
                </div>
              </div>
            )}
            <div className="settings-grid">
              <Card
                title="Оформление экрана"
                icon={<MonitorPlay />}
                className="sticky-preview"
                aside={
                  <span className="card-sub">Предпросмотр 1920 × 1080</span>
                }
              >
                <div className="stack">
                  <div
                    className={`stage ${s.transparent ? 'stage-transparent' : ''}`}
                    style={
                      s.transparent ? undefined : { background: s.background }
                    }
                  >
                    <div
                      className="safe-area"
                      style={{ inset: `${s.margin}%` }}
                      aria-hidden="true"
                    />
                    <CaptionLayer
                      view={sampleView}
                      style={draftStyle}
                      now={0}
                    />
                  </div>
                  <Field label="Размер текста" value={`${s.fontSize} px`}>
                    <Slider
                      disabled={active}
                      min={32}
                      max={96}
                      step={2}
                      value={[s.fontSize]}
                      onValueChange={(v) =>
                        change('fontSize', Array.isArray(v) ? v[0] : v)
                      }
                      aria-label="Размер текста"
                    />
                  </Field>
                  <div className="grid-2">
                    <Field label="Положение">
                      <Segmented
                        label="Положение"
                        value={s.position}
                        disabled={active}
                        onChange={(v) => change('position', v)}
                        options={[
                          { value: 'top', label: 'Вверху' },
                          { value: 'center', label: 'Центр' },
                          { value: 'bottom', label: 'Внизу' },
                        ]}
                      />
                    </Field>
                    <Field label="Строк на экране">
                      <Segmented
                        label="Строк на экране"
                        value={s.lines}
                        disabled={active}
                        onChange={(v) => change('lines', v)}
                        options={[1, 2, 3, 4].map((x) => ({
                          value: x,
                          label: String(x),
                        }))}
                      />
                    </Field>
                  </div>
                  <Field label="Безопасные отступы" value={`${s.margin}%`}>
                    <Slider
                      disabled={active}
                      min={3}
                      max={18}
                      step={1}
                      value={[s.margin]}
                      onValueChange={(v) =>
                        change('margin', Array.isArray(v) ? v[0] : v)
                      }
                      aria-label="Безопасные отступы"
                    />
                  </Field>
                  <div className="grid-2">
                    <Field label="Цвет текста">
                      <span className="color-field">
                        <input
                          type="color"
                          aria-label="Цвет текста"
                          value={s.color}
                          onChange={(e) => change('color', e.target.value)}
                          disabled={active}
                        />
                        <code>{s.color}</code>
                      </span>
                    </Field>
                    <Field label="Цвет фона">
                      <span className="color-field">
                        <input
                          type="color"
                          aria-label="Цвет фона"
                          value={s.background}
                          onChange={(e) => change('background', e.target.value)}
                          disabled={active}
                        />
                        <code>{s.background}</code>
                      </span>
                    </Field>
                  </div>
                  <div className="switch-row">
                    <div>
                      <strong>Прозрачный фон для OBS</strong>
                      <p className="hint">
                        Экран телевизора всегда использует цвет фона.
                      </p>
                    </div>
                    <Switch
                      aria-label="Прозрачный фон для OBS"
                      disabled={active}
                      checked={s.transparent}
                      onCheckedChange={(v) => change('transparent', v)}
                    />
                  </div>
                  <Field
                    label="Очистка после фразы"
                    hint="Сколько секунд держать последнюю фразу, если новой речи нет."
                  >
                    <input
                      className="input"
                      type="number"
                      min={4}
                      max={60}
                      disabled={active}
                      value={s.clearSeconds}
                      onChange={(e) =>
                        change('clearSeconds', Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
              </Card>

              <div className="stack">
                <Card title="Подготовка к проповеди" icon={<BookOpen />}>
                  <div className="stack">
                    <Field label="Тема">
                      <input
                        className="input"
                        disabled={active}
                        value={s.topic}
                        maxLength={500}
                        onChange={(e) => change('topic', e.target.value)}
                        placeholder="Например: вера и благодать"
                      />
                    </Field>
                    <Field
                      label="Имена и книги Библии"
                      hint="Через запятую. Помогают распознаванию и переводу."
                    >
                      <input
                        className="input"
                        disabled={active}
                        value={s.names}
                        maxLength={1000}
                        onChange={(e) => change('names', e.target.value)}
                        placeholder="Павел, Тимофей, Послание к Евреям"
                      />
                    </Field>
                    <Field
                      label="Словарь"
                      value={`${s.glossary.split('\n').filter((x) => x.includes('=')).length} терминов`}
                      hint="Одна пара на строку: русский термин = English term."
                    >
                      <textarea
                        className="textarea mono"
                        disabled={active}
                        value={s.glossary}
                        maxLength={6000}
                        onChange={(e) => change('glossary', e.target.value)}
                        rows={8}
                        spellCheck={false}
                      />
                    </Field>
                  </div>
                </Card>

                <Card title="Звук и бюджет" icon={<SlidersHorizontal />}>
                  <div className="stack">
                    <div className="switch-row">
                      <div>
                        <strong>Чистый сигнал пульта</strong>
                        <p className="hint">
                          Отключает эхо- и шумоподавление и автоусиление. Для
                          обычного микрофона этот режим можно выключить.
                        </p>
                      </div>
                      <Switch
                        aria-label="Чистый сигнал пульта"
                        disabled={active}
                        checked={s.cleanInput}
                        onCheckedChange={(v) => change('cleanInput', v)}
                      />
                    </div>
                    <Field
                      label="Ориентир бюджета на сеанс, USD"
                      hint="При достижении сеанс остановится. Итоговый счёт может отличаться."
                    >
                      <input
                        className="input"
                        type="number"
                        min={0.1}
                        max={100}
                        step={0.1}
                        disabled={active}
                        value={s.budget}
                        onChange={(e) =>
                          change('budget', Number(e.target.value))
                        }
                      />
                    </Field>
                  </div>
                </Card>

                <Card title="Доступ и подключение" icon={<ShieldCheck />}>
                  <div className="stack">
                    <dl className="kv">
                      <dt>Распознавание</dt>
                      <dd>{status?.asrModel ?? '—'}</dd>
                      <dt>Перевод</dt>
                      <dd>
                        {status
                          ? `${providerName(status.provider)} · ${status.model}`
                          : '—'}
                      </dd>
                    </dl>
                    <p className="hint">
                      Провайдера и ключи меняет администратор на сервере. Для
                      телевизора нажмите «Открыть экран» и включите
                      полноэкранный режим.
                    </p>
                    <button
                      className="btn btn-wrap"
                      style={{ justifySelf: 'start' }}
                      disabled={busy}
                      onClick={() => void run(rotate)}
                    >
                      <RotateCcw />
                      Отозвать ссылку экрана и создать новую
                    </button>
                  </div>
                </Card>
              </div>
            </div>
            {dirty && !active && (
              <div className="savebar" role="region" aria-label="Сохранение">
                <p>
                  <i className="dot dot-warn" />
                  Есть несохранённые изменения. Они применятся ко всем экранам.
                </p>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setS(JSON.parse(savedSettings) as Settings)}
                >
                  <X />
                  Отменить
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void run(save)}
                >
                  <Check />
                  Сохранить
                </button>
              </div>
            )}
          </Tabs.Panel>

          {/* ---------- Translation test ---------- */}
          <Tabs.Panel value="test">
            <div className="settings-grid">
              <Card
                title="Проверка перевода без микрофона"
                icon={<FlaskConical />}
              >
                <div className="stack">
                  <p className="hint">
                    Введите правильный русский текст, чтобы оценить перевод
                    отдельно от распознавания. Кнопка отправит один реальный
                    платный запрос. Результат не выводится зрителям.
                  </p>
                  <Field
                    label="Русский текст"
                    value={`${testText.length} / 1800`}
                  >
                    <textarea
                      className="textarea"
                      maxLength={1800}
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      rows={8}
                      placeholder="Введите фрагмент, на обработку которого у вас есть разрешение…"
                    />
                  </Field>
                  <button
                    className="btn btn-primary btn-lg"
                    disabled={
                      active || busy || !status?.ready || !testText.trim()
                    }
                    onClick={() =>
                      void run(async () => {
                        if (dirty) await save();
                        setTestResult(null);
                        setTestResult(
                          await api<EvaluateResult>('evaluate', {
                            text: testText,
                          }),
                        );
                      })
                    }
                  >
                    {busy ? <span className="spinner" /> : <FlaskConical />}
                    Проверить через AI
                  </button>
                </div>
              </Card>
              <Card title="Результат" icon={<CheckCircle2 />}>
                {testResult ? (
                  <div className="stack">
                    <div className="result" lang="en">
                      {testResult.text}
                    </div>
                    <dl className="kv">
                      <dt>Модель</dt>
                      <dd>
                        {providerName(testResult.provider)} · {testResult.model}
                      </dd>
                      <dt>Время</dt>
                      <dd>{(testResult.translationMs / 1000).toFixed(2)} с</dd>
                      <dt>Стоимость</dt>
                      <dd>
                        {testResult.cost === null
                          ? 'неизвестна'
                          : `≈ $${testResult.cost.toFixed(5)}`}
                      </dd>
                      <dt>Токены</dt>
                      <dd>
                        вход {testResult.input}, выход {testResult.output}
                      </dd>
                    </dl>
                  </div>
                ) : (
                  <div className="empty-state" style={{ minHeight: 160 }}>
                    <FlaskConical />
                    <span>Перевод появится здесь.</span>
                  </div>
                )}
                <div className="stack-sm" style={{ marginTop: 20 }}>
                  <p className="hint">Что проверить:</p>
                  <ul className="checklist">
                    {[
                      'Отрицания и числа',
                      'Имена и ссылки на Писание',
                      'Пропуски и добавления',
                      'Термины из словаря',
                    ].map((x) => (
                      <li key={x}>
                        <Check />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>
          </Tabs.Panel>
        </main>

        <footer className="footer">
          <span>Слово · русский → English</span>
          <span>
            <ShieldCheck />
            Облачные AI API · аудио не сохраняется приложением
          </span>
        </footer>

        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 />
            {notice}
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}
