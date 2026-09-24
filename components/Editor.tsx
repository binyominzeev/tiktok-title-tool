'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TitleSettings } from '../lib/template';
import { applyTemplate, svgToDataUrl } from '../lib/template';

const DEFAULTS: TitleSettings = {
  text: 'A cím helye',
  x: 540,
  y: 305,
  fontSize: 58,
  fontWeight: 700,
  color: '#ffffff',
  backgroundColor: '#111111',
  backgroundOpacity: 0.78,
  paddingX: 28,
  paddingY: 18,
  radius: 28
};

const PRESET_KEY = 'tiktok-title-tool-preset';

export default function Editor() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState('');
  const [settings, setSettings] = useState<TitleSettings>(DEFAULTS);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/template.svg')
      .then((r) => r.text())
      .then(setTemplate)
      .catch(() => setMessage('Nem sikerült betölteni a template.svg fájlt.'));

    const saved = localStorage.getItem(PRESET_KEY);
    if (saved) {
      try { setSettings({ ...DEFAULTS, ...JSON.parse(saved) }); } catch { /* ignore */ }
    }
  }, []);

  const svg = useMemo(() => {
    if (!template) return '';
    try { return applyTemplate(template, settings); }
    catch (e) { return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><text x="20" y="40" fill="red">${String(e)}</text></svg>`; }
  }, [template, settings]);

  const update = <K extends keyof TitleSettings>(key: K, value: TitleSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const chooseVideo = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setFrameUrl(null);
    setMessage('');
  };

  const captureFrame = async (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setFrameUrl(canvas.toDataURL('image/jpeg', 0.9));
  };

  const handleVideoLoaded = (video: HTMLVideoElement) => {
    if (video.duration && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(1, video.duration / 2);
    }
  };

  const handleTimeUpdate = (video: HTMLVideoElement) => {
    if (video.currentTime > 0) {
      void captureFrame(video);
      video.pause();
    }
  };

  const moveTitle = (clientX: number, clientY: number) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    update('x', Math.round(Math.max(0, Math.min(1080, ((clientX - box.left) / box.width) * 1080))));
    update('y', Math.round(Math.max(0, Math.min(1920, ((clientY - box.top) / box.height) * 1920))));
  };

  const exportSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'title-overlay.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVideo = async () => {
    if (!videoFile || !svg) {
      setMessage('Előbb válassz videót.');
      return;
    }
    setBusy(true);
    setProgress(1);
    setMessage('Exportálás…');
    try {
      const form = new FormData();
      form.append('video', videoFile);
      form.append('svg', svg);
      const response = await fetch('/api/export', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await response.text());
      const { id } = await response.json() as { id: string };
      let status: { status: string; progress?: number; error?: string } = { status: 'processing' };
      while (status.status === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const statusResponse = await fetch(`/api/export?id=${encodeURIComponent(id)}`);
        if (!statusResponse.ok) throw new Error(await statusResponse.text());
        status = await statusResponse.json();
        if (typeof status.progress === 'number') setProgress(status.progress);
      }
      if (status.status === 'failed') throw new Error(status.error || 'Export failed.');
      const downloadResponse = await fetch(`/api/export?id=${encodeURIComponent(id)}&download=1`);
      if (!downloadResponse.ok) throw new Error(await downloadResponse.text());
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoFile.name.replace(/\.[^.]+$/, '')}-titled.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Kész.');
    } catch (e) {
      setMessage(`Hiba: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const savePreset = () => {
    localStorage.setItem(PRESET_KEY, JSON.stringify(settings));
    setMessage('Beállítások elmentve ezen a gépen.');
  };

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>TikTok Title Tool</h1>
          <p>SVG-template alapú gyors címégető</p>
        </div>
        <label className="button primary upload">
          Videó megnyitása
          <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && chooseVideo(e.target.files[0])} />
        </label>
      </header>

      <section className="workspace">
        <div className="preview-panel">
          <div
            ref={canvasRef}
            className="preview"
            onPointerDown={(e) => { setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); moveTitle(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if (dragging) moveTitle(e.clientX, e.clientY); }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
          >
            {frameUrl ? <img className="frame" src={frameUrl} alt="Video frame" /> : <div className="empty">Válassz egy videót</div>}
            {svg && <img className="overlay" src={svgToDataUrl(svg)} alt="SVG title preview" />}
          </div>
          {videoUrl && (
            <video
              className="hidden-video"
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => handleVideoLoaded(e.currentTarget)}
              onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
            />
          )}
          <p className="hint">A címet közvetlenül a képen húzhatod.</p>
        </div>

        <aside className="controls">
          <label>Szöveg<textarea value={settings.text} onChange={(e) => update('text', e.target.value)} rows={3} /></label>

          <label>Vastagság<select value={settings.fontWeight} onChange={(e) => update('fontWeight', Number(e.target.value))}><option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra Bold</option></select></label>

          <label>Betűméret <b>{settings.fontSize}px</b><input type="range" min="20" max="140" value={settings.fontSize} onChange={(e) => update('fontSize', Number(e.target.value))} /></label>

          <div className="grid2">
            <label>Betűszín<input type="color" value={settings.color} onChange={(e) => update('color', e.target.value)} /></label>
            <label>Háttér<input type="color" value={settings.backgroundColor} onChange={(e) => update('backgroundColor', e.target.value)} /></label>
          </div>

          <label>Háttér opacity <b>{Math.round(settings.backgroundOpacity * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={settings.backgroundOpacity} onChange={(e) => update('backgroundOpacity', Number(e.target.value))} /></label>
          <label>Padding <b>{settings.paddingX}px</b><input type="range" min="0" max="100" value={settings.paddingX} onChange={(e) => { const n = Number(e.target.value); update('paddingX', n); update('paddingY', Math.round(n * 0.65)); }} /></label>
          <label>Lekerekítés <b>{settings.radius}px</b><input type="range" min="0" max="60" value={settings.radius} onChange={(e) => update('radius', Number(e.target.value))} /></label>

          <div className="position">
            <span>Pozíció</span>
            <span>X {settings.x} · Y {settings.y}</span>
          </div>

          <div className="actions">
            <button className="button" onClick={savePreset}>Beállítás mentése</button>
            <button className="button" onClick={exportSvg} disabled={!svg}>SVG export</button>
            <button className="button primary" disabled={busy || !videoFile} onClick={exportVideo}>{busy ? `Exportálás ${progress}%` : 'EXPORT MP4'}</button>
          </div>
          {busy && <div className="export-progress"><progress value={progress} max="100" aria-label="Exportálás folyamatban" /><span>{progress}%</span></div>}
          {message && <div className="message">{message}</div>}
          <div className="template-note"><b>Template:</b> <code>public/template.svg</code><br />Inkscape-ben ezt szerkeszd. Az <code>id="title"</code> és <code>id="title-background"</code> elemeket hagyd meg.</div>
        </aside>
      </section>
    </main>
  );
}
