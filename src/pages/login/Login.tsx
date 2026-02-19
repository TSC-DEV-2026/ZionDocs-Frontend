"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import api from "@/utils/axiosInstance";
import { useUser } from "@/contexts/UserContext";

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function isValidCPF(raw: string) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factor - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);

  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v ?? "").trim().toLowerCase());
}

const schema = z.object({
  usuario: z
    .string()
    .min(1, "Informe seu Usuário")
    .transform((v) => v.trim())
    .refine((v) => isEmail(v) || isValidCPF(v), {
      message: "Informe um CPF válido ou um e-mail válido",
    }),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

type FormData = z.infer<typeof schema>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getStatus(err: any): number | undefined {
  return err?.response?.status;
}

function is5xx(status?: number) {
  return typeof status === "number" && status >= 500 && status <= 599;
}

// mesma chave usada no UserContext
const INTERNAL_TOKEN_PROMPTED_SESSION_KEY = "auth:internal_token_prompted";

function writeSessionBool(key: string, v: boolean) {
  try {
    sessionStorage.setItem(key, v ? "true" : "false");
  } catch {
    // ignore
  }
}

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const navigate = useNavigate();
  const { refreshUser, setLoginPassword, beginLogin, endLogin } = useUser();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("postPasswordChange");
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        usuario?: string;
        cpf?: string;
        email?: string;
        message?: string;
      };

      const msg = (parsed?.message ?? "").trim();
      const u = (parsed?.usuario ?? parsed?.email ?? parsed?.cpf ?? "").trim();

      if (msg) setLoginSuccess(msg);
      if (u) setValue("usuario", u);

      sessionStorage.removeItem("postPasswordChange");
    } catch {
      // ignore
    }
  }, [setValue]);

  const loginWithRetryOn5xx = async (data: FormData) => {
    try {
      await api.post("/user/login", data, { withCredentials: true });
      console.log("login bem-sucedido");
      return;
    } catch (err1: any) {
      const status1 = getStatus(err1);

      if (err1?.message === "Network Error") throw err1;

      if (!is5xx(status1)) throw err1;

      await sleep(500);

      await api.post("/user/login", data, { withCredentials: true });
    }
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setLoginError("");
    beginLogin();

    try {
      setLoginPassword(data.senha);

      await loginWithRetryOn5xx(data);

      const u = await refreshUser();

      if (u?.senha_trocada !== true) {
        navigate("/trocar-senha", { replace: true });
        return;
      }

      if (u?.interno === true) {
        // ✅ garante que já foi direcionado para /token nesta sessão
        writeSessionBool(INTERNAL_TOKEN_PROMPTED_SESSION_KEY, true);

        navigate("/token", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (err: any) {
      if (err?.message === "Network Error") {
        setLoginError(
          "Não foi possível conectar ao servidor. Verifique sua conexão.",
        );
      } else {
        setLoginError(err?.response?.data?.detail || "Erro ao realizar login");
      }
    } finally {
      endLogin();
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden flex items-center justify-center p-4 bg-[#0f172a] bg-gradient-to-br from-indigo-500 via-purple-600 to-green-300">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#1F52FF] via-[#7048e8] to-[#C263FF] opacity-30 blur-3xl -z-10" />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-[#1e1e2f] text-white rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.6)] p-8 w-full max-w-sm space-y-6 border border-gray-700"
      >
        <h2 className="text-2xl font-bold text-center text-white">
          Acesso ao Sistema
        </h2>

        {loginSuccess && (
          <div className="text-sm text-green-200 bg-green-900/20 border border-green-700 rounded-lg p-3">
            {loginSuccess}
          </div>
        )}

        <div>
          <Label className="text-gray-200">Usuário</Label>
          <Input
            id="usuario"
            type="text"
            {...register("usuario")}
            className="mt-1 bg-[#2a2a3d] text-white"
            autoComplete="username"
          />
          {errors.usuario && (
            <p className="text-red-400 text-sm mt-1">
              {errors.usuario.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="senha" className="text-gray-200">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="senha"
              type={showPassword ? "text" : "password"}
              {...register("senha")}
              className="mt-1 pr-10 bg-[#2a2a3d] text-white"
              autoComplete="current-password"
            />
            <div
              className="absolute right-2 top-2 text-white cursor-pointer hover:text-blue-400"
              onClick={() => setShowPassword((prev) => !prev)}
              role="button"
              aria-label="Alternar visualização da senha"
              tabIndex={0}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>
          {errors.senha && (
            <p className="text-red-400 text-sm mt-1">{errors.senha.message}</p>
          )}
        </div>

        {loginError && (
          <p className="text-red-400 text-sm text-center">{loginError}</p>
        )}

        <Button
          type="submit"
          className="w-full py-2 text-white font-semibold rounded-lg"
          style={{ background: "linear-gradient(to right, #1F52FF, #C263FF)" }}
          disabled={loading}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
