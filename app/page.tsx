"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/refs */

import JSZip from "jszip";
import {
  Archive,
  Clipboard,
  Download,
  FileImage,
  ImagePlus,
  Loader2,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type OutputFormat = "png" | "jpeg" | "webp" | "svg";
type AspectRatio = "free" | "1:1" | "4:3" | "16:9";
type BackgroundMode = "keep" | "transparent";

type SourceImage = {
  name: string;
  dataUrl: string;
};

type Selection = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type StripSettings = {
  format: OutputFormat;
  maxEdge: number;
  aspectRatio: AspectRatio;
  background: BackgroundMode;
};

type StripResult = {
  id: string;
  name: string;
  model?: string;
  b64?: string;
  mediaType?: string;
  extension?: string;
  width?: number;
  height?: number;
  error?: string;
  status?: "processing";
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  source: SourceImage;
  selections: Selection[];
  settings: StripSettings;
  results: StripResult[];
};

type DragState =
  | {
      mode: "draw";
      startX: number;
      startY: number;
    }
  | {
      mode: "move";
      id: string;
      startX: number;
      startY: number;
      original: Selection;
    }
  | {
      mode: "resize";
      id: string;
      handle: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      original: Selection;
    };

const defaultSettings: StripSettings = {
  format: "png",
  maxEdge: 1024,
  aspectRatio: "free",
  background: "keep",
};

const maxEdgeOptions = [512, 768, 1024, 1536, 2048];
const aspectOptions: AspectRatio[] = ["free", "1:1", "4:3", "16:9"];
const formatOptions: OutputFormat[] = ["png", "webp", "jpeg", "svg"];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pointFromSvg(
  svg: SVGSVGElement | null,
  event: Pick<PointerEvent | ReactPointerEvent, "clientX" | "clientY">,
  naturalSize: { width: number; height: number },
) {
  const rect = svg?.getBoundingClientRect();

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp(
      ((event.clientX - rect.left) / rect.width) * naturalSize.width,
      0,
      naturalSize.width,
    ),
    y: clamp(
      ((event.clientY - rect.top) / rect.height) * naturalSize.height,
      0,
      naturalSize.height,
    ),
  };
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function resultDataUrl(result: StripResult) {
  if (!result.b64 || !result.mediaType) {
    return "";
  }

  return `data:${result.mediaType};base64,${result.b64}`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

function openHistoryDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("image-stripper", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("jobs", { keyPath: "id" });
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putHistory(entry: HistoryEntry) {
  const db = await openHistoryDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("jobs", "readwrite");
    tx.objectStore("jobs").put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

async function deleteHistory(id: string) {
  const db = await openHistoryDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("jobs", "readwrite");
    tx.objectStore("jobs").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

async function listHistory() {
  const db = await openHistoryDb();
  const entries = await new Promise<HistoryEntry[]>((resolve, reject) => {
    const request = db.transaction("jobs").objectStore("jobs").getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as HistoryEntry[]);
  });

  db.close();
  return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}

export default function Home() {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [selections, setSelections] = useState<Selection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<StripSettings>(defaultSettings);
  const [results, setResults] = useState<Record<string, StripResult>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [cropPreviews, setCropPreviews] = useState<Record<string, string>>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [batchError, setBatchError] = useState("");

  const imageRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const orderedResults = useMemo(
    () => selections.map((selection) => results[selection.id]).filter(Boolean),
    [results, selections],
  );
  const canDownloadAll = orderedResults.some((result) => result?.b64);
  const selectedSelection = selections.find((selection) => selection.id === selectedId);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listHistory());
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    let active = true;

    listHistory()
      .then((entries) => {
        if (active) {
          setHistory(entries);
        }
      })
      .catch(() => {
        if (active) {
          setHistory([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSource({
        name: file.name || "clipboard-image.png",
        dataUrl: String(reader.result),
      });
      setSelections([]);
      setSelectedId(null);
      setResults({});
      setCropPreviews({});
      setBatchError("");
      setCurrentJobId(makeId("job"));
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();

      if (file) {
        event.preventDefault();
        loadFile(file);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      const point = pointFromSvg(svgRef.current, event, naturalSize);

      if (drag.mode === "draw") {
        const x = Math.min(drag.startX, point.x);
        const y = Math.min(drag.startY, point.y);
        const w = Math.abs(point.x - drag.startX);
        const h = Math.abs(point.y - drag.startY);

        setSelections((current) => {
          const draft = current[current.length - 1];

          if (!draft) {
            return current;
          }

          return current.map((selection) =>
            selection.id === draft.id ? { ...selection, x, y, w, h } : selection,
          );
        });
      }

      if (drag.mode === "move") {
        const nextX = clamp(
          drag.original.x + point.x - drag.startX,
          0,
          naturalSize.width - drag.original.w,
        );
        const nextY = clamp(
          drag.original.y + point.y - drag.startY,
          0,
          naturalSize.height - drag.original.h,
        );

        setSelections((current) =>
          current.map((selection) =>
            selection.id === drag.id
              ? { ...selection, x: nextX, y: nextY }
              : selection,
          ),
        );
      }

      if (drag.mode === "resize") {
        const original = drag.original;
        let left = original.x;
        let right = original.x + original.w;
        let top = original.y;
        let bottom = original.y + original.h;

        if (drag.handle.includes("w")) {
          left = clamp(point.x, 0, right - 16);
        }

        if (drag.handle.includes("e")) {
          right = clamp(point.x, left + 16, naturalSize.width);
        }

        if (drag.handle.includes("n")) {
          top = clamp(point.y, 0, bottom - 16);
        }

        if (drag.handle.includes("s")) {
          bottom = clamp(point.y, top + 16, naturalSize.height);
        }

        setSelections((current) =>
          current.map((selection) =>
            selection.id === drag.id
              ? {
                  ...selection,
                  x: left,
                  y: top,
                  w: right - left,
                  h: bottom - top,
                }
              : selection,
          ),
        );
      }
    };

    const onPointerUp = () => {
      if (dragRef.current?.mode === "draw") {
        setSelections((current) =>
          current.filter((selection) => selection.w >= 16 && selection.h >= 16),
        );
      }

      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [naturalSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "Delete" && selectedId && !isTyping) {
        setSelections((current) =>
          current.filter((selection) => selection.id !== selectedId),
        );
        setResults((current) => {
          const next = { ...current };
          delete next[selectedId];
          return next;
        });
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const cropToDataUrl = useCallback((selection: Selection) => {
    const image = imageRef.current;

    if (!image) {
      return "";
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(selection.w));
    canvas.height = Math.max(1, Math.round(selection.h));
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return "";
    }

    ctx.drawImage(
      image,
      selection.x,
      selection.y,
      selection.w,
      selection.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas.toDataURL("image/png");
  }, []);

  useEffect(() => {
    if (!source || !imageRef.current) {
      return;
    }

    const previews = selections.reduce<Record<string, string>>((next, selection) => {
      if (selection.w >= 16 && selection.h >= 16) {
        next[selection.id] = cropToDataUrl(selection);
      }

      return next;
    }, {});

    setCropPreviews(previews);
  }, [cropToDataUrl, selections, source]);

  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget || !source) {
      return;
    }

    const point = pointFromSvg(event.currentTarget, event, naturalSize);
    const id = makeId("region");
    const next: Selection = {
      id,
      name: `region-${String(selections.length + 1).padStart(2, "0")}`,
      x: point.x,
      y: point.y,
      w: 1,
      h: 1,
    };

    dragRef.current = { mode: "draw", startX: point.x, startY: point.y };
    setSelections((current) => [...current, next]);
    setSelectedId(id);
  };

  const removeSelection = (id: string) => {
    setSelections((current) => current.filter((selection) => selection.id !== id));
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedId((current) => (current === id ? null : current));
  };

  const saveJob = useCallback(
    async (nextResults: Record<string, StripResult>) => {
      if (!source || !currentJobId) {
        return;
      }

      await putHistory({
        id: currentJobId,
        createdAt: Date.now(),
        source,
        selections,
        settings,
        results: selections
          .map((selection) => nextResults[selection.id])
          .filter(Boolean),
      });
      await loadHistory();
    },
    [currentJobId, loadHistory, selections, settings, source],
  );

  const generateBatch = async () => {
    if (!source || selections.length === 0) {
      setBatchError("Load an image and draw at least one region.");
      return;
    }

    setBatchError("");
    const processing = selections.reduce<Record<string, StripResult>>((next, selection) => {
      next[selection.id] = {
        id: selection.id,
        name: selection.name,
        status: "processing",
      };
      return next;
    }, {});

    setResults((current) => ({ ...current, ...processing }));

    const crops = selections.map((selection, index) => ({
      id: selection.id,
      name: selection.name,
      index,
      dataUrl: cropToDataUrl(selection),
      width: Math.round(selection.w),
      height: Math.round(selection.h),
    }));

    try {
      const response = await fetch("/api/strip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crops, settings }),
      });
      const payload = (await response.json()) as {
        results?: StripResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Batch generation failed.");
      }

      const nextResults = (payload.results ?? []).reduce<Record<string, StripResult>>(
        (next, result) => {
          next[result.id] = result;
          return next;
        },
        {},
      );

      const merged = { ...results, ...nextResults };
      setResults(merged);
      await saveJob(merged);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Batch generation failed.";
      setBatchError(message);
      setResults((current) => {
        const next = { ...current };
        for (const selection of selections) {
          next[selection.id] = {
            id: selection.id,
            name: selection.name,
            error: message,
          };
        }
        return next;
      });
    }
  };

  const downloadAll = async () => {
    const zip = new JSZip();

    for (const result of orderedResults) {
      if (result?.b64 && result.extension) {
        zip.file(
          `${slug(result.name) || result.id}.${result.extension}`,
          result.b64,
          { base64: true },
        );
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadDataUrl(URL.createObjectURL(blob), "image-stripper-batch.zip");
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    setSource(entry.source);
    setSelections(entry.selections);
    setSettings(entry.settings);
    setResults(
      entry.results.reduce<Record<string, StripResult>>((next, result) => {
        next[result.id] = result;
        return next;
      }, {}),
    );
    setSelectedId(entry.selections[0]?.id ?? null);
    setCurrentJobId(entry.id);
    setBatchError("");
  };

  return (
    <main className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)_360px] bg-background text-foreground">
      <aside className="flex min-h-screen flex-col border-r bg-background">
        <div className="border-b px-4 py-3">
          <p className="text-[13px] font-medium leading-none">image-stripper</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fast region cleanup batches
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover"
          >
            <Upload size={14} />
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                loadFile(file);
              }
            }}
          />

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Selections</p>
              <p className="text-xs text-subtle-foreground">{selections.length}</p>
            </div>

            <div className="space-y-1">
              {selections.map((selection, index) => (
                <div
                  key={selection.id}
                  className={[
                    "group flex h-8 items-center gap-2 rounded px-2 transition-colors duration-150",
                    selectedId === selection.id
                      ? "bg-surface-active text-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(selection.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none">
                      {index + 1}
                    </span>
                    <span className="truncate text-[13px]">{selection.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSelection(selection.id)}
                    className="text-subtle-foreground hover:text-foreground"
                    aria-label={`Delete ${selection.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {selectedSelection ? (
              <label className="block pt-2 text-xs text-muted-foreground">
                Rename
                <input
                  value={selectedSelection.name}
                  onChange={(event) =>
                    setSelections((current) =>
                      current.map((selection) =>
                        selection.id === selectedSelection.id
                          ? { ...selection, name: event.target.value }
                          : selection,
                      ),
                    )
                  }
                  className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-subtle-foreground focus:border-accent"
                />
              </label>
            ) : null}
          </div>

          <div className="mt-5 space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">Output</p>

            <label className="block text-xs text-muted-foreground">
              Format
              <select
                value={settings.format}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    format: event.target.value as OutputFormat,
                  }))
                }
                className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none focus:border-accent"
              >
                {formatOptions.map((format) => (
                  <option
                    key={format}
                    value={format}
                    disabled={settings.background === "transparent" && format === "jpeg"}
                  >
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-muted-foreground">
              Max edge
              <select
                value={settings.maxEdge}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    maxEdge: Number(event.target.value),
                  }))
                }
                className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none focus:border-accent"
              >
                {maxEdgeOptions.map((edge) => (
                  <option key={edge} value={edge}>
                    {edge}px
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Ratio</p>
              <div className="grid grid-cols-4 gap-1">
                {aspectOptions.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() =>
                      setSettings((current) => ({ ...current, aspectRatio: ratio }))
                    }
                    className={[
                      "h-8 rounded border px-2 text-xs transition-colors duration-150",
                      settings.aspectRatio === ratio
                        ? "border-accent bg-surface-active text-foreground"
                        : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    ].join(" ")}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Background</p>
              <div className="grid grid-cols-2 gap-1">
                {(["keep", "transparent"] as BackgroundMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        background: mode,
                        format:
                          mode === "transparent" && current.format === "jpeg"
                            ? "png"
                            : current.format,
                      }))
                    }
                    className={[
                      "h-8 rounded border px-2 text-xs capitalize transition-colors duration-150",
                      settings.background === mode
                        ? "border-accent bg-surface-active text-foreground"
                        : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    ].join(" ")}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={generateBatch}
              disabled={!source || selections.length === 0}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle-foreground"
            >
              <Play size={14} />
              Generate batch
            </button>

            {batchError ? (
              <p className="rounded-md border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">
                {batchError}
              </p>
            ) : null}
          </div>

          <div className="mt-5 border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">History</p>
              <p className="text-xs text-subtle-foreground">{history.length}</p>
            </div>
            <div className="space-y-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex h-8 items-center gap-2 rounded px-2 text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
                >
                  <button
                    type="button"
                    onClick={() => loadHistoryEntry(entry)}
                    className="min-w-0 flex-1 truncate text-left text-[13px]"
                  >
                    {entry.source.name}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteHistory(entry.id);
                      await loadHistory();
                    }}
                    className="text-subtle-foreground hover:text-foreground"
                    aria-label={`Delete history for ${entry.source.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section
        className={[
          "relative flex min-w-0 items-center justify-center overflow-hidden border-r bg-background p-4",
          isDraggingFile ? "bg-surface-hover" : "",
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingFile(false);
          const file = event.dataTransfer.files[0];

          if (file) {
            loadFile(file);
          }
        }}
      >
        {source ? (
          <div className="relative inline-block max-h-full max-w-full">
            <img
              ref={imageRef}
              src={source.dataUrl}
              alt=""
              className="max-h-[calc(100vh-32px)] max-w-full select-none object-contain"
              draggable={false}
              onLoad={(event) =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={onCanvasPointerDown}
            >
              {selections.map((selection, index) => {
                const selected = selection.id === selectedId;
                const handles = [
                  ["nw", selection.x, selection.y],
                  ["ne", selection.x + selection.w, selection.y],
                  ["sw", selection.x, selection.y + selection.h],
                  ["se", selection.x + selection.w, selection.y + selection.h],
                ] as const;

                return (
                  <g key={selection.id}>
                    <rect
                      x={selection.x}
                      y={selection.y}
                      width={selection.w}
                      height={selection.h}
                      rx={2}
                      className="cursor-move"
                      style={{
                        fill: selected
                          ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                          : "rgba(255,255,255,0.08)",
                        stroke: selected ? "var(--accent)" : "var(--border-strong)",
                        strokeWidth: selected ? 2 : 1,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        const point = pointFromSvg(
                          event.currentTarget.ownerSVGElement,
                          event,
                          naturalSize,
                        );
                        dragRef.current = {
                          mode: "move",
                          id: selection.id,
                          startX: point.x,
                          startY: point.y,
                          original: selection,
                        };
                        setSelectedId(selection.id);
                      }}
                    />
                    <foreignObject
                      x={selection.x + 6}
                      y={selection.y + 6}
                      width={28}
                      height={20}
                      className="pointer-events-none"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-accent text-[10px] font-medium leading-none text-accent-foreground">
                        {index + 1}
                      </div>
                    </foreignObject>
                    {selected
                      ? handles.map(([handle, x, y]) => (
                          <rect
                            key={handle}
                            x={x - 5}
                            y={y - 5}
                            width={10}
                            height={10}
                            rx={1}
                            className="cursor-crosshair"
                            style={{
                              fill: "var(--accent)",
                              stroke: "var(--accent-foreground)",
                              strokeWidth: 1,
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const point = pointFromSvg(
                                event.currentTarget.ownerSVGElement,
                                event,
                                naturalSize,
                              );
                              dragRef.current = {
                                mode: "resize",
                                id: selection.id,
                                handle,
                                startX: point.x,
                                startY: point.y,
                                original: selection,
                              };
                            }}
                          />
                        ))
                      : null}
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="flex w-full max-w-[520px] flex-col items-center justify-center rounded-lg border bg-surface px-6 py-8 text-center">
            <FileImage className="text-muted-foreground" size={20} />
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
              Drop, paste, or upload an image
            </h1>
            <p className="mt-2 max-w-[360px] text-sm text-muted-foreground">
              Draw regions over the source, then generate all clean crops as one batch.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-subtle-foreground">
              <span className="inline-flex items-center gap-1">
                <Clipboard size={14} />
                Paste
              </span>
              <span className="inline-flex items-center gap-1">
                <ImagePlus size={14} />
                Drag image
              </span>
            </div>
          </div>
        )}
      </section>

      <aside className="flex min-h-screen flex-col bg-background">
        <div className="flex h-[49px] items-center justify-between border-b px-4">
          <div>
            <p className="text-[13px] font-medium leading-none">Outputs</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gemini and OpenAI rotate by region
            </p>
          </div>
          <button
            type="button"
            onClick={downloadAll}
            disabled={!canDownloadAll}
            className="flex h-8 items-center gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-subtle-foreground"
          >
            <Archive size={14} />
            ZIP
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {selections.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Draw regions to prepare a batch.
            </div>
          ) : (
            <div className="space-y-3">
              {selections.map((selection, index) => {
                const result = results[selection.id];
                const src = result ? resultDataUrl(result) : "";

                return (
                  <div key={selection.id} className="rounded-lg border bg-surface p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(selection.id)}
                        className="min-w-0 truncate text-left text-[13px] font-medium"
                      >
                        {index + 1}. {selection.name}
                      </button>
                      {result?.b64 && result.extension ? (
                        <button
                          type="button"
                          onClick={() =>
                            downloadDataUrl(
                              src,
                              `${slug(result.name) || result.id}.${result.extension}`,
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Download ${selection.name}`}
                        >
                          <Download size={14} />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="overflow-hidden rounded-md border bg-background">
                        {cropPreviews[selection.id] ? (
                          <img
                            src={cropPreviews[selection.id]}
                            alt=""
                            className="aspect-square h-full w-full object-contain"
                          />
                        ) : (
                          <div className="aspect-square" />
                        )}
                      </div>
                      <div className="overflow-hidden rounded-md border bg-background">
                        {result?.status === "processing" ? (
                          <div className="flex aspect-square items-center justify-center text-muted-foreground">
                            <Loader2 className="animate-spin" size={18} />
                          </div>
                        ) : result?.error ? (
                          <div className="flex aspect-square items-center justify-center px-2 text-center text-xs text-danger">
                            {result.error}
                          </div>
                        ) : src ? (
                          <img
                            src={src}
                            alt=""
                            className="aspect-square h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex aspect-square items-center justify-center text-xs text-subtle-foreground">
                            Pending
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-subtle-foreground">
                      <span>{result?.model ?? (index % 2 === 0 ? "Gemini" : "OpenAI")}</span>
                      <span>
                        {result?.width && result.height
                          ? `${result.width}x${result.height}`
                          : `${Math.round(selection.w)}x${Math.round(selection.h)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}
