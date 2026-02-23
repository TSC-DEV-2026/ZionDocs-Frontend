// src/pages/PreviewDocumento.tsx
"use client";

/**
 * Preview unificado para Holerite, Benefícios e Genérico.
 * - Benefícios usa o mesmo layout do Holerite.
 * - O PDF de Benefícios vem de /documents/beneficios/montar (pdf_base64).
 * - Aceite/baixar: se houver pdf_base64, mantém os mesmos botões/fluxos.
 * - Normalização "cabeçalho" -> cabecalho via helper getCabecalho.
 * - [Ajuste]: quando NÃO houver cabecalho em Benefícios, preenche os mesmos
 *   campos da UI com os dados "soltos" do montar e (se preciso) com /beneficios/buscar.
 * - [NOVO]: se Benefícios vier SEM pdf_base64, tenta buscar automaticamente via /beneficios/montar.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import api from "@/utils/axiosInstance";
import { toast } from "sonner";
import { FaCheckCircle } from "react-icons/fa";

// Tipos para Holerite
interface Cabecalho {
  empresa: string | number;
  filial: string | number;
  empresa_nome?: string;
  empresa_cnpj?: string;
  cliente: string | number;
  cliente_nome?: string;
  cliente_cnpj?: string;
  matricula: string | number;
  nome?: string;
  funcao_nome?: string;
  admissao?: string;
  competencia: string; // "YYYY", "YYYYMM" ou "YYYY-MM"
  lote?: number | string;
  uuid?: string;
}

interface Evento {
  evento: number;
  evento_nome: string;
  referencia: number;
  valor: number;
  tipo: "V" | "D";
}

interface Rodape {
  total_vencimentos: number;
  total_descontos: number;
  valor_liquido: number;
  salario_base: number;
  sal_contr_inss: number;
  base_calc_fgts: number;
  fgts_mes: number;
  base_calc_irrf: number;
  dep_sf: number;
  dep_irf: number;
}

// Tipos para documentos genéricos
interface DocumentoGenerico {
  id_documento: string;
  id_ged?: string;
  situacao: string;
  nomearquivo: string;
  versao1: string;
  versao2: string;
  tamanho: string;
  datacriacao: string;
  cliente: string;
  colaborador: string;
  regional: string;
  cr: string;
  anomes: string; // "YYYY-MM" ou "YYYYMM"
  tipodedoc: string; // nome do documento
  status: string;
  observacao: string;
  datadepagamento: string;
  matricula: string;
  _norm_anomes: string; // label
  aceito?: boolean;
}

type BeneficioUi = {
  codigo: number;
  descricao: string;
  tipo_beneficio: string;
  unitario: number;
  dia: number;
  mes: number;
  total: number;
};

function coerceNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapBeneficiosToUi(list: any[]): BeneficioUi[] {
  if (!Array.isArray(list)) return [];
  return list.map((b: any) => {
    return {
      codigo: Number(b?.codigo_beneficio ?? b?.codigo ?? b?.cod ?? 0),
      descricao: String(
        b?.descricao_beneficio ?? b?.descricao ?? b?.descricaoBeneficio ?? "",
      ),
      tipo_beneficio: String(
        b?.tipo_beneficio ?? b?.tipo ?? b?.tipoBeneficio ?? "",
      ),
      unitario: coerceNumber(
        b?.unitario ?? b?.valor_unitario ?? b?.vl_unit ?? 0,
      ),
      dia: coerceNumber(b?.dia ?? 0),
      mes: coerceNumber(b?.mes ?? 0),
      total: coerceNumber(b?.total ?? b?.valor_total ?? b?.vl_total ?? 0),
    };
  });
}

// Utils
function padLeft(value: string | number, width: number): string {
  return String(value).trim().padStart(width, "0");
}

function fmtNum(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncate(text: string | undefined | null, maxLen: number): string {
  const safeText = text ?? "";
  return safeText.length <= maxLen
    ? safeText
    : safeText.slice(0, maxLen - 3) + "...";
}

function fmtRef(value: number): string {
  return value === 0
    ? ""
    : Number(value || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

// Normaliza para "YYYYMM"
function normalizeCompetencia(v: string | number | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{6}$/.test(s)) return s; // "YYYYMM"
  if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", ""); // "YYYY-MM" -> "YYYYMM"
  if (/^\d{2}\/\d{4}$/.test(s)) {
    // "MM/YYYY"
    const [mm, yyyy] = s.split("/");
    return `${yyyy}${mm.padStart(2, "0")}`;
  }
  return s.replace(/\D/g, "");
}

function cleanBase64Pdf(b64: string): string {
  return String(b64 || "").replace(/^data:application\/pdf;base64,/, "");
}

const asStr = (v: unknown) =>
  v === null || v === undefined ? undefined : String(v);

// Normaliza cabecalho (aceita "cabeçalho" e "cabecalho")
function getCabecalho(obj: any): any {
  if (!obj) return undefined;
  if (obj.cabecalho) return obj.cabecalho;
  if (obj["cabeçalho"]) return obj["cabeçalho"];
  return undefined;
}

// Decode base64 com segurança
function safeAtobToBytes(b64: string): Uint8Array {
  const clean = cleanBase64Pdf(b64).replace(/\s+/g, "");
  const bin = atob(clean);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const isDefined = (v: any) => typeof v !== "undefined" && v !== null;

/** === AJUSTE UUID (helper) ======================== */
function extractUuidFromAny(input: any): string | undefined {
  if (!input) return undefined;
  const looksLikeUuid = (val: any) =>
    typeof val === "string" && /^[0-9a-fA-F-]{16,}$/.test(val);
  const tryObj = (obj: any): string | undefined => {
    if (!obj) return undefined;
    if (looksLikeUuid(obj.uuid)) return obj.uuid;
    if (looksLikeUuid(obj.UUID)) return obj.UUID;
    if (looksLikeUuid(obj.id_uuid)) return obj.id_uuid;
    if (looksLikeUuid(obj.uuid_beneficio)) return obj.uuid_beneficio;
    const cab = getCabecalho(obj) || obj.cabecalho || obj["cabeçalho"];
    if (looksLikeUuid(cab?.uuid)) return cab.uuid;
    const maybeArrays = ["items", "data", "beneficios", "eventos", "results"];
    for (const key of maybeArrays) {
      const arr = obj?.[key];
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const got = tryObj(it);
          if (got) return got;
        }
      }
    }
    return undefined;
  };
  if (Array.isArray(input)) {
    for (const it of input) {
      const got = tryObj(it);
      if (got) return got;
    }
  }
  return tryObj(input);
}
/** ================================================= */

const isInformeRend = (tipodedocRaw: unknown) => {
  const s = String(tipodedocRaw || "").toLowerCase();
  return s.includes("informe") && s.includes("rend");
};

type PreviewState =
  | {
      pdf_base64: string;
      tipo: "holerite";
      cabecalho: Cabecalho;
      eventos: Evento[];
      rodape: Rodape;
      competencia_forced?: string; // YYYYMM
      aceito?: boolean;
      uuid?: string;
    }
  | {
      pdf_base64: string;
      tipo: "generico";
      documento_info: DocumentoGenerico;
    }
  | {
      // Benefícios
      tipo: "beneficios";
      pdf_base64?: string; // opcional: se o back mandar
      cabecalho?: any;
      ["cabeçalho"]?: any;
      beneficios?: Array<any>;
      competencia_forced?: string; // YYYYMM
      // alguns backends enviam estes campos "soltos" no montar
      cpf?: string;
      matricula?: number | string;
      competencia?: string;
      empresa?: number;
      filial?: number;
      cliente?: number;
      lote?: number | string;
      eventos?: any[];
    };

export default function PreviewDocumento() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useUser();
  const state = (location.state as PreviewState | null) || null;

  const [isDownloading, setIsDownloading] = useState(false);

  // Base64 efetivo (permite "auto-montar" benefícios quando vier sem pdf_base64)
  const [pdfOverride, setPdfOverride] = useState<string | null>(null);
  const effectivePdfBase64 = useMemo(() => {
    return (
      pdfOverride ??
      ((state as any)?.pdf_base64 as string | undefined) ??
      ""
    );
  }, [pdfOverride, state]);

  useEffect(() => {
    if (!state) return;
    if (state?.tipo === "generico" && (state as any)?.documento_info) {
      document.title = `${(state as any).documento_info.tipodedoc} - ${
        (state as any).documento_info._norm_anomes
      }`;
    } else if (state?.tipo === "beneficios") {
      document.title = "Demonstrativo de Benefícios";
    } else {
      document.title = "Recibo de Pagamento de Salário";
    }
  }, [state]);

  // ===== Aceite (consulta assíncrona por UUID ou id_ged) =====
  const [aceiteLoading, setAceiteLoading] = useState(false);
  const [aceiteFlag, setAceiteFlag] = useState<boolean | null>(null);

  // fonte "legada" (fallback)
  const legacyAceito = useMemo(() => {
    if (!state) return false;
    if ((state as any).tipo === "generico")
      return !!(state as any).documento_info?.aceito;
    if (typeof (state as any).aceito !== "undefined")
      return !!(state as any).aceito;
    try {
      const raw = sessionStorage.getItem("holeriteData");
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j?.aceito;
    } catch {
      return false;
    }
  }, [state]);

  // prioridade: resultado da consulta > legacyAceito
  const isAceito =
    aceiteFlag === true ? true : aceiteFlag === false ? false : legacyAceito;

  // ===== [NOVO] Dados extras de Benefícios quando NÃO há cabecalho =====
  const [benefExtraCab, setBenefExtraCab] = useState<any>(null);

  /** === cache local do uuid de benefícios === */
  const [benefUuid, setBenefUuid] = useState<string | undefined>(undefined);

  // Inicializa benefUuid a partir do state
  useEffect(() => {
    if (!state || (state as any).tipo !== "beneficios") return;
    const cab = getCabecalho(state);
    const u = cab?.uuid || extractUuidFromAny(state);
    if (u) setBenefUuid(u);
  }, [state]);

  // Chama /beneficios/buscar APENAS quando NÃO existe cabecalho no montar
  useEffect(() => {
    if (!state || (state as any).tipo !== "beneficios") return;
    const cabBase = getCabecalho(state);
    const hasCab = !!cabBase;
    if (hasCab) return;

    const payload = {
      cpf: (state as any)?.cpf,
      matricula: (state as any)?.matricula,
      competencia: normalizeCompetencia(
        (state as any)?.competencia_forced ?? (state as any)?.competencia,
      ),
    };
    if (!payload.cpf || !payload.matricula || !payload.competencia) return;

    (async () => {
      try {
        const res = await api.post("/documents/beneficios/buscar", payload);
        const data = res?.data;
        const candidate =
          getCabecalho(data) ??
          getCabecalho((data && data[0]) || {}) ??
          (Array.isArray(data?.items)
            ? getCabecalho(data.items[0])
            : undefined) ??
          data?.cabecalho ??
          (Array.isArray(data) ? data[0]?.cabecalho : undefined);
        if (candidate) setBenefExtraCab(candidate);
        const u = extractUuidFromAny(data) || candidate?.uuid;
        if (u) setBenefUuid(u);
      } catch (e) {
        console.warn("fallback beneficios/buscar falhou:", e);
      }
    })();
  }, [state]);

  // ===== [NOVO] Se Benefícios vier sem pdf_base64, tenta "montar" automaticamente =====
  useEffect(() => {
    if (!state || (state as any).tipo !== "beneficios") return;
    const hasPdfAlready = !!(state as any)?.pdf_base64 || !!pdfOverride;
    if (hasPdfAlready) return;

    const cpfDigits =
      String((user as any)?.cpf ?? "").replace(/\D/g, "") ||
      String((state as any)?.cpf ?? "").replace(/\D/g, "");
    const matricula = String(
      (state as any)?.matricula ??
        (state as any)?.beneficios?.[0]?.matricula ??
        "",
    ).trim();
    const competencia = normalizeCompetencia(
      (state as any)?.competencia_forced ??
        (state as any)?.competencia ??
        (state as any)?.beneficios?.[0]?.competencia,
    );

    if (!cpfDigits || cpfDigits.length !== 11 || !matricula || !competencia)
      return;

    (async () => {
      try {
        const res = await api.post("/documents/beneficios/montar", {
          cpf: cpfDigits,
          matricula,
          competencia,
        });
        const b64 =
          res?.data?.pdf_base64 || res?.data?.base64 || res?.data?.pdf;
        if (b64) setPdfOverride(String(b64));
        const u =
          extractUuidFromAny(res?.data) || getCabecalho(res?.data)?.uuid;
        if (u) setBenefUuid(u);
      } catch (e) {
        console.warn("auto-montar beneficios falhou:", e);
      }
    })();
  }, [state, user, pdfOverride]);

  // ===== Consulta /status-doc/consultar =====
  useEffect(() => {
    if (!state) return;
    let canceled = false;

    const run = async () => {
      try {
        setAceiteLoading(true);

        if (state.tipo === "holerite" || state.tipo === "beneficios") {
          let uuid: string | undefined;

          if (state.tipo === "holerite") {
            uuid = (state as any).uuid || (state as any).cabecalho?.uuid;
            if (!uuid) {
              try {
                const raw = sessionStorage.getItem("holeriteData");
                if (raw) {
                  const j = JSON.parse(raw);
                  uuid = j?.uuid || getCabecalho(j)?.uuid;
                }
              } catch {}
            }
          } else {
            const cabBase = getCabecalho(state);
            const hasCab = !!cabBase;
            const cab = hasCab ? cabBase : benefExtraCab;
            uuid = cab?.uuid || benefUuid;
          }

          if (!uuid) {
            setAceiteFlag(null);
            return;
          }

          const res = await api.post<{ id: number; aceito: boolean }>(
            "/status-doc/consultar",
            { uuid: String(uuid) },
          );
          if (canceled) return;
          setAceiteFlag(!!res.data?.aceito);
          return;
        }

        // genérico
        const idGed =
          asStr((state as any)?.documento_info?.id_documento) ??
          asStr((state as any)?.documento_info?.id_ged);
        if (!idGed) {
          setAceiteFlag(null);
          return;
        }

        const res = await api.post<{ id: number; aceito: boolean }>(
          "/status-doc/consultar",
          { id_ged: String(idGed) },
        );
        if (canceled) return;
        setAceiteFlag(!!res.data?.aceito);
      } catch {
        if (canceled) return;
        setAceiteFlag(null);
      } finally {
        if (!canceled) setAceiteLoading(false);
      }
    };

    run();
    return () => {
      canceled = true;
    };
  }, [state, benefExtraCab, benefUuid]);

  const renderAceitoBadge = () => {
  if (aceiteLoading) {
    return (
      <span className="flex items-center gap-1 text-xs text-[#0b3a24]/70 dark:text-white/70">
        <Loader2 className="w-3 h-3 animate-spin" />
        Verificando…
      </span>
    );
  }

  if (isAceito) {
    return (
      <div className="flex items-center gap-1 pr-3 text-lg font-semibold text-[#25601d] dark:text-emerald-200">
        <FaCheckCircle className="w-6 h-6 text-[#2fa146] dark:text-emerald-300" />
        Aceito
      </div>
    );
  }

  return null;
};

  const handleDownload = async () => {
    if (!effectivePdfBase64) {
      toast.error("PDF não disponível.");
      return;
    }
    try {
      setIsDownloading(true);
      const bytes = safeAtobToBytes(effectivePdfBase64);
      const ab = (bytes.buffer as ArrayBuffer).slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      if ((state as any).tipo === "generico" && (state as any).documento_info) {
        const nome =
          (state as any).documento_info.nomearquivo ||
          (state as any).documento_info.tipodedoc ||
          "documento";
        link.download = `${nome}.pdf`;
      } else if (
        (state as any).tipo === "holerite" &&
        (state as any).cabecalho
      ) {
        const comp =
          normalizeCompetencia((state as any).competencia_forced) ||
          normalizeCompetencia((state as any).cabecalho.competencia);
        link.download = `holerite_${(state as any).cabecalho.matricula}_${
          comp || "YYYYMM"
        }.pdf`;
      } else if ((state as any).tipo === "beneficios") {
        const cabBase = getCabecalho(state);
        const hasCab = !!cabBase;
        const first = (state as any)?.beneficios?.[0];
        const baseFromState = {
          empresa:
            first?.empresa ??
            (state as any)?.empresa ??
            (state as any)?.eventos?.[0]?.empresa,
          filial:
            first?.filial ??
            (state as any)?.filial ??
            (state as any)?.eventos?.[0]?.filial,
          cliente:
            first?.cliente ??
            (state as any)?.cliente ??
            (state as any)?.eventos?.[0]?.cliente,
          matricula:
            first?.matricula ??
            (state as any)?.matricula ??
            (state as any)?.eventos?.[0]?.matricula,
          cpf:
            first?.cpf ??
            (state as any)?.cpf ??
            (state as any)?.eventos?.[0]?.cpf,
          competencia:
            first?.competencia ??
            (state as any)?.competencia ??
            (state as any)?.eventos?.[0]?.competencia,
          lote:
            first?.lote ??
            (state as any)?.lote ??
            (state as any)?.eventos?.[0]?.lote,
        };
        const cabResolved: any = hasCab
          ? cabBase
          : { ...(benefExtraCab || {}), ...baseFromState };
        const comp =
          normalizeCompetencia((state as any).competencia_forced) ||
          normalizeCompetencia(cabResolved?.competencia) ||
          normalizeCompetencia((state as any)?.competencia);
        const mat = (cabResolved?.matricula ?? "mat").toString();
        link.download = `beneficios_${mat}_${comp || "YYYYMM"}.pdf`;
      } else {
        link.download = "documento.pdf";
      }

      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsDownloading(false);
      }, 300);
    } catch (e) {
      console.error("Erro ao baixar PDF:", e);
      toast.error("Erro ao baixar o PDF.");
      setIsDownloading(false);
    }
  };
  const PAGE_BG = (
  <>
    {/* base */}
    <div className="fixed inset-0 z-0 bg-[#d9efe2] dark:bg-[#07150d]" />

    {/* glow topo */}
    <div
      className="fixed inset-0 z-0
      bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.18),rgba(217,239,226,0))]
      dark:bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.22),rgba(7,21,13,0))]"
    />

    {/* glow lateral */}
    <div
      className="fixed inset-0 z-0
      bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.14),rgba(217,239,226,0))]
      dark:bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.20),rgba(7,21,13,0))]"
    />
  </>
);

  // confirma no backend (uuid ou id_ged) e depois baixa
  const handleAcceptAndDownload = async () => {
    if (!effectivePdfBase64) {
      toast.error("PDF não disponível para confirmar.");
      return;
    }

    const tipo_doc =
      (state as any)?.tipo === "holerite"
        ? "holerite"
        : (state as any)?.tipo === "beneficios"
          ? "beneficios"
          : (state as any)?.documento_info?.tipodedoc || "generico";

    let matricula = "";
    let competencia = "";
    let unidade = "";
    let uuid: string | undefined;
    let id_ged: string | undefined;

    // ===== HOLERITE =====
    if ((state as any)?.tipo === "holerite" && (state as any)?.cabecalho) {
      matricula = String((state as any).cabecalho.matricula ?? "");
      competencia =
        normalizeCompetencia((state as any).competencia_forced) ||
        normalizeCompetencia((state as any).cabecalho.competencia);
      unidade =
        (state as any).cabecalho.cliente_nome ||
        (state as any).cabecalho.cliente ||
        "";
      uuid = (state as any).uuid || (state as any).cabecalho?.uuid;
      if (!uuid) {
        try {
          const raw = sessionStorage.getItem("holeriteData");
          if (raw) {
            const j = JSON.parse(raw);
            uuid = j?.uuid || getCabecalho(j)?.uuid;
          }
        } catch {}
      }

      // ===== BENEFÍCIOS =====
    } else if ((state as any)?.tipo === "beneficios") {
      const cabBase = getCabecalho(state);
      const hasCab = !!cabBase;
      const baseFromState = {
        empresa:
          (state as any)?.empresa ??
          (state as any)?.beneficios?.[0]?.empresa ??
          (state as any)?.eventos?.[0]?.empresa,
        filial:
          (state as any)?.filial ??
          (state as any)?.beneficios?.[0]?.filial ??
          (state as any)?.eventos?.[0]?.filial,
        cliente:
          (state as any)?.cliente ??
          (state as any)?.beneficios?.[0]?.cliente ??
          (state as any)?.eventos?.[0]?.cliente,
        matricula:
          (state as any)?.matricula ??
          (state as any)?.beneficios?.[0]?.matricula ??
          (state as any)?.eventos?.[0]?.matricula,
        competencia:
          (state as any)?.competencia ??
          (state as any)?.beneficios?.[0]?.competencia ??
          (state as any)?.eventos?.[0]?.competencia,
      };
      const cabAll: any = hasCab
        ? cabBase
        : { ...(benefExtraCab || {}), ...baseFromState };
      matricula = String(cabAll?.matricula ?? "");
      competencia =
        normalizeCompetencia((state as any).competencia_forced) ||
        normalizeCompetencia(cabAll?.competencia) ||
        normalizeCompetencia((state as any)?.competencia);
      unidade = cabAll?.cliente_nome || cabAll?.cliente || "";
      uuid = cabAll?.uuid || benefUuid;

      const isDefinedLocal = (v: any) => typeof v !== "undefined" && v !== null;

      if (!uuid) {
        try {
          const cpfDigits =
            String((user as any)?.cpf ?? "").replace(/\D/g, "") ||
            String((state as any)?.cpf ?? "").replace(/\D/g, "");
          const buscarPayload: any = {
            cpf: cpfDigits,
            matricula: String(matricula),
            competencia: String(competencia),
          };
          if (isDefinedLocal(baseFromState.empresa))
            buscarPayload.empresa = baseFromState.empresa;
          if (isDefinedLocal(baseFromState.filial))
            buscarPayload.filial = baseFromState.filial;
          if (isDefinedLocal(baseFromState.cliente))
            buscarPayload.cliente = baseFromState.cliente;
          const res = await api.post(
            "/documents/beneficios/buscar",
            buscarPayload,
          );
          uuid =
            extractUuidFromAny(res?.data) ||
            getCabecalho(res?.data)?.uuid ||
            (Array.isArray(res?.data)
              ? getCabecalho(res.data[0])?.uuid
              : undefined);
          if (uuid) setBenefUuid(uuid);
        } catch {}
      }

      // ===== GENÉRICO (TRCT, INFORME, etc) =====
    } else if (
      (state as any)?.tipo === "generico" &&
      (state as any)?.documento_info
    ) {
      const info = (state as any).documento_info;
      const clean = (v: any) =>
        v === null || v === undefined ? "" : String(v).trim();
      const docMat = clean(info.matricula);
      const stateMat = clean((state as any)?.matricula);
      const userMat =
        clean((user as any)?.matricula) ||
        clean((user as any)?.registration_number) ||
        clean((user as any)?.registration);
      matricula = docMat || stateMat || userMat || "";

      const docCli = clean(info.cliente);
      const userCli = clean((user as any)?.cliente);
      unidade = docCli || userCli || "";

      const rawComp =
        info.anomes ??
        info._norm_anomes ??
        (state as any)?.competencia_forced ??
        info.ano ??
        info.ANO ??
        "";
      competencia = normalizeCompetencia(rawComp);

      id_ged =
        asStr(info.id_documento) ??
        asStr(info.id_ged) ??
        asStr((info as any).id) ??
        asStr((info as any).ID);

      console.log("[STATUS-DOC] GEN fill", {
        docMat,
        stateMat,
        userMat,
        finalMatricula: matricula,
        rawComp,
        competencia,
        id_ged,
      });
    }

    const cpfDigits = String((user as any)?.cpf ?? "")
      .replace(/\D/g, "")
      .trim();

    const isHolBenef =
      (state as any)?.tipo === "holerite" ||
      (state as any)?.tipo === "beneficios";

    if (!matricula && isHolBenef) {
      toast.error("Matrícula não encontrada para confirmar o documento.");
      await handleDownload();
      return;
    }

    if (!competencia || (isHolBenef && !/^\d{6}$/.test(competencia))) {
      toast.error(
        isHolBenef
          ? "Competência inválida para confirmar o documento."
          : "Período do documento não localizado para confirmar.",
      );
      await handleDownload();
      return;
    }

    if (!cpfDigits || cpfDigits.length !== 11) {
      toast.error("CPF do usuário indisponível ou inválido.");
      await handleDownload();
      return;
    }

    const payload: any = {
      aceito: true,
      tipo_doc,
      base64: cleanBase64Pdf(effectivePdfBase64),
      cpf: String(cpfDigits),
      matricula: String(matricula || ""),
    };

    if (unidade) payload.unidade = String(unidade);
    if (competencia) payload.competencia = String(competencia);
    if (isHolBenef && uuid) payload.uuid = String(uuid);
    if ((state as any)?.tipo === "generico" && id_ged)
      payload.id_ged = String(id_ged);

    if (
      (state as any)?.tipo === "generico" &&
      isInformeRend((state as any)?.documento_info?.tipodedoc)
    ) {
      console.log("[STATUS-DOC] GENERICO (Informe/Rend) payload", payload);
    }

    try {
      setIsDownloading(true);
      await api.post("/status-doc", payload);
      toast.success("Documento confirmado com sucesso.");
      setAceiteFlag(true);
      await handleDownload();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Não foi possível confirmar o documento agora.";
      toast.warning("Não confirmamos o aceite, mas vamos baixar o PDF.", {
        description: msg,
      });
      await handleDownload();
    } finally {
      setIsDownloading(false);
    }
  };

  

  if (userLoading) {
  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
      {PAGE_BG}
      <div className="relative z-10 flex items-center">
        <Loader2 className="animate-spin w-8 h-8 text-[#25601d]" />
        <span className="ml-2 text-[#0b2b14] dark:text-white/80">
          Carregando...
        </span>
      </div>
    </div>
  );
}

  // Guard: só bloqueia quando NÃO for benefícios e não houver PDF
  if (!state || (!effectivePdfBase64 && (state as any).tipo !== "beneficios")) {
    return (
  <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
    {PAGE_BG}

        <Header />
        <main className="flex-grow p-4 md:p-8 text-center pt-24">
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            <Button
              variant="default"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 bg-gradient-to-r from-[#25601d] to-[#2fa146] text-white hover:opacity-90"
            >
              <ArrowLeft /> Voltar
            </Button>
            {renderAceitoBadge()}
          </div>
          <p className="text-lg text-[#0b2b14]">
            Dados do documento não encontrados. Volte e tente novamente.
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  // ======== GENÉRICO ========
  // ======== GENÉRICO ========
if ((state as any).tipo === "generico" && (state as any).documento_info) {
  return (
    <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
    {PAGE_BG}

      <Header />

      <main className="relative z-10 flex-grow p-4 max-sm:p-2 max-sm:pt-24 pt-24">
        <div className="flex items-center justify-between mb-4 max-w-full mx-auto">
          <Button
            variant="default"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#25601d] to-[#2fa146] text-white hover:opacity-90 ml-4"
          >
            <ArrowLeft /> Voltar
          </Button>

          {renderAceitoBadge()}
        </div>

        <div
          className="relative overflow-hidden border border-[#d8efe0] rounded-2xl bg-white/85 backdrop-blur-md shadow-[0_22px_70px_rgba(0,0,0,0.12)] mx-auto"
          style={{ width: "100%", maxWidth: "1100px", height: "650px" }}
        >
          <iframe
            src={`data:application/pdf;base64,${cleanBase64Pdf(
              effectivePdfBase64,
            )}`}
            className="w-full h-full border-0"
            title="Visualizador de PDF"
          />
        </div>

        <div className="flex justify-center items-center pb-8 pt-4 gap-3">
          <Button
            onClick={() => (isAceito ? handleDownload() : handleAcceptAndDownload())}
            className="bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 text-white w-full sm:w-56 h-10 shadow-[0_10px_24px_rgba(47,161,70,0.22)]"
            disabled={isDownloading}
          >
            <Download className="mr-2 w-4 h-4" />
            {isDownloading
              ? "Confirmando..."
              : isAceito
                ? "Baixar documento"
                : "Aceitar e baixar documento"}
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
}

  // ======== BENEFÍCIOS — Layout idêntico ao Holerite ========
  if ((state as any).tipo === "beneficios") {
    const cabBase = getCabecalho(state);
    const hasCab = !!cabBase;
    const baseFromState = {
      empresa:
        (state as any)?.empresa ??
        (state as any)?.beneficios?.[0]?.empresa ??
        (state as any)?.eventos?.[0]?.empresa,
      filial:
        (state as any)?.filial ??
        (state as any)?.beneficios?.[0]?.filial ??
        (state as any)?.eventos?.[0]?.filial,
      cliente:
        (state as any)?.cliente ??
        (state as any)?.beneficios?.[0]?.cliente ??
        (state as any)?.eventos?.[0]?.cliente,
      matricula:
        (state as any)?.matricula ??
        (state as any)?.beneficios?.[0]?.matricula ??
        (state as any)?.eventos?.[0]?.matricula,
      cpf:
        (state as any)?.cpf ??
        (state as any)?.beneficios?.[0]?.cpf ??
        (state as any)?.eventos?.[0]?.cpf,
      competencia:
        (state as any)?.competencia ??
        (state as any)?.beneficios?.[0]?.competencia ??
        (state as any)?.eventos?.[0]?.competencia,
      lote:
        (state as any)?.lote ??
        (state as any)?.beneficios?.[0]?.lote ??
        (state as any)?.eventos?.[0]?.lote,
    };
    const cab: any = hasCab
      ? cabBase
      : { ...(benefExtraCab || {}), ...baseFromState };
    const rawList = (state as any).beneficios ?? [];
    const lista = useMemo(() => mapBeneficiosToUi(rawList), [rawList]);
    const totalGeral = lista.reduce((s, b) => s + coerceNumber(b.total), 0);

    return (
      <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
    {PAGE_BG}

        <Header />
        <main className="relative z-10 flex-grow max-sm:pt-24 pt-24">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="default"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 bg-gradient-to-r from-[#25601d] to-[#2fa146] text-white hover:opacity-90 ml-4"
            >
              <ArrowLeft /> Voltar
            </Button>
            {renderAceitoBadge()}
          </div>

          <div className="bg-white/85 dark:bg-white/10 dark:text-white
                backdrop-blur-md border border-[#d8efe0] dark:border-white/15
                shadow-[0_22px_70px_rgba(0,0,0,0.12)] dark:shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex flex-col md:flex-row justify-between items-start">
              <div className="flex flex-col">
                <h1 className="text-lg md:text-xl font-bold text-[#0b2b14]">
                  Demonstrativo de Benefícios
                </h1>
                <div className="h-1 w-20 rounded-full bg-gradient-to-r from-[#25601d] to-[#2fa146] my-2" />
                <div className="text-sm md:text-base text-[#0b2b14]">
                  <strong>Empresa:</strong>{" "}
                  {isDefined(cab?.empresa)
                    ? `${padLeft(cab.empresa, 3)} - ${
                        isDefined(cab?.filial) ? cab.filial : ""
                      } `
                    : ""}
                  {cab?.empresa_nome ?? ""}
                  {cab?.empresa_cnpj && (
                    <div className="block md:hidden text-xs pr-4 whitespace-nowrap overflow-x-auto">
                      <strong>Nº Inscrição:</strong> {cab.empresa_cnpj}
                    </div>
                  )}
                </div>
                <div className="text-sm md:text-base mt-2 text-[#0b2b14]">
                  <strong>Cliente:</strong>{" "}
                  {(isDefined(cab?.cliente) ? String(cab.cliente) : "") +
                    (cab?.cliente_nome ? ` ${cab.cliente_nome}` : "")}
                  {cab?.cliente_cnpj && (
                    <div className="block md:hidden text-xs whitespace-nowrap overflow-x-auto">
                      <strong>Nº Inscrição:</strong> {cab.cliente_cnpj}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs md:text-sm text-left md:text-right md:pt-7 whitespace-nowrap text-[#0b2b14]">
                {cab?.empresa_cnpj && (
                  <div className="hidden md:block">
                    <strong>Nº Inscrição:</strong> {cab.empresa_cnpj}
                  </div>
                )}
                {cab?.cliente_cnpj && (
                  <div className="hidden md:block">
                    <strong>Nº Inscrição:</strong> {cab.cliente_cnpj}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 text-xs md:text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 md:gap-4 text-[#0b2b14]">
              <div className="flex flex-col">
                <strong className="pb-1 md:pb-2 text-[#25601d]">Código</strong>{" "}
                {isDefined(cab?.matricula) ? padLeft(cab.matricula, 6) : "-"}
              </div>
              {cab?.nome && (
                <div className="flex flex-col">
                  <strong className="pb-1 md:pb-2 text-[#25601d]">
                    Nome do Funcionário
                  </strong>{" "}
                  {truncate(cab.nome, 30)}
                </div>
              )}
              {cab?.funcao_nome && (
                <div className="flex flex-col">
                  <strong className="pb-1 md:pb-2 text-[#25601d]">Função</strong>{" "}
                  {cab.funcao_nome}
                </div>
              )}
              {cab?.admissao && (
                <div className="flex flex-col">
                  <strong className="pb-1 md:pb-2 text-[#25601d]">
                    Admissão
                  </strong>{" "}
                  {cab.admissao}
                </div>
              )}
              <div className="flex flex-col">
                <strong className="pb-1 md:pb-2 text-[#25601d]">
                  Competência
                </strong>{" "}
                {normalizeCompetencia(
                  (state as any).competencia_forced ??
                    cab?.competencia ??
                    (state as any)?.competencia,
                ).replace(/(\d{4})(\d{2})/, "$1-$2")}
              </div>
            </div>

            <div className="bg-[#bfead0] w-full h-[1px] my-2"></div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-[#e9f8ef]">
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      Cód.
                    </th>
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      <span className="sm:hidden">Descr</span>
                      <span className="hidden sm:inline">
                        Descrição do Benefício
                      </span>
                    </th>
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      <span className="sm:hidden">Tipo</span>
                      <span className="hidden sm:inline">
                        Tipo de Benefício
                      </span>
                    </th>
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      Unitário
                    </th>
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      Dia
                    </th>
                    <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      Mês
                    </th>
                    <th className="p-1 md:p-2 text-center text-[#0b2b14]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((b: BeneficioUi, idx: number) => (
                    <tr
                      key={idx}
                      className={idx % 2 ? "bg-[#f4fbf6]" : "bg-white"}
                    >
                      <td className="p-1 md:p-2 border-r border-[#bfead0] text-[#0b2b14]">
                        {b.codigo}
                      </td>
                      <td className="p-1 md:p-2 border-r border-[#bfead0] text-[#0b2b14]">
                        <span className="sm:hidden">
                          {truncate(b.descricao, 22)}
                        </span>
                        <span className="hidden sm:inline">
                          {truncate(b.descricao, 45)}
                        </span>
                      </td>
                      <td className="p-1 md:p-2 border-r border-[#bfead0] text-[#0b2b14]">
                        <span className="sm:hidden">
                          {truncate(b.tipo_beneficio, 14)}
                        </span>
                        <span className="hidden sm:inline">
                          {truncate(b.tipo_beneficio, 28)}
                        </span>
                      </td>
                      <td className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                        {fmtNum(b.unitario)}
                      </td>
                      <td className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                        {b.dia || ""}
                      </td>
                      <td className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                        {b.mes || ""}
                      </td>
                      <td className="p-1 md:p-2 text-center text-[#0b2b14]">
                        {fmtNum(b.total)}
                      </td>
                    </tr>
                  ))}
                  {(!lista || lista.length === 0) && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center p-3 text-[#2f4f38]/60"
                      >
                        Sem lançamentos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-[#bfead0] w-full h-[1px] my-2"></div>

            <div className="my-4 md:my-6 flex justify-end text-xs md:text-sm">
              <div className="flex flex-col text-right text-[#0b2b14]">
                <strong className="text-[#25601d]">Total Geral:</strong>{" "}
                {fmtNum(totalGeral)}
              </div>
            </div>
          </div>
        </main>

        {!!effectivePdfBase64 && (
          <div className="relative z-10 flex justify-center items-center p-8 md:p-16">
            <Button
              onClick={isAceito ? handleDownload : handleAcceptAndDownload}
              className="bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 text-white h-10 shadow-[0_10px_24px_rgba(47,161,70,0.22)]"
              disabled={isDownloading}
            >
              <Download className="mr-2 w-4 h-4" />
              {isDownloading
                ? "Confirmando..."
                : isAceito
                  ? "Baixar demonstrativo"
                  : "Aceitar e baixar Benefícios"}
            </Button>
          </div>
        )}
        <Footer />
      </div>
    );
  }

  // ======== HOLERITE ========
  if (
    (state as any).tipo === "holerite" &&
    (!(state as any).cabecalho ||
      !(state as any).eventos ||
      !(state as any).rodape)
  ) {
    return (
      <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
    {PAGE_BG}
        <Header />
        <main className="flex-grow p-4 md:p-8 text-center pt-24">
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            <Button
              variant="default"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 bg-gradient-to-r from-[#25601d] to-[#2fa146] text-white hover:opacity-90"
            >
              <ArrowLeft /> Voltar
            </Button>
            {renderAceitoBadge()}
          </div>
          <p className="text-lg text-[#0b2b14]">
            Dados do holerite não encontrados. Volte e tente novamente.
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  if ((state as any).tipo !== "holerite") return null;

  const { cabecalho, eventos, rodape } = state as any;

  return (
    <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#d9efe2] dark:bg-[#07150d]">
    {PAGE_BG}

      <Header />
      <main className="relative z-10 flex-grow max-sm:pt-24 pt-[80px]">
        <div className="flex items-center justify-start">
          <Button
            variant="default"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#25601d] to-[#2fa146] text-white hover:opacity-90 m-4"
          >
            <ArrowLeft /> Voltar
          </Button>
          {renderAceitoBadge()}
        </div>

        <div className="bg-white/85 backdrop-blur-md shadow-[0_22px_70px_rgba(0,0,0,0.12)] border border-[#d8efe0] p-4 md:p-6 ">
          <div className="mb-4 flex flex-col md:flex-row justify-between items-start">
            <div className="flex flex-col">
              <h1 className="text-lg md:text-xl font-bold text-[#0b2b14]">
                Recibo de Pagamento de Salário
              </h1>
              <div className="h-1 w-20 rounded-full bg-gradient-to-r from-[#25601d] to-[#2fa146] my-2" />
              <div className="text-sm md:text-base text-[#0b2b14]">
                <strong>Empresa:</strong> {padLeft(cabecalho.empresa, 3)} -{" "}
                {cabecalho.filial} {cabecalho.empresa_nome}
                <div className="block md:hidden text-xs pr-4 whitespace-nowrap overflow-x-auto">
                  <strong>Nº Inscrição:</strong> {cabecalho.empresa_cnpj}
                </div>
              </div>
              <div className="text-sm md:text-base mt-2 text-[#0b2b14]">
                <strong>Cliente:</strong> {cabecalho.cliente}{" "}
                {cabecalho.cliente_nome}
                <div className="block md:hidden text-xs whitespace-nowrap overflow-x-auto">
                  <strong>Nº Inscrição:</strong> {cabecalho.cliente_cnpj}
                </div>
              </div>
            </div>

            <div className="text-xs md:text-sm text-left md:text-right md:pt-7 whitespace-nowrap text-[#0b2b14]">
              <div className="hidden md:block">
                <strong>Nº Inscrição:</strong> {cabecalho.empresa_cnpj}
              </div>
              <div className="hidden md:block">
                <strong>Nº Inscrição:</strong> {cabecalho.cliente_cnpj}
              </div>
            </div>
          </div>

          <div className="mb-4 text-xs md:text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 md:gap-4 text-[#0b2b14]">
            <div className="flex flex-col">
              <strong className="pb-1 md:pb-2 text-[#25601d]">Código</strong>{" "}
              {padLeft(cabecalho.matricula, 6)}
            </div>
            {cabecalho.nome && (
              <div className="flex flex-col">
                <strong className="pb-1 md:pb-2 text-[#25601d]">
                  Nome do Funcionário
                </strong>{" "}
                {truncate(cabecalho.nome, 30)}
              </div>
            )}
            {cabecalho.funcao_nome && (
              <div className="flex flex-col">
                <strong className="pb-1 md:pb-2 text-[#25601d]">Função</strong>{" "}
                {cabecalho.funcao_nome}
              </div>
            )}
            {cabecalho.admissao && (
              <div className="flex flex-col">
                <strong className="pb-1 md:pb-2 text-[#25601d]">
                  Admissão
                </strong>{" "}
                {cabecalho.admissao}
              </div>
            )}
            <div className="flex flex-col">
              <strong className="pb-1 md:pb-2 text-[#25601d]">
                Competência
              </strong>{" "}
              {(state as any).competencia_forced
                ? `${(state as any).competencia_forced.slice(0, 4)}-${(
                    state as any
                  ).competencia_forced.slice(4, 6)}`
                : cabecalho.competencia}
            </div>
          </div>

          <div className="bg-[#bfead0] w-full h-[1px] my-2"></div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-[#e9f8ef]">
                  <th className="p-1 md:p-2 text-left border-r border-[#bfead0] text-[#0b2b14]">
                    <span className="sm:hidden">Cód.</span>
                    <span className="hidden sm:inline">Cód.</span>
                  </th>
                  <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                    <span className="sm:hidden">Descr</span>
                    <span className="hidden sm:inline">Descrição</span>
                  </th>
                  <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                    <span className="sm:hidden">Ref</span>
                    <span className="hidden sm:inline">Referência</span>
                  </th>
                  <th className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                    <span className="sm:hidden">Venci</span>
                    <span className="hidden sm:inline">Vencimentos</span>
                  </th>
                  <th className="p-1 md:p-2 text-center text-[#0b2b14]">
                    <span className="sm:hidden">Desc</span>
                    <span className="hidden sm:inline">Descontos</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(eventos as Evento[]).map((e: Evento, idx: number) => (
                  <tr
                    key={idx}
                    className={idx % 2 ? "bg-[#f4fbf6]" : "bg-white"}
                  >
                    <td className="p-1 md:p-2 border-r border-[#bfead0] text-[#0b2b14]">
                      {e.evento}
                    </td>
                    <td className="p-1 md:p-2 border-r border-[#bfead0] text-[#0b2b14]">
                      {truncate(e.evento_nome, 35)}
                    </td>
                    <td className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      {fmtRef(e.referencia)}
                    </td>
                    <td className="p-1 md:p-2 text-center border-r border-[#bfead0] text-[#0b2b14]">
                      {e.tipo === "V" ? fmtNum(e.valor) : ""}
                    </td>
                    <td className="p-1 md:p-2 text-center text-[#0b2b14]">
                      {e.tipo === "D" ? fmtNum(e.valor) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-[#bfead0] w-full h-[1px] my-2"></div>

          <div className="my-4 md:my-6 flex flex-col sm:flex-row justify-between text-xs md:text-sm">
            <div className="hidden sm:flex justify-end sm:justify-start xl:pl-[700px]">
              <div className="flex flex-col text-right text-[#0b2b14]">
                <strong className="text-[#25601d]">Total Vencimentos:</strong>{" "}
                {fmtNum(rodape.total_vencimentos)}
              </div>
            </div>

            <div className="sm:hidden flex flex-col gap-2 text-[#0b2b14]">
              <div className="flex justify-between">
                <strong className="text-[#25601d]">Total Vencimentos:</strong>
                <span>{fmtNum(rodape.total_vencimentos)}</span>
              </div>
              <div className="flex justify-between">
                <strong className="text-[#25601d]">Total Descontos:</strong>
                <span>{fmtNum(rodape.total_descontos)}</span>
              </div>
              <div className="flex justify-between">
                <strong className="text-[#25601d]">Valor Líquido:</strong>
                <span>{fmtNum(rodape.valor_liquido)}</span>
              </div>
            </div>

            <div className="hidden sm:flex flex-col text-right text-[#0b2b14]">
              <div className="flex flex-col text-right">
                <strong className="text-[#25601d]">Total Descontos:</strong>{" "}
                {fmtNum(rodape.total_descontos)}
              </div>
              <div className="pt-2 md:pt-4">
                <strong className="text-[#25601d]">Valor Líquido:</strong>{" "}
                {fmtNum(rodape.valor_liquido)}
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="relative z-10 flex justify-center items-center pt-8 pb-12 ">
        <Button
          onClick={isAceito ? handleDownload : handleAcceptAndDownload}
          className="bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 text-white h-10 shadow-[0_10px_24px_rgba(47,161,70,0.22)]"
          disabled={isDownloading}
        >
          <Download className="mr-2 w-4 h-4" />
          {isDownloading
            ? "Confirmando..."
            : isAceito
              ? "Baixar holerite"
              : "Aceitar e baixar holerite"}
        </Button>
      </div>
      <footer className="relative z-1000000 w-full mt-auto">
      <Footer />
      </footer>
    </div>
  );
}