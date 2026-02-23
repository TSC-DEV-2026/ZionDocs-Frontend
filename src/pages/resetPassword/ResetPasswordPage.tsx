import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import api from "@/utils/axiosInstance";
import { toast } from "sonner";

const schema = z
  .object({
    newPassword: z.string().min(6, "Senha muito curta"),
    confirmPassword: z.string().min(6, "Confirme a senha"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get("token");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!token) toast.error("Token inválido ou expirado.");
  }, [token]);

  const onSubmit = async (data: FormData) => {
    if (!token) return;

    try {
      setSubmitting(true);
      await api.post("/auth/reset-password", {
        token,
        nova_senha: data.newPassword,
      });

      toast.success("Senha alterada com sucesso!");
      navigate("/login");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Erro ao redefinir a senha.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen relative isolate overflow-hidden flex items-center justify-center p-4">
      {/* FUNDO padrão do site (igual Login) */}
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
            Redefinir Senha
          </h2>
          <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-[#25601d] to-[#2fa146]" />
          <p className="text-sm text-center text-[#2f4f38]/70">
            Digite sua nova senha para continuar
          </p>
        </div>

        {!token ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            Token inválido. Solicite novamente.
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="newPassword" className="text-[#0b2b14]">
                Nova Senha
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  {...register("newPassword")}
                  className={[
                    "mt-1 pr-10",
                    "bg-white",
                    "border-[#cfe8d8] focus-visible:ring-0",
                    "focus:border-[#2fa146]",
                    "text-[#0b2b14] placeholder:text-[#2f4f38]/60",
                  ].join(" ")}
                  autoComplete="new-password"
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
              {errors.newPassword && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-[#0b2b14]">
                Confirmar Senha
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  {...register("confirmPassword")}
                  className={[
                    "mt-1 pr-10",
                    "bg-white",
                    "border-[#cfe8d8] focus-visible:ring-0",
                    "focus:border-[#2fa146]",
                    "text-[#0b2b14] placeholder:text-[#2f4f38]/60",
                  ].join(" ")}
                  autoComplete="new-password"
                />
                <div
                  className="absolute right-2 top-2 text-[#2f4f38] cursor-pointer hover:text-[#25601d]"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  role="button"
                  aria-label="Alternar visualização da confirmação de senha"
                  tabIndex={0}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </div>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className={[
                "w-full py-2 font-semibold rounded-lg",
                "text-white",
                "bg-gradient-to-r from-[#25601d] to-[#2fa146]",
                "hover:opacity-95",
                "shadow-[0_10px_24px_rgba(47,161,70,0.22)]",
              ].join(" ")}
              disabled={submitting}
            >
              {submitting ? "Redefinindo..." : "Redefinir Senha"}
            </Button>
          </>
        )}

        <p className="text-sm text-center mt-2 text-[#2f4f38]/70">
          <Link to="/login" className="text-[#25601d] hover:underline font-semibold">
            Voltar para o login
          </Link>
        </p>
      </form>
    </div>
  );
}