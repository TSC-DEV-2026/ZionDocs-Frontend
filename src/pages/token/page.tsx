"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import api from "@/utils/axiosInstance";
import { useUser } from "@/contexts/UserContext";
import { useNavigate } from "react-router-dom";

const schema = z.object({
  token: z.string().min(1, "Informe o token").transform((v) => v.trim()),
});

type FormData = z.infer<typeof schema>;
type Step = "send" | "validate";

export default function TokenPage() {
  const navigate = useNavigate();

  const {
    user,
    isAuthenticated,
    internalTokenValidated,
    internalTokenBlockedInSession,
    setInternalTokenValidated,
    setInternalTokenBlockedInSession,
    setInternalTokenPromptedInSession,
  } = useUser();

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const [step, setStep] = useState<Step>("send");
  const [showToken, setShowToken] = useState(false);
  const [sending, setSending] = useState(false);
  const [validating, setValidating] = useState(false);

  const [tokenError, setTokenError] = useState("");
  const [sendMsg, setSendMsg] = useState("");

  const [lastSendAt, setLastSendAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // ✅ Ao entrar em /token, marca como "já foi direcionado"
  useEffect(() => {
    if (isAuthenticated) {
      setInternalTokenPromptedInSession(true);
    }
  }, [isAuthenticated, setInternalTokenPromptedInSession]);

  // ✅ Regra de acesso:
  // - se não autenticado: vai login
  // - se já validou: vai home
  // - se estiver "blocked": vai home (se você realmente usa esse bloqueio)
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    if (internalTokenValidated) {
      navigate("/", { replace: true });
      return;
    }

    if (internalTokenBlockedInSession) {
      navigate("/", { replace: true });
      return;
    }
  }, [
    isAuthenticated,
    internalTokenValidated,
    internalTokenBlockedInSession,
    navigate,
  ]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const canSend = useMemo(
    () => Boolean(user?.cpf) && !sending,
    [user?.cpf, sending]
  );

  const resendCooldownSec = 30;
  const resendRemaining = useMemo(() => {
    if (!lastSendAt) return 0;
    const diffSec = Math.ceil(
      (lastSendAt + resendCooldownSec * 1000 - nowTick) / 1000
    );
    return Math.max(0, diffSec);
  }, [lastSendAt, nowTick]);

  const canResend = useMemo(() => {
    return step === "validate" && !sending && resendRemaining === 0;
  }, [step, sending, resendRemaining]);

  const sendToken = async () => {
    if (sending) return;

    setSending(true);
    setTokenError("");
    setSendMsg("");

    try {
      await api.post("/user/internal/send-token");

      setSendMsg("Token enviado para o seu e-mail. Verifique sua caixa de entrada.");
      setLastSendAt(Date.now());
      setStep("validate");

      setTimeout(() => {
        try {
          setFocus("token");
        } catch {
          // ignore
        }
      }, 0);
    } catch (err: any) {
      setTokenError(
        err?.response?.data?.detail || err?.message || "Erro ao enviar o token"
      );
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setValidating(true);
    setTokenError("");

    try {
      const res = await api.post("/user/internal/validate-token", {
        token: data.token,
      });

      const valid = !!res.data?.valid;

      if (!valid) {
        const reason = res.data?.reason ?? "invalid";
        setTokenError(`Token inválido (${reason}).`);
        return;
      }

      // ✅ SUCESSO:
      // - validated = true
      // - blocked NÃO deve ser true (senão você nunca mais acessa /token)
      setInternalTokenValidated(true);
      setInternalTokenBlockedInSession(false);

      navigate("/", { replace: true });
    } catch (err: any) {
      setTokenError(
        err?.response?.data?.detail || err?.message || "Erro ao validar o token"
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen w-screen relative isolate overflow-hidden flex items-center justify-center p-4">
      {/* FUNDO (igual Login) */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#44F01F] via-[#2ECC4A] to-[#2B8B49]" />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className={[
          "relative z-10",
          "w-full max-w-sm space-y-6 p-8 rounded-2xl",
          "bg-white/85 backdrop-blur-md",
          "shadow-[0_22px_70px_rgba(0,0,0,0.20)]",
          "border border-[#d8efe0]",
        ].join(" ")}
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-center text-[#0b2b14]">
            Validação de Token
          </h2>
          <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-[#25601d] to-[#2fa146]" />
        </div>

        {step === "send" && (
          <>
            <p className="text-sm text-[#0b2b14] text-center">
              Clique para enviar um token ao seu e-mail e continuar.
            </p>

            <Button
              type="button"
              className={[
                "w-full py-2 font-semibold rounded-lg",
                "text-white",
                "bg-gradient-to-r from-[#25601d] to-[#2fa146]",
                "hover:opacity-95",
                "shadow-[0_10px_24px_rgba(47,161,70,0.22)]",
              ].join(" ")}
              disabled={!canSend}
              onClick={sendToken}
            >
              {sending ? "Enviando..." : "Enviar token para o e-mail"}
            </Button>

            {sendMsg && (
              <div className="text-sm text-[#0b2b14] bg-[#e9f8ef] border border-[#bfead0] rounded-lg p-3">
                {sendMsg}
              </div>
            )}
          </>
        )}

        {step === "validate" && (
          <>
            <p className="text-sm text-[#0b2b14] text-center">
              Digite o token enviado para seu e-mail.
            </p>

            {sendMsg && (
              <div className="text-sm text-[#0b2b14] bg-[#e9f8ef] border border-[#bfead0] rounded-lg p-3">
                {sendMsg}
              </div>
            )}

            <div>
              <Label htmlFor="token" className="text-[#0b2b14]">
                Token de Acesso
              </Label>

              <div className="relative">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  {...register("token")}
                  placeholder="Digite seu token"
                  className={[
                    "mt-1 pr-10",
                    "bg-white",
                    "border-[#cfe8d8] focus-visible:ring-0",
                    "focus:border-[#2fa146]",
                    "text-[#0b2b14] placeholder:text-[#2f4f38]/60",
                  ].join(" ")}
                  autoComplete="off"
                />
                <div
                  className="absolute right-2 top-2 text-[#2f4f38] cursor-pointer hover:text-[#25601d]"
                  onClick={() => setShowToken((prev) => !prev)}
                  role="button"
                  aria-label="Alternar visualização do token"
                  tabIndex={0}
                >
                  {showToken ? <EyeOff size={20} /> : <Eye size={20} />}
                </div>
              </div>

              {errors.token && (
                <p className="text-red-600 text-sm mt-1">{errors.token.message}</p>
              )}
            </div>

            <div className="space-y-3">
              <Button
                type="submit"
                className={[
                  "w-full py-2 font-semibold rounded-lg",
                  "text-white",
                  "bg-gradient-to-r from-[#25601d] to-[#2fa146]",
                  "hover:opacity-95",
                  "shadow-[0_10px_24px_rgba(47,161,70,0.22)]",
                ].join(" ")}
                disabled={validating}
              >
                {validating ? "Validando..." : "Validar Token"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={sendToken}
                  disabled={!canResend}
                  className={[
                    "text-sm underline underline-offset-4",
                    canResend
                      ? "text-[#25601d] hover:text-[#2fa146]"
                      : "text-gray-500 cursor-not-allowed",
                  ].join(" ")}
                >
                  {sending
                    ? "Reenviando..."
                    : resendRemaining > 0
                    ? `Reenviar token (aguarde ${resendRemaining}s)`
                    : "Reenviar token"}
                </button>

                <div className="text-xs text-[#2f4f38]/70 mt-2">
                  Ao reenviar, o token anterior pode ser invalidado. Use sempre o último e-mail.
                </div>
              </div>
            </div>
          </>
        )}

        {tokenError && (
          <p className="text-red-600 text-sm text-center">{tokenError}</p>
        )}
      </form>
    </div>
  );
}