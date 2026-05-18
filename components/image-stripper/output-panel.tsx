/* eslint-disable @next/next/no-img-element */

import { Archive, Download, Loader2, RefreshCw } from "lucide-react";
import {
   useEffect,
   useRef,
   type Dispatch,
   type SetStateAction,
} from "react";
import { modelOptions } from "@/lib/image-stripper/config";
import type {
   Selection,
   SourceImage,
   StripResult,
   StripSettings,
} from "@/lib/image-stripper/types";
import {
   modelLabelForIndex,
   resultDataUrl,
   slug,
} from "@/lib/image-stripper/utils";

type OutputPanelProps = {
   settings: StripSettings;
   selections: Selection[];
   results: Record<string, StripResult>;
   source: SourceImage | null;
   cropPreviews: Record<string, string>;
   versionPrompts: Record<string, string>;
   setVersionPrompts: Dispatch<SetStateAction<Record<string, string>>>;
   selectedId: string | null;
   isFastMode: boolean;
   canDownloadAll: boolean;
   onSelect: (id: string) => void;
   onDownloadAll: () => void;
   onDownloadResult: (dataUrl: string, filename: string) => void;
   onGenerateVersion: (selection: Selection, index: number) => void;
};

export function OutputPanel({
   settings,
   selections,
   results,
   source,
   cropPreviews,
   versionPrompts,
   setVersionPrompts,
   selectedId,
   isFastMode,
   canDownloadAll,
   onSelect,
   onDownloadAll,
   onDownloadResult,
   onGenerateVersion,
}: OutputPanelProps) {
   const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
   const latestSelectionId = selections[selections.length - 1]?.id;

   useEffect(() => {
      if (!latestSelectionId) {
         return;
      }

      cardRefs.current[latestSelectionId]?.scrollIntoView({
         block: "nearest",
      });
   }, [latestSelectionId, selections.length]);

   useEffect(() => {
      if (!selectedId) {
         return;
      }

      cardRefs.current[selectedId]?.scrollIntoView({
         block: "nearest",
      });
   }, [selectedId]);

   return (
      <aside className="flex h-screen min-h-0 flex-col bg-background">
         <div className="flex h-[49px] items-center justify-between border-b px-4">
            <div>
               <p className="text-[13px] font-medium leading-none">Outputs</p>
               <p className="mt-1 text-xs text-muted-foreground">
                  {settings.modelPreference === "rotate"
                     ? "Models rotate by region"
                     : `Pinned to ${
                          modelOptions.find(
                             (option) =>
                                option.value === settings.modelPreference,
                          )?.label ?? "model"
                       }`}
               </p>
            </div>
            <button
               type="button"
               onClick={onDownloadAll}
               disabled={!canDownloadAll}
               className="flex h-8 items-center gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-subtle-foreground"
            >
               <Archive size={14} />
               ZIP
            </button>
         </div>

         <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selections.length === 0 ? (
               <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  Draw regions to prepare a batch.
               </div>
            ) : (
               <div className="space-y-3">
                  {selections.map((selection, index) => {
                     const result = results[selection.id];
                     const src = result ? resultDataUrl(result) : "";
                     const isGenerating = result?.status === "processing";

                     return (
                        <div
                           key={selection.id}
                           ref={(node) => {
                              cardRefs.current[selection.id] = node;
                           }}
                           className="rounded-lg border bg-surface p-3"
                        >
                           <div className="mb-2 flex items-center justify-between gap-2">
                              <button
                                 type="button"
                                 onClick={() => onSelect(selection.id)}
                                 className="min-w-0 truncate text-left text-[13px] font-medium"
                              >
                                 {index + 1}. {selection.name}
                              </button>
                              {result?.b64 && result.extension ? (
                                 <button
                                    type="button"
                                    onClick={() =>
                                       onDownloadResult(
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
                                 {isGenerating ? (
                                    <div className="flex aspect-square items-center justify-center text-muted-foreground">
                                       <Loader2
                                          className="animate-spin"
                                          size={18}
                                       />
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
                              <span>
                                 {result?.model ??
                                    modelLabelForIndex(
                                       index,
                                       settings.modelPreference,
                                    )}
                              </span>
                              <span>
                                 {result?.width && result.height
                                    ? `${result.width}x${result.height}`
                                    : `${Math.round(selection.w)}x${Math.round(selection.h)}`}
                              </span>
                           </div>

                           <div className="mt-3 border-t pt-3">
                              {!isFastMode ? (
                                 <label className="block text-xs text-muted-foreground">
                                    Prompt
                                    <textarea
                                       value={versionPrompts[selection.id] ?? ""}
                                       onChange={(event) =>
                                          setVersionPrompts((current) => ({
                                             ...current,
                                             [selection.id]: event.target.value,
                                          }))
                                       }
                                       placeholder="Version direction"
                                       rows={2}
                                       className="mt-1 h-16 w-full resize-none rounded-md border bg-surface px-3 py-2 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-subtle-foreground focus:border-accent"
                                    />
                                 </label>
                              ) : (
                                 <p className="text-xs text-muted-foreground">
                                    Runs locally with Sharp. Payment still applies.
                                 </p>
                              )}
                              <button
                                 type="button"
                                 onClick={() => onGenerateVersion(selection, index)}
                                 disabled={!source || isGenerating}
                                 className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-subtle-foreground"
                              >
                                 {isGenerating ? (
                                    <Loader2 className="animate-spin" size={14} />
                                 ) : (
                                    <RefreshCw size={14} />
                                 )}
                                 {isFastMode ? "Run fast tool" : "New version"}
                              </button>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
         </div>
      </aside>
   );
}
