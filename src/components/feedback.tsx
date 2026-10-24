import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ApiError, errorMessage } from "../api/client";
import { Button, Modal } from "./ui";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ConfirmRequest {
  title: string;
  message?: string;
  impacts?: string[];
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (req: ConfirmRequest) => Promise<boolean>;
  /** Run a mutation; if the API asks for confirmation (409 impacts), ask the user and retry with confirm=true. */
  withImpacts: <T>(run: (confirmed: boolean) => Promise<T>, title?: string) => Promise<T | undefined>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);

  const confirm = useCallback((req: ConfirmRequest) => new Promise<boolean>((resolve) => setPending({ ...req, resolve })), []);

  const withImpacts = useCallback(
    async <T,>(run: (confirmed: boolean) => Promise<T>, title = "Confirm change") => {
      try {
        return await run(false);
      } catch (err) {
        if (err instanceof ApiError && err.needsConfirmation) {
          const ok = await confirm({ title, message: err.message, impacts: err.impacts, confirmLabel: "Yes, continue", danger: true });
          if (!ok) return undefined;
          return await run(true);
        }
        throw err;
      }
    },
    [confirm],
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, withImpacts }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
      {pending && (
        <Modal title={pending.title} onClose={() => close(false)} width={520}>
          {pending.message && <p>{pending.message}</p>}
          {pending.impacts && pending.impacts.length > 0 && (
            <div className="callout callout-warning">
              <strong>This will affect:</strong>
              <ul>
                {pending.impacts.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={pending.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {pending.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback(): FeedbackApi & { fail: (err: unknown) => void } {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return { ...ctx, fail: (err: unknown) => ctx.toast(errorMessage(err), "error") };
}
