"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

import { toast, Toaster } from "sonner";
import api from "@/utils/axiosInstance";
import { useUser } from "@/contexts/UserContext";
import { useNavigate } from "react-router-dom";

const schema = z
  .object({
    novaSenha: z
      .string()
      .min(8, "A nova senha deve ter no mínimo 8 caracteres")
      .max(128, "A nova senha é muito longa"),
    confirmarSenha: z.string().min(8, "Confirme a nova senha"),
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    path: ["confirmarSenha"],
    message: "As senhas não conferem",
  });

type FormData = z.infer<typeof schema>;

export default function ForceChangePasswordPage() {
  const navigate = useNavigate();

  const {
    user,
    mustChangePassword,
    getLoginPassword,
    clearLoginPassword,
    refreshUser,
    logout,
  } = useUser();

  const cpf = user?.cpf ?? "";
  const senhaAtual = getLoginPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    if (done) return false;
    return Boolean(cpf && senhaAtual && mustChangePassword);
  }, [cpf, senhaAtual, mustChangePassword, done]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setPageError("");
    setPageSuccess("");

    try {
      if (!cpf) {
        setPageError("Não foi possível identificar o CPF do usuário.");
        return;
      }

      if (!senhaAtual) {
        setPageError(
          "Por segurança, é necessário informar sua senha atual novamente. Faça login de novo.",
        );
        return;
      }

      await api.put("/user/update-password", {
        cpf,
        senha_atual: senhaAtual,
        senha_nova: data.novaSenha,
      });

      clearLoginPassword();
      setDone(true);

      toast.success("Senha atualizada com sucesso.", { duration: 2500 });
      setPageSuccess("Senha atualizada. Redirecionando...");

      const u = await refreshUser();

      if ((u as any)?.interno === true) {
        navigate("/token", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      if (err?.message === "Network Error") {
        setPageError(
          "Não foi possível conectar ao servidor. Verifique sua conexão.",
        );
      } else {
        setPageError(
          err?.response?.data?.detail ||
            err?.message ||
            "Erro ao atualizar a senha",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const showYellowWarning = !done && !pageSuccess && !senhaAtual;

  return (
    <div className="min-h-screen w-screen relative isolate overflow-hidden flex items-center justify-center p-4">
      {/* FUNDO padrão do site (igual Login) */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#44F01F] via-[#2ECC4A] to-[#2B8B49]" />

      <Toaster richColors position="top-center" />

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
            Troca de senha obrigatória
          </h2>
          <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-[#25601d] to-[#2fa146]" />
          <p className="text-sm text-center text-[#2f4f38]/70">
            Por segurança, você precisa definir uma nova senha antes de continuar.
          </p>
        </div>

        {showYellowWarning && (
          <div className="text-sm text-[#7a4b00] bg-[#fff7db] border border-[#ffd07a] rounded-lg p-3">
            Sua sessão está autenticada, mas a senha atual não está disponível na
            memória. Para continuar, faça login novamente.
          </div>
        )}

        <div>
          <Label htmlFor="novaSenha" className="text-[#0b2b14]">
            Nova senha
          </Label>
          <div className="relative">
            <Input
              id="novaSenha"
              type={showNewPassword ? "text" : "password"}
              {...register("novaSenha")}
              className={[
                "mt-1 pr-10",
                "bg-white",
                "border-[#cfe8d8] focus-visible:ring-0",
                "focus:border-[#2fa146]",
                "text-[#0b2b14] placeholder:text-[#2f4f38]/60",
              ].join(" ")}
              autoComplete="new-password"
              disabled={!mustChangePassword || loading || done}
            />
            <div
              className="absolute right-2 top-2 text-[#2f4f38] cursor-pointer hover:text-[#25601d]"
              onClick={() => setShowNewPassword((prev) => !prev)}
              role="button"
              aria-label="Alternar visualização da nova senha"
              tabIndex={0}
            >
              {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>
          {errors.novaSenha && (
            <p className="text-red-600 text-sm mt-1">{errors.novaSenha.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmarSenha" className="text-[#0b2b14]">
            Confirmar nova senha
          </Label>
          <div className="relative">
            <Input
              id="confirmarSenha"
              type={showConfirmPassword ? "text" : "password"}
              {...register("confirmarSenha")}
              className={[
                "mt-1 pr-10",
                "bg-white",
                "border-[#cfe8d8] focus-visible:ring-0",
                "focus:border-[#2fa146]",
                "text-[#0b2b14] placeholder:text-[#2f4f38]/60",
              ].join(" ")}
              autoComplete="new-password"
              disabled={!mustChangePassword || loading || done}
            />
            <div
              className="absolute right-2 top-2 text-[#2f4f38] cursor-pointer hover:text-[#25601d]"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              role="button"
              aria-label="Alternar visualização da confirmação de senha"
              tabIndex={0}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>
          {errors.confirmarSenha && (
            <p className="text-red-600 text-sm mt-1">
              {errors.confirmarSenha.message}
            </p>
          )}
        </div>

        {pageError && <p className="text-red-600 text-sm text-center">{pageError}</p>}

        {pageSuccess && (
          <p className="text-[#25601d] text-sm text-center font-semibold">
            {pageSuccess}
          </p>
        )}

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
            disabled={loading || !canSubmit}
          >
            {loading ? "Atualizando..." : "Atualizar senha"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="w-full bg-white/70 hover:bg-white text-[#0b2b14] border border-[#cfe8d8]"
            disabled={loading}
            onClick={async () => {
              await logout({ redirectTo: "/login", reload: false });
            }}
          >
            Sair
          </Button>
        </div>

        <div className="text-xs text-center text-[#2f4f38]/70 leading-relaxed">
          Dica: use uma senha forte com letras maiúsculas, minúsculas, números e
          símbolos.
        </div>
      </form>
    </div>
  );
}