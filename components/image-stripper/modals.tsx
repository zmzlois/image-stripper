import {
   CreditCard,
   Loader2,
   LogOut,
   Mail,
   User,
   UserPlus,
   X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { modelOptions, pricingPlans } from "@/lib/image-stripper/config";
import type {
   AuthMode,
   BillingState,
   CheckoutIntent,
   PricingPlan,
   PricingPlanId,
   StripSettings,
} from "@/lib/image-stripper/types";
import { isSuperAdminEmail } from "@/lib/image-stripper/utils";

type AuthModeSwitchProps = {
   authMode: AuthMode;
   setAuthMode: (mode: AuthMode) => void;
   clearError: () => void;
};

function AuthModeSwitch({
   authMode,
   setAuthMode,
   clearError,
}: AuthModeSwitchProps) {
   return (
      <div className="grid grid-cols-2 rounded-md border bg-surface p-0.5">
         {(["sign-in", "sign-up"] as const).map((mode) => (
            <button
               key={mode}
               type="button"
               onClick={() => {
                  setAuthMode(mode);
                  clearError();
               }}
               className={[
                  "flex h-7 items-center justify-center gap-2 rounded px-2 text-[13px] font-medium transition-colors duration-150",
                  authMode === mode
                     ? "bg-surface-active text-foreground"
                     : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
               ].join(" ")}
            >
               {mode === "sign-up" ? (
                  <UserPlus size={14} />
               ) : (
                  <User size={14} />
               )}
               {mode === "sign-up" ? "Sign up" : "Sign in"}
            </button>
         ))}
      </div>
   );
}

type SettingsModalProps = {
   settings: StripSettings;
   setSettings: Dispatch<SetStateAction<StripSettings>>;
   onClose: () => void;
};

export function SettingsModal({
   settings,
   setSettings,
   onClose,
}: SettingsModalProps) {
   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
         <div className="w-full max-w-[480px] rounded-xl border border-border-strong bg-[#0A0A0A]">
            <div className="flex items-start justify-between border-b px-4 py-3">
               <div>
                  <p className="text-[13px] font-medium leading-none">Settings</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                     Model routing for AI cleanup
                  </p>
               </div>
               <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  aria-label="Close settings"
               >
                  <X size={16} />
               </button>
            </div>

            <div className="space-y-4 p-4">
               <div className="space-y-2">
                  {modelOptions.map((option) => {
                     const selected = settings.modelPreference === option.value;

                     return (
                        <button
                           key={option.value}
                           type="button"
                           onClick={() =>
                              setSettings((current) => ({
                                 ...current,
                                 modelPreference: option.value,
                              }))
                           }
                           className={[
                              "w-full rounded-lg border bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-hover",
                              selected ? "border-accent bg-surface-active" : "",
                           ].join(" ")}
                        >
                           <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                 <p className="text-[13px] font-medium">
                                    {option.label}
                                 </p>
                                 <p className="mt-1 text-xs text-muted-foreground">
                                    {option.note}
                                 </p>
                              </div>
                              <span className="text-xs text-subtle-foreground">
                                 {selected ? "Selected" : ""}
                              </span>
                           </div>
                        </button>
                     );
                  })}
               </div>

               <p className="rounded-md border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">
                  Pinning one model can hit that provider&apos;s rate limits faster.
                  Rotate is safer for larger batches.
               </p>

               <div className="flex justify-end">
                  <button
                     type="button"
                     onClick={onClose}
                     className="flex h-8 items-center justify-center rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover"
                  >
                     Done
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
}

type UserModalProps = {
   authMode: AuthMode;
   setAuthMode: (mode: AuthMode) => void;
   checkoutEmail: string;
   setCheckoutEmail: (email: string) => void;
   checkoutPassword: string;
   setCheckoutPassword: (password: string) => void;
   checkoutError: string;
   clearCheckoutError: () => void;
   billingState?: BillingState | null;
   onSubmit: () => void;
   onSignOut: () => void;
   onClose: () => void;
};

export function UserModal({
   authMode,
   setAuthMode,
   checkoutEmail,
   setCheckoutEmail,
   checkoutPassword,
   setCheckoutPassword,
   checkoutError,
   clearCheckoutError,
   billingState,
   onSubmit,
   onSignOut,
   onClose,
}: UserModalProps) {
   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
         <div className="w-full max-w-[480px] rounded-xl border border-border-strong bg-[#0A0A0A]">
            <div className="flex items-start justify-between border-b px-4 py-3">
               <div>
                  <p className="text-[13px] font-medium leading-none">
                     {authMode === "sign-up" ? "Create account" : "User"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                     Sign in or create an account
                  </p>
               </div>
               <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  aria-label="Close user"
               >
                  <X size={16} />
               </button>
            </div>

            <div className="space-y-4 p-4">
               <AuthModeSwitch
                  authMode={authMode}
                  setAuthMode={setAuthMode}
                  clearError={clearCheckoutError}
               />

               {billingState && billingState.kind !== "anonymous" ? (
                  <div className="rounded-md border bg-surface px-3 py-2.5">
                     <p className="text-[11px] uppercase tracking-wide text-subtle-foreground">
                        Current plan
                     </p>
                     {billingState.kind === "unlimited" ? (
                        <p className="mt-1 text-[13px] font-medium text-success">
                           {billingState.label}
                        </p>
                     ) : billingState.kind === "credits" ? (
                        <div className="mt-1 flex items-baseline gap-2">
                           <p className="text-[13px] font-medium">
                              {billingState.balance}
                           </p>
                           <p className="text-xs text-muted-foreground">
                              credit{billingState.balance === 1 ? "" : "s"} remaining
                           </p>
                        </div>
                     ) : billingState.kind === "none" ? (
                        <p className="mt-1 text-[13px] text-muted-foreground">
                           No active plan
                        </p>
                     ) : null}
                  </div>
               ) : null}

               <label className="block text-xs text-muted-foreground">
                  Email
                  <div className="mt-1 flex h-8 items-center gap-2 rounded-md border bg-surface px-3 focus-within:border-accent">
                     <Mail size={14} />
                     <input
                        value={checkoutEmail}
                        onChange={(event) => setCheckoutEmail(event.target.value)}
                        onKeyDown={(event) => {
                           if (event.key === "Enter") {
                              onSubmit();
                           }
                        }}
                        type="email"
                        placeholder="you@example.com"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle-foreground"
                     />
                  </div>
               </label>

               {!isSuperAdminEmail(checkoutEmail) ? (
                  <label className="block text-xs text-muted-foreground">
                     Password
                     <input
                        value={checkoutPassword}
                        onChange={(event) =>
                           setCheckoutPassword(event.target.value)
                        }
                        onKeyDown={(event) => {
                           if (event.key === "Enter") {
                              onSubmit();
                           }
                        }}
                        type="password"
                        placeholder={
                           authMode === "sign-up"
                              ? "At least 8 characters"
                              : "Account password"
                        }
                        className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-subtle-foreground focus:border-accent"
                     />
                  </label>
               ) : (
                  <p className="rounded-md border border-success/50 bg-surface px-3 py-2 text-xs text-success">
                     Owner sign-in does not require a password.
                  </p>
               )}

               {checkoutError ? (
                  <p className="rounded-md border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">
                     {checkoutError}
                  </p>
               ) : null}

               <div className="flex items-center justify-between gap-2">
                  {checkoutEmail ? (
                     <button
                        type="button"
                        onClick={onSignOut}
                        className="flex h-8 items-center justify-center gap-2 rounded-md border bg-surface px-3 text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-surface-hover"
                     >
                        <LogOut size={14} />
                        Sign out
                     </button>
                  ) : (
                     <span />
                  )}

                  <div className="flex items-center gap-2">
                     <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 items-center justify-center rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover"
                     >
                        Cancel
                     </button>
                     <button
                        type="button"
                        onClick={onSubmit}
                        className="flex h-8 items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover"
                     >
                        {authMode === "sign-up" &&
                        !isSuperAdminEmail(checkoutEmail) ? (
                           <UserPlus size={14} />
                        ) : (
                           <User size={14} />
                        )}
                        {authMode === "sign-up" && !isSuperAdminEmail(checkoutEmail)
                           ? "Sign up"
                           : "Sign in"}
                     </button>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}

type PaymentModalProps = {
   checkoutIntent: CheckoutIntent;
   checkoutEmail: string;
   setCheckoutEmail: (email: string) => void;
   checkoutPassword: string;
   setCheckoutPassword: (password: string) => void;
   checkoutError: string;
   clearCheckoutError: () => void;
   authMode: AuthMode;
   setAuthMode: (mode: AuthMode) => void;
   selectedPlanId: PricingPlanId;
   setSelectedPlanId: (planId: PricingPlanId) => void;
   selectedPlan: PricingPlan;
   selectionsLength: number;
   isCheckoutLoading: boolean;
   onContinue: () => void;
   onClose: () => void;
};

export function PaymentModal({
   checkoutIntent,
   checkoutEmail,
   setCheckoutEmail,
   checkoutPassword,
   setCheckoutPassword,
   checkoutError,
   clearCheckoutError,
   authMode,
   setAuthMode,
   selectedPlanId,
   setSelectedPlanId,
   selectedPlan,
   selectionsLength,
   isCheckoutLoading,
   onContinue,
   onClose,
}: PaymentModalProps) {
   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
         <div className="w-full max-w-[480px] rounded-xl border border-border-strong bg-[#0A0A0A]">
            <div className="flex items-start justify-between border-b px-4 py-3">
               <div>
                  <p className="text-[13px] font-medium leading-none">
                     {checkoutIntent === "billing" ? "Billing" : "Choose a plan"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                     {checkoutIntent === "billing"
                        ? `Upgrade or add credits for ${checkoutEmail}`
                        : `${selectionsLength} selected section${
                             selectionsLength === 1 ? "" : "s"
                          } ready`}
                  </p>
               </div>
               <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  aria-label="Close checkout"
               >
                  <X size={16} />
               </button>
            </div>

            <div className="space-y-4 p-4">
               <div className="space-y-2">
                  {pricingPlans.map((plan) => {
                     const selected = selectedPlanId === plan.id;

                     return (
                        <button
                           key={plan.id}
                           type="button"
                           onClick={() => setSelectedPlanId(plan.id)}
                           className={[
                              "w-full rounded-lg border bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-hover",
                              selected ? "border-accent bg-surface-active" : "",
                           ].join(" ")}
                        >
                           <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                 <div className="flex items-center gap-2">
                                    <p className="text-[13px] font-medium">
                                       {plan.name}
                                    </p>
                                    {plan.id === "monthly" ? (
                                       <span className="rounded border border-accent/60 px-1.5 py-0.5 text-[10px] uppercase leading-none text-accent">
                                          Popular
                                       </span>
                                    ) : null}
                                 </div>
                                 <p className="mt-1 text-xs text-muted-foreground">
                                    {plan.credits} · {plan.note}
                                 </p>
                              </div>
                              <p className="text-[18px] font-semibold tracking-[-0.01em]">
                                 {plan.price}
                              </p>
                           </div>
                        </button>
                     );
                  })}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                     <div className="rounded-md border bg-background px-2 py-2">
                        {checkoutIntent === "billing"
                           ? "Account"
                           : `${selectionsLength} now`}
                     </div>
                     <div className="rounded-md border bg-background px-2 py-2">
                        ZIP export
                     </div>
                     <div className="rounded-md border bg-background px-2 py-2">
                        Prompt edits
                     </div>
                  </div>
               </div>

               <AuthModeSwitch
                  authMode={authMode}
                  setAuthMode={setAuthMode}
                  clearError={clearCheckoutError}
               />

               <label className="block text-xs text-muted-foreground">
                  Email
                  <div className="mt-1 flex h-8 items-center gap-2 rounded-md border bg-surface px-3 focus-within:border-accent">
                     <Mail size={14} />
                     <input
                        value={checkoutEmail}
                        onChange={(event) => setCheckoutEmail(event.target.value)}
                        onKeyDown={(event) => {
                           if (event.key === "Enter") {
                              onContinue();
                           }
                        }}
                        type="email"
                        placeholder="lois@normal-people.com"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle-foreground"
                     />
                  </div>
               </label>

               {!isSuperAdminEmail(checkoutEmail) ? (
                  <label className="block text-xs text-muted-foreground">
                     Password
                     <input
                        value={checkoutPassword}
                        onChange={(event) =>
                           setCheckoutPassword(event.target.value)
                        }
                        onKeyDown={(event) => {
                           if (event.key === "Enter") {
                              onContinue();
                           }
                        }}
                        type="password"
                        placeholder={
                           authMode === "sign-up"
                              ? "At least 8 characters"
                              : "Account password"
                        }
                        className="mt-1 h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-subtle-foreground focus:border-accent"
                     />
                  </label>
               ) : (
                  <p className="rounded-md border border-success/50 bg-surface px-3 py-2 text-xs text-success">
                     Owner sign-in does not require a password.
                  </p>
               )}

               <p className="rounded-md border bg-surface px-3 py-2 text-xs text-muted-foreground">
                  {authMode === "sign-up"
                     ? "Create an account here, then continue straight to checkout."
                     : "Sign in here, then continue straight to checkout."}
               </p>

               {checkoutError ? (
                  <p className="rounded-md border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">
                     {checkoutError}
                  </p>
               ) : null}

               <div className="flex items-center justify-end gap-2">
                  <button
                     type="button"
                     onClick={onClose}
                     className="flex h-8 items-center justify-center rounded-md border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover"
                  >
                     Cancel
                  </button>
                  <button
                     type="button"
                     onClick={onContinue}
                     disabled={isCheckoutLoading || !checkoutEmail}
                     className="flex h-8 items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle-foreground"
                  >
                     {isCheckoutLoading ? (
                        <Loader2 className="animate-spin" size={14} />
                     ) : (
                        <CreditCard size={14} />
                     )}
                     {checkoutEmail
                        ? `Continue with ${selectedPlan.name}`
                        : "Sign in first"}
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
}
