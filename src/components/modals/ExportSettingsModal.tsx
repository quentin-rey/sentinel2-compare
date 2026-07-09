import { useEffect, useState } from "react";

export type ExportKind = "png" | "jpeg" | "gif" | "webm";

const IMAGE_SIZES = [
  { label: "Originale (haute résolution)", value: 0 },
  { label: "HD (1920 px)", value: 1920 },
  { label: "Compacte (960 px)", value: 960 },
];
const ANIM_SIZES = [
  { label: "HD (960 px)", value: 960 },
  { label: "Standard (640 px)", value: 640 },
  { label: "Compacte (400 px)", value: 400 },
];

export interface ExportConfirmOptions {
  maxWidth?: number;
  quality: number;
  filename: string;
  durationMs?: number;
  fps?: number;
}

interface Props {
  kind: ExportKind | null;
  computeFilename: (kind: ExportKind, maxWidth: number, quality: number, duration: number, fps: number) => string;
  onRequestClose: () => void;
  onDirectClose: () => void;
  onConfirm: (kind: ExportKind, options: ExportConfirmOptions) => void;
}

function isAnimatedKind(kind: ExportKind | null): boolean {
  return kind === "gif" || kind === "webm";
}

export function ExportSettingsModal({ kind, computeFilename, onRequestClose, onDirectClose, onConfirm }: Props) {
  const animated = isAnimatedKind(kind);
  const [size, setSize] = useState(0);
  const [quality, setQuality] = useState(85);
  const [duration, setDuration] = useState(3);
  const [fps, setFps] = useState(20);
  const [filename, setFilename] = useState("");
  const [filenameEdited, setFilenameEdited] = useState(false);

  // Reset every field to this export kind's defaults whenever the modal
  // opens for a (possibly new) kind — mirrors the original openExportModal().
  useEffect(() => {
    if (!kind) return;
    const defaultSize = isAnimatedKind(kind) ? 640 : 0;
    const defaultDuration = kind === "gif" ? 2.4 : 3;
    const defaultFps = kind === "gif" ? 17 : 20;
    setSize(defaultSize);
    setQuality(85);
    setDuration(defaultDuration);
    setFps(defaultFps);
    setFilenameEdited(false);
    setFilename(computeFilename(kind, defaultSize, 85, defaultDuration, defaultFps));
    // computeFilename intentionally excluded: it closes over live app state
    // (mode/target/lastRenderState) and is expected to change identity often;
    // this effect should only re-run when the export *kind* changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (!kind || filenameEdited) return;
    setFilename(computeFilename(kind, size, quality, duration, fps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, size, quality, duration, fps, filenameEdited]);

  if (!kind) {
    return (
      <div id="export-modal" className="modal-overlay hidden">
        <div className="modal" />
      </div>
    );
  }

  const showQuality = kind === "jpeg" || kind === "gif";
  const sizeOptions = animated ? ANIM_SIZES : IMAGE_SIZES;
  const frameCount = Math.round(duration * fps);

  return (
    <div
      id="export-modal"
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        <button id="export-modal-close" className="modal-close" aria-label="Fermer" onClick={onDirectClose}>
          ✕
        </button>
        <h2 id="export-modal-title">Options d'export</h2>

        <label>
          Taille
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {sizeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {showQuality && (
          <label>
            Qualité ({quality}%)
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}

        {animated && (
          <>
            <div className="row">
              <label>
                Durée du cycle avant ↔ après ({duration}s)
                <input
                  type="range"
                  min={2}
                  max={8}
                  step={0.5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label>
                Fluidité ({fps} im/s)
                <input type="range" min={10} max={30} step={1} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
              </label>
            </div>
            <p className="field-hint">
              ≈ {frameCount} images générées. Plus de durée/fluidité = un rendu plus doux mais un fichier plus
              lourd et plus long à générer.
            </p>
          </>
        )}

        <label>
          Nom du fichier
          <input
            type="text"
            value={filename}
            onChange={(e) => {
              setFilename(e.target.value);
              setFilenameEdited(true);
            }}
          />
        </label>

        <button
          id="export-modal-confirm"
          onClick={() => {
            const finalFilename = filename.trim() || computeFilename(kind, size, quality, duration, fps);
            onConfirm(kind, {
              maxWidth: size || undefined,
              quality: quality / 100,
              filename: finalFilename,
              durationMs: animated ? duration * 1000 : undefined,
              fps: animated ? fps : undefined,
            });
          }}
        >
          Télécharger
        </button>
      </div>
    </div>
  );
}
