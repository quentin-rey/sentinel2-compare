import { useEffect, useState } from "react";
import { useTranslation, type TFunction } from "../../hooks/useLanguage";

export type ExportKind = "png" | "jpeg" | "gif" | "webm";

// Sentinel `size` value meaning "render fresh from the satellite data at
// this resolution" instead of capturing the on-screen canvas — see
// lib/exportHighRes.ts. Only offered for static PNG/JPEG exports: it
// samples the COGs directly, decoupled from whatever the on-screen WebGL
// canvas' pixel size happens to be.
export const HIGH_RES_SIZE = -1;
export const HIGH_RES_WIDTH = 3840;

function imageSizes(t: TFunction) {
  return [
    { label: t("sizeOriginal"), value: 0 },
    { label: t("sizeHd", { px: 1920 }), value: 1920 },
    { label: t("sizeCompact", { px: 960 }), value: 960 },
    { label: t("sizeHighRes", { px: HIGH_RES_WIDTH }), value: HIGH_RES_SIZE },
  ];
}
function animSizes(t: TFunction) {
  return [
    { label: t("sizeHd", { px: 960 }), value: 960 },
    { label: t("sizeStandard", { px: 640 }), value: 640 },
    { label: t("sizeCompact", { px: 400 }), value: 400 },
  ];
}

export interface ExportConfirmOptions {
  maxWidth?: number;
  quality: number;
  filename: string;
  durationMs?: number;
  fps?: number;
  // Render fresh from the satellite data at maxWidth instead of capturing
  // the on-screen canvas — see lib/exportHighRes.ts.
  highRes?: boolean;
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
  const { t } = useTranslation();
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
    setFilename(computeFilename(kind, size === HIGH_RES_SIZE ? HIGH_RES_WIDTH : size, quality, duration, fps));
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
  const sizeOptions = animated ? animSizes(t) : imageSizes(t);
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
        <button id="export-modal-close" className="modal-close" aria-label={t("closeAriaLabel")} onClick={onDirectClose}>
          ✕
        </button>
        <h2 id="export-modal-title">{t("exportOptionsTitle")}</h2>

        <label>
          {t("sizeLabel")}
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
            {t("qualityLabel", { percent: quality })}
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
                {t("durationLabel", { seconds: duration })}
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
                {t("fpsLabel", { fps })}
                <input type="range" min={10} max={30} step={1} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
              </label>
            </div>
            <p className="field-hint">{t("frameCountHint", { frames: frameCount })}</p>
          </>
        )}

        <label>
          {t("filenameLabel")}
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
            const highRes = size === HIGH_RES_SIZE;
            const effectiveWidth = highRes ? HIGH_RES_WIDTH : size;
            const finalFilename = filename.trim() || computeFilename(kind, effectiveWidth, quality, duration, fps);
            onConfirm(kind, {
              maxWidth: effectiveWidth || undefined,
              quality: quality / 100,
              filename: finalFilename,
              durationMs: animated ? duration * 1000 : undefined,
              fps: animated ? fps : undefined,
              highRes,
            });
          }}
        >
          {t("downloadBtn")}
        </button>
      </div>
    </div>
  );
}
