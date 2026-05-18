"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/refs */

import JSZip from "jszip";
import {
   Clipboard,
   CreditCard,
   FileImage,
   ImagePlus,
   LogOut,
   Play,
   Settings,
   Trash2,
   Upload,
   User,
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
import { OutputPanel } from "@/components/image-stripper/output-panel";
import {
   PaymentModal,
   SettingsModal,
   UserModal,
} from "@/components/image-stripper/modals";
import {
   aspectOptions,
   defaultSettings,
   fastOptions,
   formatOptions,
   maxEdgeOptions,
   normalizeSettings,
   pricingPlans,
} from "@/lib/image-stripper/config";
import {
   deleteHistory,
   getHistory,
   listHistory,
   putHistory,
   syncHistoryToVercelBlob,
} from "@/lib/image-stripper/history";
import type {
   AuthMode,
   BackgroundMode,
   BillingState,
   CheckoutIntent,
   HistoryEntry,
   OutputFormat,
   PricingPlanId,
   ProcessingMode,
   Selection,
   SourceImage,
   StripResult,
   StripSettings,
} from "@/lib/image-stripper/types";
import {
   clamp,
   isSuperAdminEmail,
   makeId,
   pluralCredits,
   slug,
} from "@/lib/image-stripper/utils";

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

function downloadDataUrl(dataUrl: string, filename: string) {
   const anchor = document.createElement("a");
   anchor.href = dataUrl;
   anchor.download = filename;
   anchor.click();
}

export default function Home() {
   const [source, setSource] = useState<SourceImage | null>(null);
   const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
   const [selections, setSelections] = useState<Selection[]>([]);
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const [settings, setSettings] = useState<StripSettings>(defaultSettings);
   const [results, setResults] = useState<Record<string, StripResult>>({});
   const [versionPrompts, setVersionPrompts] = useState<Record<string, string>>(
      {},
   );
   const [history, setHistory] = useState<HistoryEntry[]>([]);
   const [currentJobId, setCurrentJobId] = useState<string | null>(null);
   const [cropPreviews, setCropPreviews] = useState<Record<string, string>>({});
   const [isDraggingFile, setIsDraggingFile] = useState(false);
   const [batchError, setBatchError] = useState("");
   const [paymentNotice, setPaymentNotice] = useState("");
   const [paymentModalOpen, setPaymentModalOpen] = useState(false);
   const [checkoutEmail, setCheckoutEmail] = useState("");
   const [checkoutPassword, setCheckoutPassword] = useState("");
   const [checkoutError, setCheckoutError] = useState("");
   const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
   const [userModalOpen, setUserModalOpen] = useState(false);
   const [userMenuOpen, setUserMenuOpen] = useState(false);
   const [settingsModalOpen, setSettingsModalOpen] = useState(false);
   const [saveNotice, setSaveNotice] = useState("");
   const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
   const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent>("job");
   const [selectedPlanId, setSelectedPlanId] =
      useState<PricingPlanId>("monthly");
   const [paidCheckoutId, setPaidCheckoutId] = useState<string | null>(null);
   const [paidJobId, setPaidJobId] = useState<string | null>(null);
   const [billingState, setBillingState] = useState<BillingState | null>(null);
   const [billingRefreshKey, setBillingRefreshKey] = useState(0);

   const imageRef = useRef<HTMLImageElement>(null);
   const svgRef = useRef<SVGSVGElement>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const dragRef = useRef<DragState | null>(null);
   const resultsRef = useRef(results);

   const orderedResults = useMemo(
      () =>
         selections.map((selection) => results[selection.id]).filter(Boolean),
      [results, selections],
   );
   const canDownloadAll = orderedResults.some((result) => result?.b64);
   const selectedSelection = selections.find(
      (selection) => selection.id === selectedId,
   );
   const isFastMode = settings.mode === "fast";
   const selectedPlan =
      pricingPlans.find((plan) => plan.id === selectedPlanId) ??
      pricingPlans[1];
   const effectiveFormat =
      isFastMode && settings.fastOperation === "svg"
         ? "svg"
         : isFastMode && settings.fastOperation === "remove-background"
           ? "png"
           : settings.format;
   const hasPaidForCurrentJob = Boolean(
      currentJobId && paidCheckoutId && paidJobId === currentJobId,
   );
   const isSuperAdmin = isSuperAdminEmail(checkoutEmail);
   const normalizedCheckoutEmail = checkoutEmail.trim().toLowerCase();
   const billingStateMatchesEmail =
      billingState &&
      "email" in billingState &&
      billingState.email === normalizedCheckoutEmail;
   const creditBalance =
      billingStateMatchesEmail && billingState.kind === "credits"
         ? billingState.balance
         : null;
   const hasUnlimitedBilling =
      billingStateMatchesEmail && billingState.kind === "unlimited";
   const canGenerateSingleAi =
      hasPaidForCurrentJob ||
      isSuperAdmin ||
      hasUnlimitedBilling ||
      (creditBalance !== null && creditBalance >= 1);
   const canGenerateCurrentBatch =
      hasPaidForCurrentJob ||
      isSuperAdmin ||
      hasUnlimitedBilling ||
      (creditBalance !== null && creditBalance >= selections.length);
   const canGenerateAi = canGenerateSingleAi || canGenerateCurrentBatch;
   const billingUsageNotice =
      selections.length === 0
         ? ""
         : billingStateMatchesEmail && billingState.kind === "credits"
           ? `This generation will cost ${pluralCredits(
                selections.length,
             )}. You have ${pluralCredits(billingState.balance)} left.`
           : hasUnlimitedBilling && !isSuperAdmin
             ? `Unlimited usage: ${billingState.label}.`
             : "";

   const commitResults = useCallback(
      (nextResults: Record<string, StripResult>) => {
         resultsRef.current = nextResults;
         setResults(nextResults);
      },
      [],
   );

   useEffect(() => {
      resultsRef.current = results;
   }, [results]);

   useEffect(() => {
      const restoreEmail = window.setTimeout(() => {
         setCheckoutEmail(localStorage.getItem("image-stripper-email") ?? "");
      }, 0);

      return () => window.clearTimeout(restoreEmail);
   }, []);

   useEffect(() => {
      const email = checkoutEmail.trim().toLowerCase();

      if (!email) {
         return;
      }

      let active = true;

      fetch("/api/billing/state")
         .then(async (response) => {
            const payload = (await response
               .json()
               .catch(() => null)) as BillingState | null;

            if (
               !active ||
               !response.ok ||
               !payload ||
               payload.kind === "anonymous"
            ) {
               return;
            }

            if (
               "email" in payload &&
               payload.email &&
               payload.email !== email
            ) {
               return;
            }

            setBillingState(payload);
         })
         .catch(() => {
            if (active) {
               setBillingState(null);
            }
         });

      return () => {
         active = false;
      };
   }, [billingRefreshKey, checkoutEmail, paidCheckoutId, paymentNotice]);

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

   useEffect(() => {
      const email = checkoutEmail.trim().toLowerCase();

      if (!email || !source || !currentJobId) {
         return;
      }

      const entry: HistoryEntry = {
         id: currentJobId,
         createdAt: Date.now(),
         source,
         selections,
         settings,
         results: selections
            .map((selection) => resultsRef.current[selection.id])
            .filter(Boolean),
         payment: {
            checkoutId: paidCheckoutId ?? undefined,
            email,
            status:
               paidCheckoutId && paidJobId === currentJobId
                  ? "paid"
                  : "pending",
         },
      };
      const saveTimer = window.setTimeout(() => {
         void putHistory(entry)
            .then(() => loadHistory())
            .then(() => syncHistoryToVercelBlob(entry, email))
            .then((syncedToBlob) => {
               setSaveNotice(
                  syncedToBlob ? "Saved to" : "Saved on this browser.",
               );
            })
            .catch(() =>
               setSaveNotice("Saved locally, failed to save to storage."),
            );
      }, 500);

      return () => window.clearTimeout(saveTimer);
   }, [
      checkoutEmail,
      currentJobId,
      loadHistory,
      paidCheckoutId,
      paidJobId,
      results,
      selections,
      settings,
      source,
   ]);

   const loadFile = useCallback(
      (file: File) => {
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
            commitResults({});
            setVersionPrompts({});
            setCropPreviews({});
            setBatchError("");
            setPaymentNotice("");
            setPaidCheckoutId(null);
            setPaidJobId(null);
            setCurrentJobId(makeId("job"));
         };
         reader.readAsDataURL(file);
      },
      [commitResults],
   );

   useEffect(() => {
      const onPaste = (event: ClipboardEvent) => {
         const file = Array.from(event.clipboardData?.items ?? [])
            .find(
               (item) => item.kind === "file" && item.type.startsWith("image/"),
            )
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
                  selection.id === draft.id
                     ? { ...selection, x, y, w, h }
                     : selection,
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
               current.filter(
                  (selection) => selection.w >= 16 && selection.h >= 16,
               ),
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
            const nextResults = { ...resultsRef.current };
            delete nextResults[selectedId];
            commitResults(nextResults);
            setVersionPrompts((current) => {
               const next = { ...current };
               delete next[selectedId];
               return next;
            });
            setSelectedId(null);
         }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
   }, [commitResults, selectedId]);

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

      const previews = selections.reduce<Record<string, string>>(
         (next, selection) => {
            if (selection.w >= 16 && selection.h >= 16) {
               next[selection.id] = cropToDataUrl(selection);
            }

            return next;
         },
         {},
      );

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
      setSelections((current) =>
         current.filter((selection) => selection.id !== id),
      );
      const nextResults = { ...resultsRef.current };
      delete nextResults[id];
      commitResults(nextResults);
      setVersionPrompts((current) => {
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
            payment: canGenerateAi
               ? {
                    checkoutId: paidCheckoutId ?? "super-admin",
                    email: checkoutEmail.trim() || undefined,
                    status: "paid",
                 }
               : undefined,
         });
         await loadHistory();
      },
      [
         checkoutEmail,
         canGenerateAi,
         currentJobId,
         loadHistory,
         paidCheckoutId,
         selections,
         settings,
         source,
      ],
   );

   const saveDraft = useCallback(
      async (jobId: string, email?: string) => {
         if (!source) {
            return;
         }

         await putHistory({
            id: jobId,
            createdAt: Date.now(),
            source,
            selections,
            settings,
            results: selections
               .map((selection) => resultsRef.current[selection.id])
               .filter(Boolean),
            payment: email
               ? {
                    email,
                    status: "pending",
                 }
               : undefined,
         });
         await loadHistory();
      },
      [loadHistory, selections, settings, source],
   );

   const startPolarCheckout = async () => {
      const billingOnly = checkoutIntent === "billing";

      if (!billingOnly && (!source || selections.length === 0)) {
         setCheckoutError("Load an image and select at least one section.");
         return;
      }

      const email = checkoutEmail.trim().toLowerCase();

      if (!email || !email.includes("@")) {
         setCheckoutError(
            billingOnly
               ? "Enter an email for billing."
               : "Enter an email so the paid job can be recovered.",
         );
         return;
      }

      const jobId = billingOnly ? undefined : (currentJobId ?? makeId("job"));

      if (jobId) {
         setCurrentJobId(jobId);
      }

      setCheckoutError("");
      setIsCheckoutLoading(true);

      try {
         localStorage.setItem("image-stripper-email", email);

         if (jobId) {
            await saveDraft(jobId, email);
         }

         const response = await fetch("/api/checkout/polar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               jobId,
               email,
               selectionCount: billingOnly ? 0 : selections.length,
               plan: selectedPlanId,
               billingOnly,
            }),
         });
         const payload = (await response.json()) as {
            url?: string;
            checkoutId?: string;
            error?: string;
         };

         if (!response.ok || !payload.url) {
            throw new Error(payload.error || "Could not start checkout.");
         }

         window.location.assign(payload.url);
      } catch (error) {
         setCheckoutError(
            error instanceof Error
               ? error.message
               : "Could not start checkout.",
         );
         setIsCheckoutLoading(false);
      }
   };

   const saveUserEmail = async ({
      closeUserModal = true,
   }: { closeUserModal?: boolean } = {}) => {
      const email = checkoutEmail.trim().toLowerCase();

      if (!email || !email.includes("@")) {
         setCheckoutError("Enter a valid email.");
         return false;
      }

      if (!isSuperAdminEmail(email) && !checkoutPassword) {
         setCheckoutError(
            authMode === "sign-up"
               ? "Choose a password."
               : "Enter your password.",
         );
         return false;
      }

      if (
         authMode === "sign-up" &&
         !isSuperAdminEmail(email) &&
         checkoutPassword.length < 8
      ) {
         setCheckoutError("Use at least 8 characters.");
         return false;
      }

      try {
         const isOwner = isSuperAdminEmail(email);
         const endpoint =
            authMode === "sign-up" && !isOwner
               ? "/api/auth/sign-up"
               : "/api/auth/sign-in";
         const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               email,
               password: checkoutPassword,
            }),
         });
         const payload = (await response.json()) as {
            email?: string;
            error?: string;
         };

         if (!response.ok || !payload.email) {
            // account already exists — switch to sign-in so the user has a clear path forward
            if (response.status === 409 && authMode === "sign-up") {
               setAuthMode("sign-in");
               setCheckoutError(
                  "That account already exists. Enter your password to sign in.",
               );
               return false;
            }

            throw new Error(
               payload.error ||
                  (authMode === "sign-up"
                     ? "Could not create this account."
                     : "Could not sign in."),
            );
         }

         localStorage.setItem("image-stripper-email", payload.email);
         setCheckoutEmail(payload.email);
         setBillingRefreshKey((current) => current + 1);
         setCheckoutPassword("");
         setCheckoutError("");
         setUserMenuOpen(false);
         if (closeUserModal) {
            setUserModalOpen(false);
         }
         return true;
      } catch (error) {
         setCheckoutError(
            error instanceof Error
               ? error.message
               : authMode === "sign-up"
                 ? "Could not create this account."
                 : "Could not sign in.",
         );
         return false;
      }
   };

   const continueCheckout = async () => {
      const needsAuth =
         authMode === "sign-up" ||
         checkoutPassword ||
         isSuperAdminEmail(checkoutEmail) ||
         !billingStateMatchesEmail;

      if (needsAuth) {
         const signedIn = await saveUserEmail({ closeUserModal: false });

         if (!signedIn) {
            return;
         }
      }

      await startPolarCheckout();
   };

   const signOutUser = async () => {
      await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => {});
      localStorage.removeItem("image-stripper-email");
      setCheckoutEmail("");
      setBillingState(null);
      setCheckoutPassword("");
      setPaidCheckoutId(null);
      setPaidJobId(null);
      setCheckoutError("");
      setPaymentNotice("");
      setUserMenuOpen(false);
      setUserModalOpen(false);
   };

   const openBilling = () => {
      setCheckoutIntent("billing");
      setAuthMode(checkoutEmail ? "sign-in" : "sign-up");
      setCheckoutError("");
      setUserMenuOpen(false);
      setPaymentModalOpen(true);
   };

   const generateBatch = async () => {
      if (!source || selections.length === 0) {
         setBatchError("Load an image and draw at least one region.");
         return;
      }

      if (!canGenerateCurrentBatch) {
         setCheckoutIntent("job");
         setAuthMode(checkoutEmail ? "sign-in" : "sign-up");
         setPaymentModalOpen(true);
         setCheckoutError("");
         return;
      }

      setBatchError("");
      setPaymentNotice("");
      const processing = selections.reduce<Record<string, StripResult>>(
         (next, selection) => {
            next[selection.id] = {
               id: selection.id,
               name: selection.name,
               prompt: versionPrompts[selection.id]?.trim() || undefined,
               status: "processing",
            };
            return next;
         },
         {},
      );

      commitResults({ ...resultsRef.current, ...processing });

      const crops = selections.map((selection, index) => ({
         id: selection.id,
         name: selection.name,
         index,
         dataUrl: cropToDataUrl(selection),
         width: Math.round(selection.w),
         height: Math.round(selection.h),
         prompt: versionPrompts[selection.id]?.trim() || undefined,
      }));

      try {
         const response = await fetch("/api/strip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               crops,
               settings,
               payment: {
                  checkoutId: isSuperAdmin ? "super-admin" : paidCheckoutId,
                  jobId: currentJobId,
                  email: checkoutEmail,
               },
            }),
         });
         const payload = (await response.json()) as {
            results?: StripResult[];
            creditsRecorded?: boolean;
            error?: string;
         };

         if (!response.ok) {
            throw new Error(payload.error || "Batch generation failed.");
         }

         const nextResults = (payload.results ?? []).reduce<
            Record<string, StripResult>
         >((next, result) => {
            next[result.id] = result;
            return next;
         }, {});

         const merged = { ...resultsRef.current, ...nextResults };
         commitResults(merged);
         // always refresh from server so balance reflects what polar actually recorded
         setBillingRefreshKey((k) => k + 1);
         await saveJob(merged);
      } catch (error) {
         const message =
            error instanceof Error ? error.message : "Batch generation failed.";
         setBatchError(message);
         const nextResults = { ...resultsRef.current };
         for (const selection of selections) {
            nextResults[selection.id] = {
               id: selection.id,
               name: selection.name,
               prompt: versionPrompts[selection.id]?.trim() || undefined,
               error: message,
            };
         }
         commitResults(nextResults);
      }
   };

   const generateVersion = async (selection: Selection, index: number) => {
      if (!source) {
         setBatchError("Load an image before creating a version.");
         return;
      }

      if (!canGenerateSingleAi) {
         setCheckoutIntent("job");
         setAuthMode(checkoutEmail ? "sign-in" : "sign-up");
         setPaymentModalOpen(true);
         setCheckoutError("");
         return;
      }

      setBatchError("");
      setPaymentNotice("");
      const prompt = versionPrompts[selection.id]?.trim() || undefined;

      commitResults({
         ...resultsRef.current,
         [selection.id]: {
            id: selection.id,
            name: selection.name,
            prompt,
            status: "processing",
         },
      });

      try {
         const response = await fetch("/api/strip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               crops: [
                  {
                     id: selection.id,
                     name: selection.name,
                     index,
                     dataUrl: cropToDataUrl(selection),
                     width: Math.round(selection.w),
                     height: Math.round(selection.h),
                     prompt,
                  },
               ],
               settings,
               payment: {
                  checkoutId: isSuperAdmin ? "super-admin" : paidCheckoutId,
                  jobId: currentJobId,
                  email: checkoutEmail,
               },
            }),
         });
         const payload = (await response.json()) as {
            results?: StripResult[];
            creditsRecorded?: boolean;
            error?: string;
         };

         if (!response.ok) {
            throw new Error(payload.error || "Version generation failed.");
         }

         const result = payload.results?.[0];

         if (!result) {
            throw new Error("Version generation failed.");
         }

         const merged = { ...resultsRef.current, [selection.id]: result };
         commitResults(merged);
         // always refresh from server so balance reflects what polar actually recorded
         setBillingRefreshKey((k) => k + 1);
         await saveJob(merged);
      } catch (error) {
         const message =
            error instanceof Error
               ? error.message
               : "Version generation failed.";
         commitResults({
            ...resultsRef.current,
            [selection.id]: {
               id: selection.id,
               name: selection.name,
               prompt,
               error: message,
            },
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
      setSettings(normalizeSettings(entry.settings));
      const restoredResults = entry.results.reduce<Record<string, StripResult>>(
         (next, result) => {
            next[result.id] = result;
            return next;
         },
         {},
      );
      commitResults(restoredResults);
      setVersionPrompts(
         entry.results.reduce<Record<string, string>>((next, result) => {
            if (result.prompt) {
               next[result.id] = result.prompt;
            }

            return next;
         }, {}),
      );
      setSelectedId(entry.selections[0]?.id ?? null);
      setCurrentJobId(entry.id);
      setPaidCheckoutId(entry.payment?.checkoutId ?? null);
      setPaidJobId(entry.payment?.status === "paid" ? entry.id : null);
      setCheckoutEmail(entry.payment?.email ?? checkoutEmail);
      setBatchError("");
      setPaymentNotice("");
   };

   useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const checkoutId = params.get("checkout_id");
      const jobId = params.get("job");
      const billingOnly = params.get("billing") === "1";

      if (!checkoutId || (!jobId && !billingOnly)) {
         return;
      }

      const verifiedCheckoutId = checkoutId;
      const verifiedJobId = jobId ?? "";
      let active = true;

      async function restorePaidJob() {
         try {
            const response = await fetch(
               `/api/checkout/polar/status?checkout_id=${encodeURIComponent(
                  verifiedCheckoutId,
               )}${
                  verifiedJobId
                     ? `&job=${encodeURIComponent(verifiedJobId)}`
                     : ""
               }`,
            );
            const payload = (await response.json()) as {
               paid?: boolean;
               email?: string | null;
               error?: string;
            };

            if (!response.ok || !payload.paid) {
               throw new Error(
                  payload.error || "Payment is not confirmed yet.",
               );
            }

            const entry = verifiedJobId
               ? await getHistory(verifiedJobId)
               : null;

            if (!active) {
               return;
            }

            if (entry) {
               setSource(entry.source);
               setSelections(entry.selections);
               setSettings(normalizeSettings(entry.settings));
               commitResults(
                  entry.results.reduce<Record<string, StripResult>>(
                     (next, result) => {
                        next[result.id] = result;
                        return next;
                     },
                     {},
                  ),
               );
               setVersionPrompts(
                  entry.results.reduce<Record<string, string>>(
                     (next, result) => {
                        if (result.prompt) {
                           next[result.id] = result.prompt;
                        }

                        return next;
                     },
                     {},
                  ),
               );
               setSelectedId(entry.selections[0]?.id ?? null);
            }

            setPaidCheckoutId(verifiedCheckoutId);
            if (verifiedJobId) {
               setCurrentJobId(verifiedJobId);
               setPaidJobId(verifiedJobId);
            }
            if (payload.email) {
               setCheckoutEmail(payload.email);
               localStorage.setItem("image-stripper-email", payload.email);
            }
            setBillingRefreshKey((current) => current + 1);
            // polar's meter_credit benefit is granted asynchronously after checkout —
            // poll a couple more times to catch it once it arrives
            setTimeout(() => setBillingRefreshKey((k) => k + 1), 2500);
            setTimeout(() => setBillingRefreshKey((k) => k + 1), 6000);
            setPaymentModalOpen(false);
            setBatchError("");
            setPaymentNotice(
               billingOnly
                  ? "Billing updated."
                  : entry
                    ? "Payment confirmed. Generate batch to start."
                    : "Payment confirmed, but this browser no longer has the original image.",
            );
            await loadHistory();
            window.history.replaceState({}, "", window.location.pathname);
         } catch (error) {
            if (active) {
               setPaymentNotice("");
               setBatchError(
                  error instanceof Error
                     ? error.message
                     : "Could not verify payment.",
               );
            }
         }
      }

      void restorePaidJob();

      return () => {
         active = false;
      };
   }, [commitResults, loadHistory]);

   return (
      <main className="grid h-screen grid-cols-[240px_minmax(0,1fr)_360px] overflow-hidden bg-background text-foreground">
         <aside className="flex h-screen min-h-0 flex-col border-r bg-background">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
               <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-none">
                     image-stripper
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                     Fast region cleanup batches
                  </p>
               </div>
               <button
                  type="button"
                  onClick={() => {
                     setCheckoutError("");
                     setAuthMode("sign-in");
                     setUserModalOpen(true);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
                  aria-label={checkoutEmail ? "User" : "Sign in"}
                  title={checkoutEmail ? checkoutEmail : "Sign in"}
               >
                  <User size={14} />
               </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
               <div className="sticky top-0 z-10 bg-background pb-3">
                  <button
                     type="button"
                     onClick={() => fileInputRef.current?.click()}
                     className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-surface px-3 text-[13px] font-medium text-foreground border transition-colors duration-150 hover:bg-surface-hover"
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
               </div>

               <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                     <p className="text-xs text-muted-foreground">Selections</p>
                     <p className="text-xs text-subtle-foreground">
                        {selections.length}
                     </p>
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
                              <span className="truncate text-[13px]">
                                 {selection.name}
                              </span>
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
                                       ? {
                                            ...selection,
                                            name: event.target.value,
                                         }
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

                  <div>
                     <p className="mb-1 text-xs text-muted-foreground">Mode</p>
                     <div className="grid grid-cols-2 gap-1">
                        {(["ai", "fast"] as ProcessingMode[]).map((mode) => (
                           <button
                              key={mode}
                              type="button"
                              onClick={() =>
                                 setSettings((current) => ({
                                    ...current,
                                    mode,
                                    format:
                                       mode === "fast" &&
                                       current.fastOperation === "svg"
                                          ? "svg"
                                          : mode === "fast" &&
                                              current.fastOperation ===
                                                 "remove-background"
                                            ? "png"
                                            : current.format,
                                 }))
                              }
                              className={[
                                 "h-8 rounded border px-2 text-xs transition-colors duration-150",
                                 settings.mode === mode
                                    ? "border-accent bg-surface-active text-foreground"
                                    : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                              ].join(" ")}
                           >
                              {mode === "ai" ? "AI cleanup" : "Fast tools"}
                           </button>
                        ))}
                     </div>
                  </div>

                  {isFastMode ? (
                     <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                           Fast action
                        </p>
                        <div className="grid grid-cols-3 gap-1">
                           {fastOptions.map((option) => (
                              <button
                                 key={option.value}
                                 type="button"
                                 onClick={() =>
                                    setSettings((current) => ({
                                       ...current,
                                       fastOperation: option.value,
                                       background:
                                          option.value === "remove-background"
                                             ? "transparent"
                                             : current.background,
                                       format:
                                          option.value === "svg"
                                             ? "svg"
                                             : option.value ===
                                                 "remove-background"
                                               ? "png"
                                               : current.format === "svg"
                                                 ? "png"
                                                 : current.format,
                                    }))
                                 }
                                 className={[
                                    "h-8 rounded border px-2 text-xs transition-colors duration-150",
                                    settings.fastOperation === option.value
                                       ? "border-accent bg-surface-active text-foreground"
                                       : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                                 ].join(" ")}
                              >
                                 {option.label}
                              </button>
                           ))}
                        </div>
                     </div>
                  ) : null}

                  <label className="block text-xs text-muted-foreground">
                     Format
                     <select
                        value={effectiveFormat}
                        onChange={(event) =>
                           setSettings((current) => ({
                              ...current,
                              format: event.target.value as OutputFormat,
                           }))
                        }
                        disabled={
                           isFastMode &&
                           (settings.fastOperation === "svg" ||
                              settings.fastOperation === "remove-background")
                        }
                        className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none focus:border-accent disabled:text-subtle-foreground"
                     >
                        {formatOptions.map((format) => (
                           <option
                              key={format}
                              value={format}
                              disabled={
                                 settings.background === "transparent" &&
                                 format === "jpeg"
                              }
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
                                 setSettings((current) => ({
                                    ...current,
                                    aspectRatio: ratio,
                                 }))
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
                     <p className="mb-1 text-xs text-muted-foreground">
                        Background
                     </p>
                     <div className="grid grid-cols-2 gap-1">
                        {(["keep", "transparent"] as BackgroundMode[]).map(
                           (mode) => (
                              <button
                                 key={mode}
                                 type="button"
                                 onClick={() =>
                                    setSettings((current) => ({
                                       ...current,
                                       background: mode,
                                       format:
                                          mode === "transparent" &&
                                          current.format === "jpeg"
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
                           ),
                        )}
                     </div>
                  </div>

                  <button
                     type="button"
                     onClick={generateBatch}
                     disabled={!source || selections.length === 0}
                     className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle-foreground"
                  >
                     {isFastMode || canGenerateCurrentBatch ? (
                        <Play size={14} />
                     ) : (
                        <CreditCard size={14} />
                     )}
                     {isFastMode ? "Run fast tool" : "Generate"}
                  </button>

                  {billingUsageNotice ? (
                     <p className="rounded-md border bg-surface px-3 py-2 text-xs text-muted-foreground">
                        {billingUsageNotice}
                     </p>
                  ) : null}

                  {isSuperAdmin ? (
                     <p className="rounded-md border border-success/50 bg-surface px-3 py-2 text-xs text-success">
                        Super admin enabled for{" "}
                        {checkoutEmail.trim().toLowerCase()}.
                     </p>
                  ) : null}

                  {paymentNotice ? (
                     <p className="rounded-md border border-success/50 bg-surface px-3 py-2 text-xs text-success">
                        {paymentNotice}
                     </p>
                  ) : null}

                  {saveNotice ? (
                     <p className="rounded-md border bg-surface px-3 py-2 text-xs text-muted-foreground">
                        {saveNotice}
                     </p>
                  ) : null}

                  {batchError ? (
                     <p className="rounded-md border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">
                        {batchError}
                     </p>
                  ) : null}
               </div>

               <div className="mt-5 border-t pt-4">
                  <div className="mb-2 flex items-center justify-between">
                     <p className="text-xs text-muted-foreground">History</p>
                     <p className="text-xs text-subtle-foreground">
                        {history.length}
                     </p>
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

            <div className="relative border-t px-3 py-3">
               {checkoutEmail ? (
                  <>
                     <button
                        type="button"
                        onClick={() => setUserMenuOpen((open) => !open)}
                        className="flex h-8 w-full items-center justify-start gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover"
                     >
                        <User size={14} />
                        <span className="min-w-0 flex-1 truncate text-left">
                           {checkoutEmail}
                        </span>
                     </button>

                     {userMenuOpen ? (
                        <div className="absolute bottom-[52px] left-3 right-3 z-20 rounded-lg border bg-[#0A0A0A] p-1">
                           <button
                              type="button"
                              onClick={openBilling}
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
                           >
                              <CreditCard size={14} />
                              Billing
                           </button>
                           <button
                              type="button"
                              onClick={() => {
                                 setUserMenuOpen(false);
                                 setSettingsModalOpen(true);
                              }}
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
                           >
                              <Settings size={14} />
                              Settings
                           </button>
                           <button
                              type="button"
                              onClick={signOutUser}
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-danger transition-colors duration-150 hover:bg-surface-hover"
                           >
                              <LogOut size={14} />
                              Sign out
                           </button>
                        </div>
                     ) : null}
                  </>
               ) : (
                  <>
                     <p className="mb-2 text-xs text-muted-foreground">
                        Your results won&apos;t be saved permanently.
                     </p>
                     <button
                        type="button"
                        onClick={() => {
                           setCheckoutError("");
                           setAuthMode("sign-in");
                           setUserModalOpen(true);
                        }}
                        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover"
                     >
                        <User size={14} />
                        Sign in / Sign up
                     </button>
                  </>
               )}
            </div>
         </aside>

         <section
            className={[
               "sticky top-0 flex h-screen min-w-0 items-center justify-center overflow-auto border-r bg-background p-4",
               isDraggingFile ? "bg-surface-hover" : "",
               !source ? "cursor-pointer" : "",
            ].join(" ")}
            onClick={() => {
               if (!source) {
                  fileInputRef.current?.click();
               }
            }}
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
                  {selections.length === 0 ? (
                     <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground backdrop-blur">
                        Select a section on the image
                     </div>
                  ) : null}
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
                           [
                              "se",
                              selection.x + selection.w,
                              selection.y + selection.h,
                           ],
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
                                    stroke: selected
                                       ? "var(--accent)"
                                       : "var(--border-strong)",
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
                                               event.currentTarget
                                                  .ownerSVGElement,
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
               <div className="mt-8 flex w-full max-w-[520px] flex-col items-center justify-center rounded-lg border bg-surface px-6 py-8 text-center">
                  <FileImage className="text-muted-foreground" size={20} />
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                     Drop, paste, or upload an image
                  </h1>
                  <p className="mt-2 max-w-[360px] text-sm text-muted-foreground">
                     Draw regions over the source, then generate all clean crops
                     as one batch.
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

         <OutputPanel
            settings={settings}
            selections={selections}
            results={results}
            source={source}
            cropPreviews={cropPreviews}
            versionPrompts={versionPrompts}
            setVersionPrompts={setVersionPrompts}
            selectedId={selectedId}
            isFastMode={isFastMode}
            canDownloadAll={canDownloadAll}
            onSelect={setSelectedId}
            onDownloadAll={downloadAll}
            onDownloadResult={downloadDataUrl}
            onGenerateVersion={generateVersion}
         />

         {settingsModalOpen ? (
            <SettingsModal
               settings={settings}
               setSettings={setSettings}
               onClose={() => setSettingsModalOpen(false)}
            />
         ) : null}

         {userModalOpen ? (
            <UserModal
               authMode={authMode}
               setAuthMode={setAuthMode}
               checkoutEmail={checkoutEmail}
               setCheckoutEmail={setCheckoutEmail}
               checkoutPassword={checkoutPassword}
               setCheckoutPassword={setCheckoutPassword}
               checkoutError={checkoutError}
               clearCheckoutError={() => setCheckoutError("")}
               billingState={billingStateMatchesEmail ? billingState : null}
               onSubmit={() => void saveUserEmail()}
               onSignOut={signOutUser}
               onClose={() => setUserModalOpen(false)}
            />
         ) : null}

         {paymentModalOpen ? (
            <PaymentModal
               checkoutIntent={checkoutIntent}
               checkoutEmail={checkoutEmail}
               setCheckoutEmail={setCheckoutEmail}
               checkoutPassword={checkoutPassword}
               setCheckoutPassword={setCheckoutPassword}
               checkoutError={checkoutError}
               clearCheckoutError={() => setCheckoutError("")}
               authMode={authMode}
               setAuthMode={setAuthMode}
               selectedPlanId={selectedPlanId}
               setSelectedPlanId={setSelectedPlanId}
               selectedPlan={selectedPlan}
               selectionsLength={selections.length}
               isCheckoutLoading={isCheckoutLoading}
               onContinue={() => void continueCheckout()}
               onClose={() => setPaymentModalOpen(false)}
            />
         ) : null}
      </main>
   );
}
