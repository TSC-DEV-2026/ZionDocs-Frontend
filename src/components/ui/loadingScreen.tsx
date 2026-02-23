// src/components/LoadingScreen.tsx
import { Loader2 } from "lucide-react";

type LoadingScreenProps = {
  // overlay = tela inteira | container = cobre só o pai (precisa do pai com className="relative") | inline = linha
  variant?: "overlay" | "container" | "inline";
  message?: string;
  subtext?: string;
  className?: string;
};

export default function LoadingScreen({
  variant = "overlay",
  message = "Carregando...",
  subtext = "Preparando seus dados.",
  className,
}: LoadingScreenProps) {
  if (variant === "inline") {
    return (
      <div className={`flex items-center justify-center gap-3 ${className ?? ""}`}>
        <Loader2 className="h-6 w-6 animate-spin text-[#25601d] dark:text-white" />
        <div className="text-base font-semibold text-[#0b2b14] dark:text-white">
          {message}
        </div>
      </div>
    );
  }

  if (variant === "container") {
    // cobre apenas o container pai (que deve ser relative)
    return (
      <div className="absolute inset-0 z-20 grid place-items-center rounded-xl">
        <div className="absolute inset-0 rounded-xl bg-black/35 backdrop-blur-sm" />
        <div className="relative z-10 flex flex-col items-center justify-center gap-3 px-6 py-8 bg-white/15 rounded-xl text-white shadow border border-white/15">
          <Loader2 className="h-6 w-6 animate-spin text-[#2fa146]" />
          <div className="text-base font-semibold">{message}</div>
          {subtext ? <p className="text-xs opacity-80 text-center">{subtext}</p> : null}
        </div>
      </div>
    );
  }

  // overlay: tela inteira
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* PAGE_BG (mesmo do PreviewDocumento) */}
      <div className="fixed inset-0 z-0 bg-[#d9efe2] dark:bg-[#07150d]" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.18),rgba(217,239,226,0))] dark:bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.22),rgba(7,21,13,0))]" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.14),rgba(217,239,226,0))] dark:bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.20),rgba(7,21,13,0))]" />

      <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 py-8 bg-black/20 dark:bg-black/35 rounded-xl backdrop-blur-sm text-white border border-white/15 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <div className="text-lg font-semibold">{message}</div>
        {subtext ? <p className="text-sm opacity-80 text-center">{subtext}</p> : null}
      </div>
    </div>
  );
}