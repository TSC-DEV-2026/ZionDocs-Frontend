// src/pages/DocumentList.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CustomMonthPicker from "@/components/ui/custom-month-picker";
import api from "@/utils/axiosInstance";
import Header from "@/components/header";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { toast, Toaster } from "sonner";
import LoadingScreen from "@/components/ui/loadingScreen";

// ================================================
// Tipagens auxiliares
// ================================================
interface EmpresaMatricula {
  id: string; // cliente
  nome: string; // nome da empresa
  matricula: string; // matrícula naquela empresa
}

type DocumentoHolerite = {
  id_documento: string; // lote
  anomes: string; // "YYYYMM"

  // novos (para escolher / montar corretamente)
  uuid?: string;
  descricao?: string;
  tipo_calculo?: string;
};

interface DocumentoBeneficio {
  id_documento: string;
  anomes: string;

  // extras usados no preview
  cpf?: string;
  matricula?: string;
  competencia?: string;
  uuid?: string;
  cabecalho?: any;
  beneficios?: any[];
}

interface CabecalhoHolerite {
  empresa: string;
  filial: string;
  empresa_nome: string;
  empresa_cnpj: string;
  cliente: string;
  cliente_nome: string;
  cliente_cnpj: string;
  matricula: string;
  nome: string;
  funcao_nome: string;
  admissao: string;
  competencia: string;
  lote: number;
  uuid?: string;
}

interface EventoHolerite {
  evento: number;
  evento_nome: string;
  referencia: number;
  valor: number;
  tipo: string;
}

interface RodapeHolerite {
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

interface DocumentoGenerico {
  id_documento: string;
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
  anomes: string;
  tipodedoc: string;
  status: string;
  observacao: string;
  datadepagamento: string;
  matricula: string;
  _norm_anomes: string;
}

type DocumentoUnion =
  | DocumentoHolerite
  | DocumentoGenerico
  | DocumentoBeneficio;

// ================================================
// CONTRATO: lista de competências (modo discovery)
// ================================================
interface CompetenciaItem {
  ano: number;
  mes: string; // "01".."12"
}

type HoleriteBuscarItem = {
  uuid: string;
  aceito: boolean;
  tipo_calculo: string; // "P" | "A" | etc
  descricao: string; // "Pagamento" | "Adiantamento" | etc

  cabecalho: CabecalhoHolerite;
  rodape: RodapeHolerite;

  documentos: Array<{
    tipo_calculo: string;
    descricao: string;
    eventos: EventoHolerite[];
  }>;
};

type HoleriteBuscarResponseV2 = {
  tipo: "holerite";
  competencia_utilizada: string; // "202511"
  empresa_utilizada?: string; // "5238"
  cpf: string;
  matricula: string;
  total: number;
  holerites: HoleriteBuscarItem[];
};

// ================================================
// helpers
// ================================================
const toYYYYDashMM = (v: string) => {
  if (!v) return v;
  return v.includes("-") ? v : v.replace(/(\d{4})(\d{2})/, "$1-$2");
};

const makeYYYYMMLabel = (ano: number, mes: string) => `${ano}-${mes}`;

const makeYYYYMMValue = (ano: number, mes: string | number) =>
  `${ano}${String(mes).padStart(2, "0")}`;

// normaliza qualquer entrada para YYYYMM
const normalizeYYYYMM = (s: string) => {
  if (!s) return s;
  if (/^\d{6}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", "");
  if (/^\d{2}\/\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split("/");
    return `${yyyy}${mm.padStart(2, "0")}`;
  }
  return s.replace(/\D/g, "");
};

// mensagens amigáveis por status
const extractErrorMessage = (err: any, fallback = "Ocorreu um erro.") => {
  const status = err?.response?.status as number | undefined;

  if (typeof status === "number") {
    switch (status) {
      case 401:
        return "Sua sessão expirou. Faça login novamente.";
      case 403:
        return "Você não tem permissão para executar esta ação.";
      case 404:
        return "Não localizamos documentos para os dados informados.";
      case 413:
        return "Documento muito grande. Tente novamente mais tarde.";
      case 415:
      case 422:
        return "Os dados informados não foram aceitos pelo servidor.";
      case 429:
        return "Muitas tentativas. Aguarde e tente novamente.";
      case 500:
        return "Ocorreu um problema no servidor. Tente novamente em alguns minutos.";
      case 502:
      case 503:
      case 504:
        return "O servidor está indisponível no momento. Tente novamente.";
      default:
        break;
    }
  }
  return fallback;
};

// util: apenas dígitos e trim
const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");
const trimStr = (s: string) => String(s || "").trim();

// Retry com backoff simples (usado SOMENTE na visualização)
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 600,
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      const code = err?.code;
      const transient =
        code === "ERR_NETWORK" ||
        code === "ECONNABORTED" ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (!transient || attempt === retries) break;
      const wait = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// =====================================================
// [ALTERAÇÃO] Helper para normalizar "cabecalho" / "cabeçalho"
// =====================================================
const getCabecalhoNormalized = (obj: any) =>
  obj?.cabecalho ?? obj?.["cabeçalho"];

export default function DocumentList() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useUser();
  const [searchParams] = useSearchParams();

  // ===== Opção 2: normalizar parametros e mapear generico+Beneficios => beneficios
  const normalize = (s: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const tipoParam = normalize(searchParams.get("tipo") || "holerite");
  const nomeDocumentoRaw = searchParams.get("documento") || "";
  const docParam = normalize(nomeDocumentoRaw);

  const tipoDocumento =
    tipoParam === "beneficios" ||
    (tipoParam === "generico" && /^beneficios?$/.test(docParam))
      ? "beneficios"
      : tipoParam;

  const templateId = searchParams.get("template") || "3";
  const nomeDocumento = nomeDocumentoRaw;

  const isTrct = (() => {
    const d = docParam; // "informe rendimento", "trct", etc. já normalizado

    // Aqui você define quais documentos vão usar a rota /documents/search/informetrct
    return (
      tipoDocumento === "trct" || // se vier explicitamente como tipo=trct
      d.includes("informe rendimento") || // Informe de Rendimentos
      d.includes("trct") || // TRCT / TRTC
      d.includes("rescis") // termo de rescisão (opcional)
    );
  })();

  const isRecibo = (() => {
    const d = docParam; // já normalizado (sem acento e minúsculo)
    return d.includes("recibo va") || d.includes("recibo vt");
  })();

  // ================================================
  // ESTADOS GERAIS
  // ================================================
  const [matricula, setMatricula] = useState<string>("");
  const [cpf, setCpf] = useState<string>("");
  const [cpfError, setCpfError] = useState<string>("");
  const [anomes, setAnomes] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentoUnion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [paginaAtual, setPaginaAtual] = useState<number>(1);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [holeritesOpcoes, setHoleritesOpcoes] = useState<DocumentoHolerite[]>(
    [],
  );
  const porPagina = 10;

  const totalPaginas = Math.ceil(documents.length / porPagina);
  const documentosVisiveis = documents.slice(
    (paginaAtual - 1) * porPagina,
    paginaAtual * porPagina,
  );

  // Controller para cancelar visualização anterior (só usado na visualização)
  const previewAbortRef = useRef<AbortController | null>(null);

  // ================================================
  // ME (não gestor): CPF + empresas/matrículas
  // ================================================
  const [meCpf, setMeCpf] = useState<string>(""); // somente dígitos
  const [meLoading, setMeLoading] = useState<boolean>(false);

  // ================================================
  // Seleção prévia de EMPRESA e MATRÍCULA (não gestor / holerite)
  // ================================================
  const [empresasDoUsuario, setEmpresasDoUsuario] = useState<
    EmpresaMatricula[]
  >([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(
    null,
  );
  const [selectedEmpresaNome, setSelectedEmpresaNome] = useState<string | null>(
    null,
  );
  const [selectedMatricula, setSelectedMatricula] = useState<string | null>(
    null,
  );

  // === genéricos/benefícios (não holerite) ===
  const [selectedEmpresaIdGen, setSelectedEmpresaIdGen] = useState<
    string | null
  >(null);
  const [selectedEmpresaNomeGen, setSelectedEmpresaNomeGen] = useState<
    string | null
  >(null);
  const [selectedMatriculaGen, setSelectedMatriculaGen] = useState<
    string | null
  >(null);

  const empresasMap = useMemo(() => {
    const map = new Map<string, { nome: string; matriculas: string[] }>();
    for (const d of empresasDoUsuario) {
      const curr = map.get(d.id);
      if (!curr) {
        map.set(d.id, { nome: d.nome, matriculas: [trimStr(d.matricula)] });
      } else {
        const m = trimStr(d.matricula);
        if (!curr.matriculas.includes(m)) {
          curr.matriculas.push(m);
        }
      }
    }
    return map;
  }, [empresasDoUsuario]);

  const empresasUnicas = useMemo(() => {
    return Array.from(empresasMap.entries()).map(([id, v]) => ({
      id,
      nome: v.nome,
      qtdMatriculas: v.matriculas.length,
    }));
  }, [empresasMap]);

  const matriculasDaEmpresaSelecionada = useMemo(() => {
    if (!selectedEmpresaId) return [];
    const item = empresasMap.get(selectedEmpresaId);
    return item?.matriculas ?? [];
  }, [selectedEmpresaId, empresasMap]);

  const requerEscolherMatricula = useMemo(() => {
    if (!selectedEmpresaId) return false;
    return (empresasMap.get(selectedEmpresaId)?.matriculas.length ?? 0) > 1;
  }, [selectedEmpresaId, empresasMap]);

  // === helpers para genéricos/benefícios ===
  const matriculasDaEmpresaSelecionadaGen = useMemo(() => {
    if (!selectedEmpresaIdGen) return [];
    const item = empresasMap.get(selectedEmpresaIdGen);
    return item?.matriculas ?? [];
  }, [selectedEmpresaIdGen, empresasMap]);

  const requerEscolherMatriculaGen = useMemo(() => {
    if (!selectedEmpresaIdGen) return false;
    return (empresasMap.get(selectedEmpresaIdGen)?.matriculas.length ?? 0) > 1;
  }, [selectedEmpresaIdGen, empresasMap]);

  // ================================================
  // DISCOVERY de competências (holerite)
  // ================================================
  const [isLoadingCompetencias, setIsLoadingCompetencias] = useState(false);
  const [competencias, setCompetencias] = useState<CompetenciaItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);
  const [competenciasHoleriteLoaded, setCompetenciasHoleriteLoaded] =
    useState(false);

  const anosDisponiveis = useMemo(() => {
    const setAnos = new Set<number>();
    competencias.forEach((c) => setAnos.add(c.ano));
    return Array.from(setAnos).sort((a, b) => b - a);
  }, [competencias]);

  const mesesDoAnoSelecionado = useMemo(() => {
    if (!selectedYear) return [];
    const meses = competencias
      .filter((c) => c.ano === selectedYear)
      .map((c) => c.mes);
    const unicos = Array.from(new Set(meses));
    return unicos.sort((a, b) => Number(b) - Number(a));
  }, [competencias, selectedYear]);

  // ================================================
  // Genéricos (não gestor): empresa + matrícula do /me + colaborador/CPF
  // ================================================
  const [isLoadingCompetenciasGen, setIsLoadingCompetenciasGen] =
    useState(false);
  const [competenciasGen, setCompetenciasGen] = useState<CompetenciaItem[]>([]);

  const [selectedYearGen, setSelectedYearGen] = useState<number | null>(null);
  const [competenciasGenLoaded, setCompetenciasGenLoaded] = useState(false);

  const anosDisponiveisGen = useMemo(() => {
    const setAnos = new Set<number>();
    competenciasGen.forEach((c) => setAnos.add(c.ano));
    return Array.from(setAnos).sort((a, b) => b - a);
  }, [competenciasGen]);

  const mesesDoAnoSelecionadoGen = useMemo(() => {
    if (!selectedYearGen) return [];
    const meses = competenciasGen
      .filter((c) => c.ano === selectedYearGen)
      .map((c) => c.mes);
    const unicos = Array.from(new Set(meses));
    return unicos.sort((a, b) => Number(b) - Number(a));
  }, [competenciasGen, selectedYearGen]);

  // ================================================
  // Benefícios (não gestor): discovery por empresa/matrícula
  // ================================================
  const [isLoadingCompetenciasBen, setIsLoadingCompetenciasBen] =
    useState(false);
  const [competenciasBen, setCompetenciasBen] = useState<CompetenciaItem[]>([]);
  const [selectedYearBen, setSelectedYearBen] = useState<number | null>(null);
  const [competenciasBenLoaded, setCompetenciasBenLoaded] = useState(false);

  const anosDisponiveisBen = useMemo(() => {
    const setAnos = new Set<number>();
    competenciasBen.forEach((c) => setAnos.add(c.ano));
    return Array.from(setAnos).sort((a, b) => b - a);
  }, [competenciasBen]);

  const mesesDoAnoSelecionadoBen = useMemo(() => {
    if (!selectedYearBen) return [];
    const meses = competenciasBen
      .filter((c) => c.ano === selectedYearBen)
      .map((c) => c.mes);
    const unicos = Array.from(new Set(meses));
    return unicos.sort((a, b) => Number(b) - Number(a));
  }, [competenciasBen, selectedYearBen]);

  // ================================================
  // CPF helpers (gestor)
  // ================================================
  const formatCPF = (value: string): string => {
    const numbers = value.replace(/\D/g, "");
    const limitedNumbers = numbers.slice(0, 11);
    return limitedNumbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2");
  };

  const validateCPF = (cpf: string): boolean => {
    const numbers = cpf.replace(/\D/g, "");
    if (numbers.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(numbers)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(numbers[i]) * (10 - i);
    let remainder = sum % 11;
    let digit1 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(numbers[9]) !== digit1) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(numbers[i]) * (11 - i);
    remainder = sum % 11;
    let digit2 = remainder < 2 ? 0 : 11 - remainder;
    return parseInt(numbers[10]) === digit2;
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const formattedValue = formatCPF(value);
    setCpf(formattedValue);

    if (!formattedValue) {
      setCpfError("");
      return;
    }

    const numbers = formattedValue.replace(/\D/g, "");
    if (numbers.length === 11) {
      setCpfError(validateCPF(formattedValue) ? "" : "");
    } else {
      setCpfError("");
    }
  };

  const getCpfNumbers = (cpfValue: string): string =>
    cpfValue.replace(/\D/g, "");

  // compat function
  function formatCompetencia(input: string): string {
    if (input.includes("/")) {
      const [mm, yyyy] = input.split("/");
      return `${yyyy}${mm.padStart(2, "0")}`;
    }
    if (input.includes("-")) return input.split("-").join("");
    return input;
  }

  // ================================================
  // Estados para controlar loading geral
  // ================================================
  const isAnyLoading = useMemo(() => {
    return (
      isLoading ||
      isLoadingCompetencias ||
      isLoadingCompetenciasGen ||
      isLoadingCompetenciasBen ||
      !!loadingPreviewId ||
      userLoading ||
      meLoading
    );
  }, [
    isLoading,
    isLoadingCompetencias,
    isLoadingCompetenciasGen,
    isLoadingCompetenciasBen,
    loadingPreviewId,
    userLoading,
    meLoading,
  ]);

  // ================================================
  // Carregar /user/me para NÃO GESTOR (CPF + dados)
  // ================================================
  useEffect(() => {
    const shouldRun = !userLoading && user && !user.gestor;
    if (!shouldRun) return;

    const run = async () => {
      try {
        setMeLoading(true);

        const res = await api.get<{
          nome: string;
          cpf: string;
          gestor: boolean;
          dados?: { id: string; nome: string; matricula: string }[];
        }>("/user/me");

        const cpfDigits = onlyDigits(res.data?.cpf || "");
        setMeCpf(cpfDigits);

        const dadosList = (res.data?.dados ?? []).map((d) => ({
          id: d.id,
          nome: d.nome,
          matricula: trimStr(d.matricula),
        }));
        setEmpresasDoUsuario(dadosList);

        // Auto-seleção por empresa (para holerite e genéricos/benefícios)
        if (dadosList.length > 0) {
          const porEmpresa = new Map<string, EmpresaMatricula[]>();
          for (const d of dadosList) {
            const arr = porEmpresa.get(d.id) ?? [];
            arr.push(d);
            porEmpresa.set(d.id, arr);
          }
          const empresas = Array.from(porEmpresa.entries());

          // holerite
          if (empresas.length === 1) {
            const [empresaId, arr] = empresas[0];
            setSelectedEmpresaId(empresaId);
            setSelectedEmpresaNome(arr[0].nome);
            if (arr.length === 1) {
              setSelectedMatricula(trimStr(arr[0].matricula));
            } else {
              setSelectedMatricula(null);
            }
          } else {
            setSelectedEmpresaId(null);
            setSelectedEmpresaNome(null);
            setSelectedMatricula(null);
          }

          // genéricos/benefícios
          if (empresas.length === 1) {
            const [empresaId, arr] = empresas[0];
            setSelectedEmpresaIdGen(empresaId);
            setSelectedEmpresaNomeGen(arr[0].nome);
            if (arr.length === 1) {
              setSelectedMatriculaGen(trimStr(arr[0].matricula));
            } else {
              setSelectedMatriculaGen(null);
            }
          } else {
            setSelectedEmpresaIdGen(null);
            setSelectedEmpresaNomeGen(null);
            setSelectedMatriculaGen(null);
          }
        } else {
          setSelectedEmpresaId(null);
          setSelectedEmpresaNome(null);
          setSelectedMatricula(null);
          setSelectedEmpresaIdGen(null);
          setSelectedEmpresaNomeGen(null);
          setSelectedMatriculaGen(null);
        }

        // limpa estados dependentes
        setCompetencias([]);
        setSelectedYear(null);
        setCompetenciasGen([]);
        setSelectedYearGen(null);
        setCompetenciasBen([]);
        setSelectedYearBen(null);
        setDocuments([]);
        setPaginaAtual(1);
        lastFetchKeyRef.current = null;
        setCompetenciasHoleriteLoaded(false);
        setCompetenciasGenLoaded(false);
        setCompetenciasBenLoaded(false);
      } catch (_err: any) {
        if (!user?.gestor) {
          setMeCpf(onlyDigits((user as any)?.cpf || ""));
        }
      } finally {
        setMeLoading(false);
      }
    };

    run();
  }, [userLoading, user]);

  // ================================================
  // Buscar COMPETÊNCIAS após escolher empresa(/matrícula) - holerite
  // ================================================
  useEffect(() => {
    const showDiscoveryFlow = !user?.gestor && tipoDocumento === "holerite";
    if (!showDiscoveryFlow) return;
    if (!selectedEmpresaId) return;

    const arr = empresasMap.get(selectedEmpresaId)?.matriculas ?? [];
    const matriculaEfetiva = requerEscolherMatricula
      ? selectedMatricula
      : arr[0];
    if (!matriculaEfetiva) return;

    const key = `${selectedEmpresaId}|${matriculaEfetiva}`;
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;

    const controller = new AbortController();

    const run = async () => {
      try {
        setIsLoadingCompetencias(true);
        setCompetencias([]);
        setSelectedYear(null);
        setDocuments([]);
        setPaginaAtual(1);
        setCompetenciasHoleriteLoaded(false);

        const payload = {
          cpf: onlyDigits(meCpf),
          matricula: trimStr(matriculaEfetiva),
          empresa: selectedEmpresaId,
        };

        const res = await api.request<{
          competencias: { ano: number; mes: number }[];
        }>({
          method: "POST",
          url: "/documents/holerite/competencias",
          data: payload,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const lista = (res.data?.competencias ?? []).map((x) => ({
          ano: x.ano,
          mes: String(x.mes).padStart(2, "0"),
        })) as CompetenciaItem[];

        setCompetencias(lista);

        if (!lista.length) {
          toast.warning(
            "Nenhum período de holerite encontrado para esta seleção.",
          );
        } else {
          toast.success(
            `Períodos disponíveis carregados para ${
              selectedEmpresaNome ?? "a empresa selecionada"
            }.`,
          );
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError"
        ) {
          return;
        }
        toast.error("Erro ao carregar períodos do holerite", {
          description: extractErrorMessage(
            err,
            "Falha ao consultar competências.",
          ),
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCompetencias(false);
          setCompetenciasHoleriteLoaded(true);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [
    user,
    tipoDocumento,
    selectedEmpresaId,
    selectedMatricula,
    requerEscolherMatricula,
    selectedEmpresaNome,
    empresasMap,
    meCpf,
  ]);

  // ================================================
  // Genéricos: carregar competências (empresa + matrícula) [EXCETO benefícios]
  // ================================================
  useEffect(() => {
    const deveRodarDiscoveryGen =
      !userLoading &&
      user &&
      !user.gestor &&
      tipoDocumento !== "holerite" &&
      tipoDocumento !== "beneficios";
    if (!deveRodarDiscoveryGen) return;

    if (!selectedEmpresaIdGen) return;

    const arr = empresasMap.get(selectedEmpresaIdGen)?.matriculas ?? [];
    const matriculaEfetivaGen = requerEscolherMatriculaGen
      ? selectedMatriculaGen
      : arr[0];
    if (!matriculaEfetivaGen) return;

    const controller = new AbortController();

    const run = async () => {
      try {
        setIsLoadingCompetenciasGen(true);
        setDocuments([]);
        setPaginaAtual(1);
        setCompetenciasGenLoaded(false);

        // se for TRCT, seguimos o mesmo padrão que você testou no Postman
        const cpfNorm = onlyDigits(meCpf);

        // TRCT + Informe Rendimento usam a mesma rota /documents/search/informetrct
        let cp: { nome: string; valor: string }[];

        if (isTrct) {
          cp = [
            { nome: "tipodedoc", valor: nomeDocumento }, // "trtc" OU "Informe Rendimento"
            { nome: "cpf", valor: cpfNorm },
          ];
        } else {
          cp = [
            { nome: "tipodedoc", valor: nomeDocumento },
            { nome: "matricula", valor: trimStr(matriculaEfetivaGen) },
            { nome: "colaborador", valor: cpfNorm },
          ];

          // 👉 RECIBO VA/VT: adiciona cliente (mesma lógica de holerite/benefícios)
          if (isRecibo && selectedEmpresaIdGen) {
            cp.push({ nome: "cliente", valor: String(selectedEmpresaIdGen) });
          }
        }
        const payload: any = {
          id_template: Number(templateId),
          cp,
          campo_anomes: isTrct ? "ano" : "anomes",
          anomes: "",
        };

        const endpoint = isTrct
          ? "/documents/search/informetrct"
          : isRecibo
            ? "/documents/search/recibos"
            : "/documents/search";

        const res = await api.post<{
          anomes?: { ano: number; mes: number }[];
          anos?: { ano: number }[];
        }>(endpoint, payload, { signal: controller.signal });

        if (controller.signal.aborted) return;

        let lista: CompetenciaItem[] = [];

        if (isTrct) {
          // TRCT retorna "anos", não "anomes"
          const anosBrutos = res.data?.anos ?? [];
          lista = anosBrutos.map((x) => ({
            ano: x.ano,
            // usamos um mês "fake" só pra encaixar no grid; depois a busca usa só o ano
            mes: "01",
          }));
        } else {
          const listaBruta = res.data?.anomes ?? [];
          lista = listaBruta.map((x) => ({
            ano: x.ano,
            mes: String(x.mes).padStart(2, "0"),
          }));
        }

        setCompetenciasGen(lista);

        if (!lista.length) {
          toast.warning(`Nenhum período encontrado para ${nomeDocumento}.`);
        } else {
          toast.success(`Períodos disponíveis de ${nomeDocumento} carregados.`);
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError"
        ) {
          return;
        }

        const status = err?.response?.status as number | undefined;
        const description = extractErrorMessage(
          err,
          "Falha ao consultar períodos disponíveis.",
        );

        if (status === 404) {
          toast.warning("Nenhum período encontrado", { description });
        } else {
          toast.error("Erro ao carregar períodos", { description });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCompetenciasGen(false);
          setCompetenciasGenLoaded(true);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [
    userLoading,
    user,
    tipoDocumento,
    nomeDocumento,
    templateId,
    selectedEmpresaIdGen,
    selectedMatriculaGen,
    requerEscolherMatriculaGen,
    empresasMap,
    meCpf,
  ]);

  // ================================================
  // Benefícios: carregar competências (empresa + matrícula)
  // ================================================
  // ================================================
  // Benefícios: carregar competências (empresa + matrícula)
  // → usa /documents/beneficios/competencias
  // ================================================
  useEffect(() => {
    const deveRodarDiscoveryBen =
      !userLoading && user && !user.gestor && tipoDocumento === "beneficios";
    if (!deveRodarDiscoveryBen) return;

    if (!selectedEmpresaIdGen) return;

    const arr = empresasMap.get(selectedEmpresaIdGen)?.matriculas ?? [];
    const matriculaEfetivaGen = requerEscolherMatriculaGen
      ? selectedMatriculaGen
      : arr[0];
    if (!matriculaEfetivaGen) return;

    const controller = new AbortController();

    const run = async () => {
      try {
        setIsLoadingCompetenciasBen(true);
        setDocuments([]);
        setPaginaAtual(1);
        setCompetenciasBenLoaded(false);

        const cpfNorm = onlyDigits(meCpf);
        const matriculaNorm = trimStr(matriculaEfetivaGen);
        const empresaId = selectedEmpresaIdGen;

        const payload = {
          cpf: cpfNorm,
          matricula: matriculaNorm,
          empresa: empresaId,
        };

        const res = await api.post<{
          competencias: { ano: number; mes: number }[];
        }>("/documents/beneficios/competencias", payload, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const lista: CompetenciaItem[] = (res.data?.competencias ?? []).map(
          (x) => ({
            ano: x.ano,
            mes: String(x.mes).padStart(2, "0"),
          }),
        );

        setCompetenciasBen(lista);

        if (!lista.length) {
          toast.warning(
            "Nenhum período de benefícios encontrado para a seleção atual.",
          );
        } else {
          toast.success("Períodos de benefícios carregados com sucesso.");
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError"
        ) {
          return;
        }
        toast.error("Erro ao carregar períodos de benefícios", {
          description: extractErrorMessage(
            err,
            "Falha ao consultar benefícios disponíveis.",
          ),
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCompetenciasBen(false);
          setCompetenciasBenLoaded(true);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [
    userLoading,
    user,
    tipoDocumento,
    selectedEmpresaIdGen,
    selectedMatriculaGen,
    requerEscolherMatriculaGen,
    empresasMap,
    meCpf,
  ]);

  // ==========================================
  // Holerite: buscar mês -> prévia
  // ==========================================
  const buscarHoleritePorAnoMes = async (ano: number, mes: string) => {
    if (!selectedEmpresaId) {
      toast.error("Selecione a empresa antes de continuar.");
      return;
    }

    const arr = empresasMap.get(selectedEmpresaId)?.matriculas ?? [];
    const matriculaEfetiva = requerEscolherMatricula
      ? selectedMatricula
      : arr[0];
    if (!matriculaEfetiva) {
      toast.error("Selecione a matrícula antes de continuar.");
      return;
    }

    const competenciaYYYYMM = makeYYYYMMValue(ano, mes);
    setIsLoading(true);
    setDocuments([]);
    setPaginaAtual(1);

    try {
      const payload = {
        cpf: onlyDigits(meCpf),
        matricula: trimStr(matriculaEfetiva),
        competencia: normalizeYYYYMM(competenciaYYYYMM),
        empresa: selectedEmpresaId, // <<--- AQUI entra a empresa selecionada
      };
      setHoleritesOpcoes([]); // <<< zera opções antes de buscar

      const res = await api.post<HoleriteBuscarResponseV2>(
        "/documents/holerite/buscar",
        payload,
      );

      const competenciaUsada = normalizeYYYYMM(
        res.data?.competencia_utilizada || competenciaYYYYMM,
      );

      const itens = Array.isArray(res.data?.holerites)
        ? res.data.holerites
        : [];

      if (itens.length === 0) {
        setHoleritesOpcoes([]);
        toast.warning("Nenhum holerite encontrado para o mês selecionado.");
        return;
      }

      if (itens.length === 1) {
        const h = itens[0];

        const documento: DocumentoHolerite = {
          id_documento: String(h.cabecalho?.lote || "1"),
          anomes: competenciaUsada,
          uuid: h.uuid,
          descricao: h.descricao,
          tipo_calculo: h.tipo_calculo,
        };

        setDocuments([documento]);
        setHoleritesOpcoes([]);
        sessionStorage.setItem("holeriteData", JSON.stringify(res.data));

        toast.success("Holerite encontrado!", {
          description: `Período ${toYYYYDashMM(documento.anomes)} localizado.`,
        });

        await visualizarDocumento(documento);
        return;
      }

      // >>> MULTI: cria opções e pede escolha
      const opcoes: DocumentoHolerite[] = itens.map((h) => ({
        id_documento: String(h.cabecalho?.lote || ""),
        anomes: competenciaUsada,
        uuid: h.uuid,
        descricao: h.descricao,
        tipo_calculo: h.tipo_calculo,
      }));

      setDocuments(opcoes); // opcional (se você quiser)
      setHoleritesOpcoes(opcoes); // <<< renderiza botões
      sessionStorage.setItem("holeriteData", JSON.stringify(res.data));

      toast.warning("Mais de um holerite encontrado", {
        description: "Selecione qual documento deseja abrir.",
      });
      return;
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const title =
        status === 404
          ? "Nenhum holerite encontrado"
          : "Erro ao buscar holerite";

      const description = extractErrorMessage(
        err,
        "Falha ao consultar o período escolhido.",
      );

      if (status === 404) {
        toast.warning(title, { description }); // <<-- amarelo
      } else {
        toast.error(title, { description });
      }
    } finally {
      dbgGroupEnd();
      setIsLoading(false);
    }
  };

  // ==========================================
  // Benefícios: buscar mês -> BUSCAR (uuid/lote) -> MONTAR -> prévia
  // ==========================================
  const buscarBeneficiosPorAnoMes = async (ano: number, mes: string) => {
    if (!selectedEmpresaIdGen) {
      toast.error("Selecione a empresa para continuar.");
      return;
    }
    const arr = empresasMap.get(selectedEmpresaIdGen)?.matriculas ?? [];
    const matriculaEfetivaGen = requerEscolherMatriculaGen
      ? selectedMatriculaGen
      : arr[0];
    if (!matriculaEfetivaGen) {
      toast.error("Selecione a matrícula para continuar.");
      return;
    }

    const competenciaYYYYMM = normalizeYYYYMM(makeYYYYMMValue(ano, mes));

    setIsLoading(true);
    setDocuments([]);
    setPaginaAtual(1);

    try {
      const cpfNorm = onlyDigits(meCpf);
      const matriculaNorm = trimStr(matriculaEfetivaGen);

      // 1) BUSCAR -> obter lote e uuid
      const buscarPayload = {
        cpf: cpfNorm,
        matricula: matriculaNorm,
        competencia: competenciaYYYYMM,
        empresa: String(selectedEmpresaIdGen), // <<--- AQUI entra a empresa
      };

      const resBuscar = await api.post<{
        cpf?: string;
        matricula?: string | number;
        competencia?: string;
        cabecalho?: {
          empresa?: number;
          filial?: number;
          empresa_nome?: string;
          empresa_cnpj?: string;
          cliente?: number;
          cliente_nome?: string;
          cliente_cnpj?: string;
          matricula?: number | string;
          nome?: string;
          funcao_nome?: string;
          admissao?: string;
          competencia?: string;
          lote?: number;
          uuid?: string;
        };
        beneficios?: any[];
      }>("/documents/beneficios/buscar", buscarPayload);

      const cab = getCabecalhoNormalized(resBuscar.data);

      // Fallbacks para uuid/lote
      const uuidTop = (resBuscar.data as any)?.uuid;
      const loteFromItem =
        Array.isArray((resBuscar.data as any)?.beneficios) &&
        (resBuscar.data as any).beneficios.length > 0
          ? (resBuscar.data as any).beneficios[0]?.lote
          : undefined;

      const lote = cab?.lote ?? loteFromItem;
      const uuid = cab?.uuid ?? uuidTop;

      if (!lote || !uuid) {
        toast.warning("Não foi possível obter lote/uuid para montar.");
        return;
      }

      // popular list
      const documento: DocumentoBeneficio = {
        id_documento: String(lote ?? "1"),
        anomes: competenciaYYYYMM,
      };
      setDocuments([documento]);
      sessionStorage.setItem("beneficiosData", JSON.stringify(resBuscar.data));
      toast.success("Benefícios encontrados!", {
        description: `Período ${toYYYYDashMM(documento.anomes)} localizado.`,
      });

      // 2) MONTAR -> usa lote/uuid
      const montarPayload = {
        cpf: String(cpfNorm),
        matricula: String(matriculaNorm),
        competencia: String(competenciaYYYYMM),
        uuid: String(uuid),
      };

      const resMontar = await api.post<{
        pdf_base64?: string;
        cabecalho?: any;
      }>("/documents/beneficios/montar", montarPayload);

      // 3) preview
      navigate("/documento/preview", {
        state: {
          tipo: "beneficios",
          competencia_forced: competenciaYYYYMM,
          pdf_base64: resMontar.data?.pdf_base64 || "",
          cabecalho: resMontar.data?.cabecalho ?? cab,
          beneficios: (resBuscar.data as any)?.beneficios ?? [],
        },
      });
      toast.success("Documento de benefícios aberto!");
      return;
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const title =
        status === 404
          ? "Nenhum benefício encontrado"
          : "Erro ao buscar/montar benefícios";

      const description = extractErrorMessage(
        err,
        "Falha ao processar o período escolhido.",
      );

      if (status === 404) {
        toast.warning(title, { description }); // <<-- amarelo
      } else {
        toast.error(title, { description });
      }
    } finally {
      dbgGroupEnd();
      setIsLoading(false);
    }
  };

  // ==========================================
  // Genéricos: buscar mês -> prévia do primeiro
  // ==========================================
  const buscarGenericoPorAnoMes = async (ano: number, mes: string) => {
    if (!selectedEmpresaIdGen) {
      toast.error("Selecione a empresa para continuar.");
      return;
    }
    const arr = empresasMap.get(selectedEmpresaIdGen)?.matriculas ?? [];
    const matriculaEfetivaGen = requerEscolherMatriculaGen
      ? selectedMatriculaGen
      : arr[0];
    if (!matriculaEfetivaGen) {
      toast.error("Selecione a matrícula para continuar.");
      return;
    }

    setIsLoading(true);
    setDocuments([]);
    setPaginaAtual(1);

    try {
      let cp: { nome: string; valor: string }[] = [
        { nome: "tipodedoc", valor: nomeDocumento },
        { nome: "matricula", valor: trimStr(matriculaEfetivaGen) },
        { nome: "colaborador", valor: onlyDigits(meCpf) },
      ];

      // 👉 RECIBO VA/VT: adiciona cliente com o id da empresa selecionada
      if (isRecibo && selectedEmpresaIdGen) {
        cp.push({ nome: "cliente", valor: String(selectedEmpresaIdGen) });
      }

      let campo_anomes = "anomes";
      let anomesValor = `${ano}-${mes}`; // ex: 2025-09

      if (isTrct) {
        cp = [
          { nome: "tipodedoc", valor: nomeDocumento },
          { nome: "cpf", valor: onlyDigits(meCpf) },
        ];
        campo_anomes = "ano";
        anomesValor = String(ano); // "2025"
      }

      const payload: any = {
        id_template: Number(templateId),
        cp,
        campo_anomes,
        anomes: anomesValor,
      };

      const endpoint = isTrct
        ? "/documents/search/informetrct"
        : isRecibo
          ? "/documents/search/recibos"
          : "/documents/search";

      const res = await api.post<{
        total_bruto: number;
        ultimos_6_meses: string[];
        total_encontrado: number;
        documentos: any[];
      }>(endpoint, payload);

      const documentosBrutos = res.data.documentos || [];

      // 🔧 Normaliza TRTC e demais genéricos
      const documentos: DocumentoGenerico[] = documentosBrutos.map((d: any) => {
        const anoDoc = d.ano ?? d.ANO ?? null;

        const idDocumentoNorm = String(
          d.id_documento ?? d.id_ged ?? d.id ?? d.ID ?? "", // último fallback
        );

        const normAnoMes =
          d._norm_anomes ??
          d.anomes ??
          (anoDoc ? String(anoDoc) : "") ??
          anomesValor; // ex.: "2025" para TRTC

        return {
          ...d,
          id_documento: idDocumentoNorm,
          _norm_anomes: normAnoMes,
        } as DocumentoGenerico;
      });

      setDocuments(documentos);

      if (documentos.length > 0) {
        const periodoLabel = isTrct ? String(ano) : `${ano}-${mes}`;
        toast.success(`${documentos.length} documento(s) encontrado(s)!`, {
          description: `Período ${periodoLabel} para ${nomeDocumento}.`,
        });

        await visualizarDocumento(documentos[0]);
        return;
      } else {
        toast.warning(
          isTrct
            ? "Nenhum documento encontrado para o ano selecionado."
            : "Nenhum documento encontrado para o mês selecionado.",
        );
      }
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      let title = "Erro ao buscar documentos";
      let description = extractErrorMessage(
        err,
        "Falha ao consultar o período escolhido.",
      );

      switch (status) {
        case 401:
          title = "Não autorizado";
          description = "Sua sessão expirou. Faça login novamente.";
          break;
        case 403:
          title = "Acesso negado";
          description = "Você não tem permissão para executar esta busca.";
          break;
        case 404:
          title = "Nenhum documento encontrado";
          description = "Não localizamos documentos para os dados informados.";
          break;
        case 413:
          title = "Documento muito grande";
          description = "Tente novamente mais tarde ou contate o suporte.";
          break;
        case 415:
        case 422:
          title = "Requisição inválida";
          description = "Os dados informados não foram aceitos pelo servidor.";
          break;
        case 429:
          title = "Muitas tentativas";
          description =
            "Você atingiu o limite momentâneo. Aguarde e tente novamente.";
          break;
        case 500:
          title = "Erro interno do servidor";
          description =
            "Ocorreu um problema no servidor. Tente novamente em alguns minutos.";
          break;
        case 502:
        case 503:
        case 504:
          title = "Instabilidade no serviço";
          description =
            "O servidor está indisponível no momento. Tente novamente.";
          break;
        default:
          break;
      }

      if (status === 404) {
        toast.warning(title, { description }); // <<-- amarelo
      } else {
        toast.error(title, { description });
      }
    } finally {
      dbgGroupEnd();
      setIsLoading(false);
    }
  };

  // ==========================================
  // Visualizar documento
  // ==========================================
  const visualizarDocumento = async (doc: DocumentoUnion) => {
    // Cancela visualização anterior, se existir
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setLoadingPreviewId(doc.id_documento);

    try {
      if (tipoDocumento === "holerite") {
        const docHolerite = doc as DocumentoHolerite;

        let matForPreview = "";
        if (user?.gestor) {
          matForPreview = matricula;
        } else if (selectedEmpresaId) {
          const arr = empresasMap.get(selectedEmpresaId)?.matriculas ?? [];
          matForPreview = requerEscolherMatricula
            ? (selectedMatricula ?? "")
            : (arr[0] ?? "");
        }

        const competenciaYYYYMM = normalizeYYYYMM(docHolerite.anomes);

        const empresaValue = user?.gestor
          ? undefined
          : (selectedEmpresaId ?? undefined);

        const payload: any = {
          cpf: user?.gestor
            ? onlyDigits(getCpfNumbers(cpf) || (user as any)?.cpf || "")
            : onlyDigits(meCpf),
          matricula: trimStr(matForPreview),
          competencia: competenciaYYYYMM,
          lote: docHolerite.id_documento,
          ...(docHolerite.uuid ? { uuid: docHolerite.uuid } : {}),
          ...(docHolerite.tipo_calculo
            ? { tipo_calculo: docHolerite.tipo_calculo }
            : {}),
          ...(empresaValue ? { empresa: empresaValue } : {}),
        };

        const res = await withRetry(
          () =>
            api.post<{
              cabecalho: CabecalhoHolerite;
              eventos: EventoHolerite[];
              rodape: RodapeHolerite;
              pdf_base64: string;
              uuid?: string;
            }>("/documents/holerite/montar", payload, {
              timeout: 45000,
              signal: controller.signal,
            }),
          2,
          700,
        );

        if (res.data && res.data.pdf_base64) {
          setLoadingPreviewId(null);
          previewAbortRef.current = null;

          const uuid =
            docHolerite.uuid || res.data.uuid || res.data.cabecalho?.uuid;

          navigate("/documento/preview", {
            state: {
              ...res.data,
              tipo: "holerite",
              competencia_forced: competenciaYYYYMM,
              uuid,
            },
          });
          toast.success("Documento aberto com sucesso!");
        } else {
          throw new Error("Não foi possível gerar o PDF do holerite");
        }
      } else if (tipoDocumento === "beneficios") {
        const docBen: any = doc; // aceita doc “enriquecido” do passo 1

        // matrícula efetiva
        let matForPreview = "";
        if (user?.gestor) {
          matForPreview = trimStr(matricula);
        } else if (selectedEmpresaIdGen) {
          const arr = empresasMap.get(selectedEmpresaIdGen)?.matriculas ?? [];
          matForPreview = trimStr(
            requerEscolherMatriculaGen
              ? (selectedMatriculaGen ?? "")
              : (arr[0] ?? ""),
          );
        }

        const competenciaYYYYMM = normalizeYYYYMM(
          docBen?.competencia || docBen?.anomes,
        );

        const cpfToUse = user?.gestor
          ? onlyDigits(getCpfNumbers(cpf) || (user as any)?.cpf || "")
          : onlyDigits(meCpf);

        const cpfNorm = onlyDigits(docBen?.cpf || cpfToUse);
        const matriculaNorm = trimStr(docBen?.matricula || matForPreview);

        // 0) tenta pegar cabecalho/beneficios do doc ou do sessionStorage
        const fromSession = (() => {
          try {
            const raw = sessionStorage.getItem("beneficiosData");
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })();

        const cabLocal =
          docBen?.cabecalho ?? getCabecalhoNormalized(fromSession);
        const listaLocal = Array.isArray(docBen?.beneficios)
          ? docBen.beneficios
          : Array.isArray(fromSession?.beneficios)
            ? fromSession.beneficios
            : [];

        // 1) garantir UUID: primeiro tenta do doc/cabecalho/session; se não tiver, chama BUSCAR
        let uuid =
          docBen?.uuid ??
          cabLocal?.uuid ??
          fromSession?.uuid ??
          getCabecalhoNormalized(fromSession)?.uuid;

        let cab = cabLocal;
        let beneficios = listaLocal;

        if (!uuid) {
          const buscarPayload: any = {
            cpf: cpfNorm,
            matricula: matriculaNorm,
            competencia: competenciaYYYYMM,
            ...(user?.gestor
              ? {}
              : { empresa: String(selectedEmpresaIdGen || "") }),
          };

          const resBuscar = await withRetry(
            () =>
              api.post<{
                cabecalho?: { uuid?: string; [k: string]: any };
                beneficios?: any[];
                uuid?: string;
              }>("/documents/beneficios/buscar", buscarPayload, {
                timeout: 45000,
                signal: controller.signal,
              }),
            2,
            700,
          );

          cab = getCabecalhoNormalized(resBuscar.data) ?? cab;
          beneficios =
            Array.isArray((resBuscar.data as any)?.beneficios) &&
            (resBuscar.data as any).beneficios.length
              ? (resBuscar.data as any).beneficios
              : beneficios;

          uuid = cab?.uuid ?? (resBuscar.data as any)?.uuid;
        }

        if (!uuid) {
          throw new Error("Não foi possível obter uuid para montar.");
        }

        // 2) MONTAR
        const montarPayload = {
          cpf: String(cpfNorm),
          matricula: String(matriculaNorm),
          competencia: String(competenciaYYYYMM),
          uuid: String(uuid),
        };

        const resMontar = await withRetry(
          () =>
            api.post<{ pdf_base64?: string; cabecalho?: any }>(
              "/documents/beneficios/montar",
              montarPayload,
              {
                timeout: 45000,
                signal: controller.signal,
              },
            ),
          2,
          700,
        );

        setLoadingPreviewId(null);
        previewAbortRef.current = null;

        navigate("/documento/preview", {
          state: {
            tipo: "beneficios",
            competencia_forced: competenciaYYYYMM,
            pdf_base64: resMontar.data?.pdf_base64 || "",
            cabecalho: resMontar.data?.cabecalho ?? cab,
            beneficios: beneficios ?? [],

            // >>> GARANTIR no preview (muito útil se lá você usa isso)
            cpf: cpfNorm,
            matricula: matriculaNorm,
            competencia: competenciaYYYYMM,
            uuid,
          },
        });

        toast.success("Documento de benefícios aberto!");
      } else {
        const docGenerico = doc as DocumentoGenerico;

        const payload = {
          id_tipo: Number(templateId),
          id_documento: Number(docGenerico.id_documento),
        };

        const res = await withRetry(
          () =>
            api.post<{
              erro: boolean;
              base64_raw?: string;
              base64?: string;
            }>("/searchdocuments/download", payload, {
              timeout: 45000,
              signal: controller.signal,
            }),
          2,
          700,
        );

        if (res.data.erro) {
          throw new Error(
            "O servidor retornou um erro ao processar o documento",
          );
        }

        const pdfBase64 = res.data.base64_raw || res.data.base64;

        if (pdfBase64) {
          setLoadingPreviewId(null);
          previewAbortRef.current = null;

          navigate("/documento/preview", {
            state: {
              pdf_base64: pdfBase64,
              documento_info: docGenerico,
              tipo: "generico",
            },
          });
          toast.success("Documento aberto com sucesso!");
        } else {
          throw new Error("O documento não possui conteúdo PDF disponível");
        }
      }
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const code = err?.code as string | undefined;
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;

      let title = "Erro ao abrir documento";
      let description = extractErrorMessage(
        err,
        "Erro ao processar o documento",
      );
      let action: { label: string; onClick: () => void } | undefined = {
        label: "Tentar novamente",
        onClick: () => visualizarDocumento(doc),
      };

      if (offline || code === "ERR_NETWORK") {
        title = "Sem conexão com a internet";
        description = "Verifique sua conexão e tente novamente.";
      } else if (
        code === "ECONNABORTED" ||
        /timeout/i.test(err?.message ?? "")
      ) {
        title = "Tempo esgotado";
        description =
          "O servidor demorou para responder. Tente novamente em instantes.";
      } else {
        switch (status) {
          case 401:
            title = "Sessão expirada";
            description = "Faça login novamente para continuar.";
            action = {
              label: "Ir para login",
              onClick: () => navigate("/login"),
            };
            break;
          case 403:
            title = "Acesso negado";
            description =
              "Você não tem permissão para visualizar este documento.";
            break;
          case 404:
            title = "Documento não encontrado";
            description = "Não localizamos o arquivo para os dados informados.";
            break;
          case 413:
            title = "Documento muito grande";
            description = "Tente novamente mais tarde ou contate o suporte.";
            break;
          case 415:
          case 422:
            title = "Requisição inválida";
            description =
              "Os dados informados não foram aceitos pelo servidor.";
            break;
          case 429:
            title = "Muitas tentativas";
            description =
              "Você atingiu o limite momentâneo. Aguarde e tente novamente.";
            break;
          case 500:
            title = "Erro interno do servidor";
            description =
              "Ocorreu um problema no servidor. Tente novamente em alguns minutos.";
            break;
          case 502:
          case 503:
          case 504:
            title = "Instabilidade no serviço";
            description =
              "O servidor está indisponível no momento. Tente novamente.";
            break;
          default:
            break;
        }
      }

      toast.error(title, { description, action });
    } finally {
      dbgGroupEnd();
      setLoadingPreviewId(null);
      previewAbortRef.current = null;
    }
  };

  const renderDocumentInfo = (doc: DocumentoUnion) => {
    if (tipoDocumento === "holerite") {
      const docHolerite = doc as DocumentoHolerite;
      return (
        <>
          <td className="px-4 py-2 text-left">
            {toYYYYDashMM(docHolerite.anomes)}
          </td>
          <td className="px-4 py-2 text-center">{docHolerite.id_documento}</td>
        </>
      );
    } else if (tipoDocumento === "beneficios") {
      const docBen = doc as DocumentoBeneficio;
      return (
        <>
          <td className="px-4 py-2 text-left">{toYYYYDashMM(docBen.anomes)}</td>
          <td className="px-4 py-2 text-center">{docBen.id_documento}</td>
        </>
      );
    } else {
      const docGenerico = doc as DocumentoGenerico;

      // 🔹 CASO ESPECÍFICO: TRCT → mostrar só o ano (ex: 2025)
      if (isTrct) {
        const anyDoc = docGenerico as any;
        const raw =
          anyDoc._norm_anomes || anyDoc.anomes || anyDoc.ano || anyDoc.ANO;

        const displayAno = raw ? String(raw).slice(0, 4) : "";

        return (
          <>
            <td className="px-4 py-2 text-left">{displayAno}</td>
          </>
        );
      }

      // 🔹 DEMAIS GENÉRICOS → mantém Ano/Mês (ex: 2025-09)
      const rawAnoMes = docGenerico._norm_anomes || docGenerico.anomes;
      const displayAnoMes = rawAnoMes
        ? toYYYYDashMM(normalizeYYYYMM(rawAnoMes))
        : "";

      return (
        <>
          <td className="px-4 py-2 text-left">{displayAnoMes}</td>
        </>
      );
    }
  };

  const renderTableHeader = () => {
    if (tipoDocumento === "holerite") {
      return (
        <>
          <th className="px-4 py-3 text-left min-w-[120px]">Ano/mês</th>
          <th className="py-3 text-center min-w-[100px]">Lote</th>
          <th className="px-10 py-3 text-right min-w-[100px]">Ações</th>
        </>
      );
    } else if (tipoDocumento === "beneficios") {
      return (
        <>
          <th className="px-4 py-3 text-left min-w-[120px]">Ano/mês</th>
          <th className="py-3 text-center min-w-[100px]">Lote</th>
          <th className="px-10 py-3 text-right min-w-[100px]">Ações</th>
        </>
      );
    } else {
      return (
        <>
          <th className="px-4 py-3 text-left min-w-[120px]">
            {isTrct ? "Ano" : "Ano/mês"}
          </th>
          <th className="px-10 py-3 text-right min-w-[100px]">Ações</th>
        </>
      );
    }
  };

  const showCardLoader =
    userLoading ||
    meLoading ||
    isLoading ||
    isLoadingCompetencias ||
    isLoadingCompetenciasGen ||
    isLoadingCompetenciasBen ||
    !!loadingPreviewId;

  // ================================================
  // UI
  // ================================================
  const showDiscoveryFlow = !user?.gestor && tipoDocumento === "holerite";
  const showDiscoveryFlowBeneficios =
    !user?.gestor && tipoDocumento === "beneficios";
  const showDiscoveryFlowGenerico =
    !user?.gestor &&
    tipoDocumento !== "holerite" &&
    tipoDocumento !== "beneficios";
  const gestorGridCols =
    tipoDocumento === "holerite" || tipoDocumento === "beneficios"
      ? "sm:grid-cols-4"
      : "sm:grid-cols-4";

  const BTN =
    "border border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_3px_80px_rgba(0,0,0,0.35)] disabled:bg-muted disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />
      <Toaster richColors />

      <div className="fixed inset-0 -z-10 pointer-events-none bg-[#eaf6ee] dark:bg-[#07160c]" />
      <div
        className="fixed inset-0 -z-10 pointer-events-none
  bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.22),rgba(234,246,238,0))]
  dark:bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.18),rgba(7,22,12,0))]"
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none
  bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.16),rgba(234,246,238,0))]
  dark:bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.14),rgba(7,22,12,0))]"
      />

      <main className="relative z-10 flex flex-col flex-grow items-center pt-32 px-4 pb-10">
        {/* card roxo (agora relative para o loader interno) */}
        <div
          className="relative w-full max-w-6xl rounded-2xl p-6 backdrop-blur-md
  bg-background/85 dark:bg-background/75
  text-foreground border border-border
  shadow-[0_22px_70px_rgba(0,0,0,0.20)]"
        >
          {/* loader cobrindo apenas o card */}
          {showCardLoader && (
            <LoadingScreen
              variant="container"
              message="Carregando..."
              subtext="Preparando seus dados."
            />
          )}

          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="mb-4 border-border bg-background/70 text-foreground hover:bg-accent"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <h2 className="text-xl font-extrabold mb-6 text-center text-foreground">
            {tipoDocumento === "holerite"
              ? "Holerite"
              : tipoDocumento === "beneficios"
                ? "Benefícios"
                : `Buscar ${nomeDocumento}`}
          </h2>

          {/* ===================== DISCOVERY (NÃO GESTOR / HOLERITE) ===================== */}
          {showDiscoveryFlow ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* ESQUERDA — EMPRESA */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Empresa
                  </h3>
                  {!selectedEmpresaId ? (
                    empresasUnicas.length === 0 ? (
                      <p className="text-center text-muted-foreground">
                        Nenhuma empresa encontrada.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {empresasUnicas.map((e) => (
                          <Button
                            key={e.id}
                            variant="default"
                            title={e.nome}
                            className="w-full h-11 min-w-0 text-white bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 shadow-[0_10px_24px_rgba(47,161,70,0.18)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedEmpresaId(e.id);
                              setSelectedEmpresaNome(e.nome);
                              setSelectedMatricula(null);
                              setCompetencias([]);
                              setSelectedYear(null);
                              setDocuments([]);
                              setPaginaAtual(1);
                              lastFetchKeyRef.current = null;
                              setCompetenciasHoleriteLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{e.nome}</span>
                              {e.qtdMatriculas > 1 && (
                                <span className="ml-1 shrink-0 text-xs opacity-90 bg-black/20 rounded px-2 py-0.5">
                                  {e.qtdMatriculas} matr.
                                </span>
                              )}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground text-center">
                        Selecionada:{" "}
                        <span className="font-semibold text-foreground">
                          {selectedEmpresaNome}
                        </span>
                      </div>
                      <Button
                        variant="default"
                        className={`w-full h-10 ${BTN}`}
                        onClick={() => {
                          setSelectedEmpresaId(null);
                          setSelectedEmpresaNome(null);
                          setSelectedMatricula(null);
                          setCompetencias([]);
                          setSelectedYear(null);
                          setDocuments([]);
                          setPaginaAtual(1);
                          setCompetenciasHoleriteLoaded(false);
                        }}
                        disabled={isAnyLoading}
                      >
                        Trocar empresa
                      </Button>
                    </div>
                  )}
                </section>

                {/* ====== DIREITA — MATRÍCULA ====== */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Matrícula
                  </h3>

                  {requerEscolherMatricula ? (
                    !selectedMatricula ? (
                      <div
                        className="grid grid-cols-1 gap-2 overflow-y-auto pr-1"
                        style={{ maxHeight: "148px" }}
                      >
                        {matriculasDaEmpresaSelecionada.map((m) => (
                          <Button
                            key={m}
                            variant="default"
                            className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedMatricula(m);
                              setCompetenciasHoleriteLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            Matrícula {m}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground text-center">
                          Selecionada:{" "}
                          <span className="font-semibold text-foreground">
                            {selectedMatricula}
                          </span>
                        </div>
                        <Button
                          variant="default"
                          className={`w-full h-10 ${BTN}`}
                          onClick={() => {
                            setSelectedMatricula(null);
                            setCompetencias([]);
                            setSelectedYear(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                            lastFetchKeyRef.current = null;
                            setCompetenciasHoleriteLoaded(false);
                          }}
                          disabled={isAnyLoading}
                        >
                          Trocar matrícula
                        </Button>
                      </div>
                    )
                  ) : !selectedEmpresaId ? (
                    <p className="text-sm text-muted-foreground text-center">
                      Selecione uma empresa acima.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        variant="default"
                        disabled
                        className="w-full h-11 bg-green-600 opacity-70 cursor-not-allowed"
                      >
                        Matrícula {matriculasDaEmpresaSelecionada[0]}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Selecionada automaticamente (empresa com uma única
                        matrícula).
                      </p>
                    </div>
                  )}
                </section>

                {/* ANOS & MESES */}
                <section className="md:col-span-2 bg-card/70 border border-border text-card-foreground rounded-xl p-4 mb-5 m-3 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Períodos (anos e meses)
                  </h3>

                  {!selectedEmpresaId ? (
                    <p className="text-center text-muted-foreground">
                      Selecione uma empresa para carregar os períodos.
                    </p>
                  ) : requerEscolherMatricula && !selectedMatricula ? (
                    <p className="text-center text-muted-foreground">
                      Selecione a matrícula para carregar os períodos.
                    </p>
                  ) : isLoadingCompetencias || !competenciasHoleriteLoaded ? (
                    <p className="text-center text-muted-foreground">
                      Carregando períodos disponíveis...
                    </p>
                  ) : anosDisponiveis.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      Nenhum período de holerite encontrado para a seleção
                      atual.
                    </p>
                  ) : !selectedYear ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {anosDisponiveis.map((ano) => (
                        <Button
                          key={ano}
                          variant="default"
                          className="w-full h-11 bg-green-600 hover:bg-green-700 hover:shadow-[0_3px_80px_rgba(0,0,0,0.35)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                          onClick={() => setSelectedYear(ano)}
                          disabled={isAnyLoading}
                        >
                          {ano}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {mesesDoAnoSelecionado.map((mm) => (
                          <Button
                            key={mm}
                            variant="default"
                            className="w-full h-11 bg-green-600 hover:bg-green-700 hover:shadow-[0_3px_80px_rgba(0,0,0,0.35)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() =>
                              buscarHoleritePorAnoMes(selectedYear, mm)
                            }
                            disabled={isAnyLoading}
                          >
                            {isAnyLoading
                              ? "Buscando..."
                              : makeYYYYMMLabel(selectedYear, mm)}
                          </Button>
                        ))}
                      </div>

                      <div className="flex justify-center mt-2">
                        <Button
                          variant="default"
                          className="border border-border bg-card/60 text-foreground hover:bg-accent disabled:bg-muted disabled:cursor-not-allowed"
                          onClick={() => {
                            setSelectedYear(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                            setHoleritesOpcoes([]);
                          }}
                          disabled={isAnyLoading}
                        >
                          Escolher outro ano
                        </Button>
                      </div>

                      {holeritesOpcoes.length > 0 && (
                        <div className="mt-4 border-t border-border pt-4">
                          <h4 className="text-sm font-semibold text-foreground mb-3 text-center">
                            Selecione o documento
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {holeritesOpcoes.map((h) => (
                              <Button
                                key={
                                  h.uuid || `${h.id_documento}-${h.descricao}`
                                }
                                variant="default"
                                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 hover:shadow-[0_3px_80px_rgba(0,0,0,0.35)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                                onClick={() => visualizarDocumento(h)}
                                disabled={isAnyLoading}
                                title={h.descricao}
                              >
                                {h.descricao || "Documento"}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </>
          ) : showDiscoveryFlowBeneficios ? (
            // ===================== DISCOVERY (NÃO GESTOR / BENEFÍCIOS) =====================
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* EMPRESA (BEN) */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Empresa
                  </h3>
                  {!selectedEmpresaIdGen ? (
                    empresasUnicas.length === 0 ? (
                      <p className="text-center text-muted-foreground">
                        Nenhuma empresa encontrada.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {empresasUnicas.map((e) => (
                          <Button
                            key={e.id}
                            variant="default"
                            title={e.nome}
                            className="w-full h-11 min-w-0 text-white bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 shadow-[0_10px_24px_rgba(47,161,70,0.18)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedEmpresaIdGen(e.id);
                              setSelectedEmpresaNomeGen(e.nome);
                              setSelectedMatriculaGen(null);
                              setCompetenciasBen([]);
                              setSelectedYearBen(null);
                              setDocuments([]);
                              setPaginaAtual(1);
                              setCompetenciasBenLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{e.nome}</span>
                              {e.qtdMatriculas > 1 && (
                                <span className="ml-1 shrink-0 text-xs opacity-90 bg-black/20 rounded px-2 py-0.5">
                                  {e.qtdMatriculas} matr.
                                </span>
                              )}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground text-center">
                        Selecionada:{" "}
                        <span className="font-semibold text-foreground">
                          {selectedEmpresaNomeGen}
                        </span>
                      </div>
                      <Button
                        variant="default"
                        className={`w-full h-10 ${BTN}`}
                        onClick={() => {
                          setSelectedEmpresaIdGen(null);
                          setSelectedEmpresaNomeGen(null);
                          setSelectedMatriculaGen(null);
                          setCompetenciasBen([]);
                          setSelectedYearBen(null);
                          setDocuments([]);
                          setPaginaAtual(1);
                          setCompetenciasBenLoaded(false);
                        }}
                        disabled={isAnyLoading}
                      >
                        Trocar empresa
                      </Button>
                    </div>
                  )}
                </section>

                {/* ====== DIREITA — MATRÍCULA (BEN) ====== */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Matrícula
                  </h3>

                  {requerEscolherMatriculaGen ? (
                    !selectedMatriculaGen ? (
                      <div
                        className="grid grid-cols-1 gap-2 overflow-y-auto pr-1"
                        style={{ maxHeight: "148px" }}
                      >
                        {matriculasDaEmpresaSelecionadaGen.map((m) => (
                          <Button
                            key={m}
                            variant="default"
                            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedMatriculaGen(m);
                              setCompetenciasBen([]);
                              setSelectedYearBen(null);
                              setCompetenciasBenLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            Matrícula {m}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground text-center">
                          Selecionada:{" "}
                          <span className="font-semibold text-foreground">
                            {selectedMatriculaGen}
                          </span>
                        </div>
                        <Button
                          variant="default"
                          className={`w-full h-10 ${BTN}`}
                          onClick={() => {
                            setSelectedMatriculaGen(null);
                            setCompetenciasBen([]);
                            setSelectedYearBen(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                            setCompetenciasBenLoaded(false);
                          }}
                          disabled={isAnyLoading}
                        >
                          Trocar matrícula
                        </Button>
                      </div>
                    )
                  ) : selectedEmpresaIdGen ? (
                    <div className="space-y-2">
                      <Button
                        variant="default"
                        disabled
                        className="w-full h-11 bg-primary text-primary-foreground opacity-70 cursor-not-allowed"
                      >
                        Matrícula {matriculasDaEmpresaSelecionadaGen[0]}
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Selecionada automaticamente (empresa com uma única
                        matrícula).
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      Selecione uma empresa acima.
                    </p>
                  )}
                </section>

                {/* ANOS & MESES (BEN) */}
                <section className="md:col-span-2 bg-card/70 border border-border rounded-xl p-4 mb-5 m-3 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Períodos (anos e meses)
                  </h3>
                  {!selectedEmpresaIdGen ? (
                    <p className="text-center text-muted-foreground">
                      Selecione uma empresa para carregar os períodos.
                    </p>
                  ) : requerEscolherMatriculaGen && !selectedMatriculaGen ? (
                    <p className="text-center text-muted-foreground">
                      Selecione a matrícula para carregar os períodos.
                    </p>
                  ) : isLoadingCompetenciasBen || !competenciasBenLoaded ? (
                    <p className="text-center">
                      Carregando períodos disponíveis...
                    </p>
                  ) : anosDisponiveisBen.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      Nenhum período de benefícios encontrado para a seleção
                      atual.
                    </p>
                  ) : !selectedYearBen ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {anosDisponiveisBen.map((ano) => (
                        <Button
                          key={ano}
                          variant="default"
                          className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                          onClick={() => setSelectedYearBen(ano)}
                          disabled={isAnyLoading}
                        >
                          {ano}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {mesesDoAnoSelecionadoBen.map((mm) => (
                          <Button
                            key={mm}
                            variant="default"
                            className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() =>
                              buscarBeneficiosPorAnoMes(selectedYearBen, mm)
                            }
                            disabled={isAnyLoading}
                          >
                            {isAnyLoading
                              ? "Buscando..."
                              : makeYYYYMMLabel(selectedYearBen, mm)}
                          </Button>
                        ))}
                      </div>
                      <div className="flex justify-center">
                        <Button
                          variant="default"
                          className="border border-border bg-card/60 text-foreground hover:bg-accent disabled:bg-muted disabled:cursor-not-allowed"
                          onClick={() => {
                            setSelectedYearBen(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                          }}
                          disabled={isAnyLoading}
                        >
                          Escolher outro ano
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </>
          ) : showDiscoveryFlowGenerico ? (
            // ===================== DISCOVERY (NÃO GESTOR / GENÉRICOS) =====================
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* EMPRESA (GEN) */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Empresa
                  </h3>
                  {!selectedEmpresaIdGen ? (
                    empresasUnicas.length === 0 ? (
                      <p className="text-center text-muted-foreground">
                        Nenhuma empresa encontrada.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {empresasUnicas.map((e) => (
                          <Button
                            key={e.id}
                            variant="default"
                            title={e.nome}
                            className="w-full h-11 min-w-0 text-white bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 shadow-[0_10px_24px_rgba(47,161,70,0.18)] disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedEmpresaIdGen(e.id);
                              setSelectedEmpresaNomeGen(e.nome);
                              setSelectedMatriculaGen(null);
                              setCompetenciasGen([]);
                              setSelectedYearGen(null);
                              setDocuments([]);
                              setPaginaAtual(1);
                              setCompetenciasGenLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{e.nome}</span>
                              {e.qtdMatriculas > 1 && (
                                <span className="ml-1 shrink-0 text-xs opacity-90 bg-black/20 rounded px-2 py-0.5">
                                  {e.qtdMatriculas} matr.
                                </span>
                              )}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground text-center">
                        Selecionada:{" "}
                        <span className="font-semibold text-foreground">
                          {selectedEmpresaNomeGen}
                        </span>
                      </div>
                      <Button
                        variant="default"
                        className={`w-full h-10 ${BTN}`}
                        onClick={() => {
                          setSelectedEmpresaIdGen(null);
                          setSelectedEmpresaNomeGen(null);
                          setSelectedMatriculaGen(null);
                          setCompetenciasGen([]);
                          setSelectedYearGen(null);
                          setDocuments([]);
                          setPaginaAtual(1);
                          setCompetenciasGenLoaded(false);
                        }}
                        disabled={isAnyLoading}
                      >
                        Trocar empresa
                      </Button>
                    </div>
                  )}
                </section>

                {/* ====== DIREITA — MATRÍCULA (GEN) ====== */}
                <section className="bg-card/70 border border-border text-card-foreground rounded-xl p-4 m-3 h-full flex flex-col shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Matrícula
                  </h3>

                  {requerEscolherMatriculaGen ? (
                    !selectedMatriculaGen ? (
                      <div
                        className="grid grid-cols-1 gap-2 overflow-y-auto pr-1"
                        style={{ maxHeight: "148px" }}
                      >
                        {matriculasDaEmpresaSelecionadaGen.map((m) => (
                          <Button
                            key={m}
                            variant="default"
                            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed"
                            onClick={() => {
                              setSelectedMatriculaGen(m);
                              setCompetenciasGen([]);
                              setSelectedYearGen(null);
                              setCompetenciasGenLoaded(false);
                            }}
                            disabled={isAnyLoading}
                          >
                            Matrícula {m}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground text-center">
                          Selecionada:{" "}
                          <span className="font-semibold text-foreground">
                            {selectedMatriculaGen}
                          </span>
                        </div>
                        <Button
                          variant="default"
                          className={`w-full h-10 ${BTN}`}
                          onClick={() => {
                            setSelectedMatriculaGen(null);
                            setCompetenciasGen([]);
                            setSelectedYearGen(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                            setCompetenciasGenLoaded(false);
                          }}
                          disabled={isAnyLoading}
                        >
                          Trocar matrícula
                        </Button>
                      </div>
                    )
                  ) : selectedEmpresaIdGen ? (
                    <div className="space-y-2">
                      <Button
                        variant="default"
                        disabled
                        className="w-full h-11 bg-primary text-primary-foreground opacity-70 cursor-not-allowed"
                      >
                        Matrícula {matriculasDaEmpresaSelecionadaGen[0]}
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Selecionada automaticamente (empresa com uma única
                        matrícula).
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      Selecione uma empresa acima.
                    </p>
                  )}
                </section>

                {/* ANOS & MESES (GEN) */}
                <section className="md:col-span-2 bg-card/70 border border-border rounded-xl p-4 mb-5 m-3 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
                    Períodos (anos e meses)
                  </h3>
                  {!selectedEmpresaIdGen ? (
                    <p className="text-center text-muted-foreground">
                      Selecione uma empresa para carregar os períodos.
                    </p>
                  ) : requerEscolherMatriculaGen && !selectedMatriculaGen ? (
                    <p className="text-center text-muted-foreground">
                      Selecione a matrícula para carregar os períodos.
                    </p>
                  ) : isLoadingCompetenciasGen || !competenciasGenLoaded ? (
                    <p className="text-center">
                      Carregando períodos disponíveis...
                    </p>
                  ) : anosDisponiveisGen.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      Nenhum período de {nomeDocumento} encontrado para a
                      seleção atual.
                    </p>
                  ) : isTrct ? (
                    // 🔹 CASO TRCT: só lista ANOS e já busca direto
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {anosDisponiveisGen.map((ano) => (
                        <Button
                          key={ano}
                          variant="default"
                          className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                          onClick={() => buscarGenericoPorAnoMes(ano, "01")}
                          disabled={isAnyLoading}
                        >
                          {isAnyLoading ? "Buscando..." : ano}
                        </Button>
                      ))}
                    </div>
                  ) : !selectedYearGen ? (
                    // 🔹 demais documentos genéricos → fluxo padrão (Ano → escolher mês)
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {anosDisponiveisGen.map((ano) => (
                        <Button
                          key={ano}
                          variant="default"
                          className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                          onClick={() => setSelectedYearGen(ano)}
                          disabled={isAnyLoading}
                        >
                          {ano}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {mesesDoAnoSelecionadoGen.map((mm) => (
                          <Button
                            key={mm}
                            variant="default"
                            className="w-full h-11 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={() =>
                              buscarGenericoPorAnoMes(selectedYearGen, mm)
                            }
                            disabled={isAnyLoading}
                          >
                            {isAnyLoading
                              ? "Buscando..."
                              : makeYYYYMMLabel(selectedYearGen, mm)}
                          </Button>
                        ))}
                      </div>
                      <div className="flex justify-center">
                        <Button
                          variant="default"
                          className="border border-border bg-card/60 text-foreground hover:bg-accent disabled:bg-muted disabled:cursor-not-allowed"
                          onClick={() => {
                            setSelectedYearGen(null);
                            setDocuments([]);
                            setPaginaAtual(1);
                          }}
                          disabled={isAnyLoading}
                        >
                          Escolher outro ano
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </>
          ) : (
            // ===================== FLUXO (GESTOR) =====================
            <>
              {user?.gestor ? (
                <div
                  className={`w-fit mx-auto grid gap-4 ${gestorGridCols} mb-6`}
                >
                  {/* CPF para gestor */}
                  <div className="flex flex-col">
                    <input
                      type="text"
                      placeholder="CPF"
                      required
                      className={`bg-white/80 text-[#0b2b14] placeholder:text-[#2f4f38]/60 border p-2 rounded
  ${cpfError ? "border-red-500" : "border-[#cfe8d8]"}
  ${isAnyLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                      value={cpf}
                      onChange={handleCpfChange}
                      maxLength={14}
                      disabled={isAnyLoading}
                    />
                    {cpfError && (
                      <span className="text-red-400 text-xs mt-1">
                        {cpfError}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Matrícula"
                    className={`bg-white/80 text-[#0b2b14] placeholder:text-[#2f4f38]/60 border border-[#cfe8d8] p-2 rounded
  ${isAnyLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    disabled={isAnyLoading}
                  />
                  <div className="w-full max-w-xs">
                    <CustomMonthPicker
                      value={anomes}
                      onChange={setAnomes}
                      placeholder="Selecionar período"
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      if (!anomes) {
                        toast.error("Período obrigatório", {
                          description:
                            "Por favor, selecione um período antes de buscar.",
                        });
                        return;
                      }

                      const cpfNumbers = getCpfNumbers(cpf || "");
                      if (tipoDocumento !== "holerite") {
                        if (!trimStr(matricula)) {
                          toast.error("Matrícula obrigatória", {
                            description: "Informe a matrícula para continuar.",
                          });
                          return;
                        }
                        if (
                          !cpfNumbers ||
                          cpfNumbers.length !== 11 ||
                          !validateCPF(cpf)
                        ) {
                          toast.error("CPF inválido", {
                            description: "Informe um CPF válido (11 dígitos).",
                          });
                          return;
                        }
                      } else {
                        if (cpfNumbers && !validateCPF(cpf)) {
                          toast.error("CPF inválido", {
                            description:
                              "Por favor, informe um CPF válido com 11 dígitos.",
                          });
                          return;
                        }
                        if (!cpfNumbers && !trimStr(matricula)) {
                          toast.error("CPF ou Matrícula obrigatório", {
                            description:
                              "Para gestores, informe pelo menos o CPF ou a matrícula.",
                          });
                          return;
                        }
                      }

                      setIsLoading(true);

                      try {
                        if (tipoDocumento === "holerite") {
                          const payload = {
                            cpf:
                              onlyDigits(getCpfNumbers(cpf.trim())) ||
                              onlyDigits((user as any)?.cpf || ""),
                            matricula: trimStr(matricula),
                            competencia: normalizeYYYYMM(
                              formatCompetencia(anomes),
                            ),
                          };

                          const res = await api.post<{
                            competencia_utilizada: string;
                            holerites: never[];
                            cabecalho: CabecalhoHolerite;
                            eventos: EventoHolerite[];
                            rodape: RodapeHolerite;
                          }>("/documents/holerite/buscar", payload);

                          if (res.data && res.data.cabecalho) {
                            const competenciaYYYYMM = normalizeYYYYMM(
                              res.data.cabecalho.competencia ||
                                formatCompetencia(anomes),
                            );

                            const docs: DocumentoHolerite[] = (
                              res.data?.holerites ?? []
                            ).map((h: any) => ({
                              id_documento: String(
                                h?.cabecalho?.lote ?? h?.rodape?.lote ?? "1",
                              ),
                              anomes: normalizeYYYYMM(
                                res.data?.competencia_utilizada ??
                                  competenciaYYYYMM,
                              ),

                              uuid: h?.uuid ?? h?.cabecalho?.uuid,
                              pagamento: h?.cabecalho?.pagamento,
                              tipo_calculo:
                                h?.tipo_calculo ?? h?.cabecalho?.tipo_calculo,
                              descricao: h?.descricao,
                            }));

                            setDocuments(docs);

                            sessionStorage.setItem(
                              "holeriteData",
                              JSON.stringify(res.data),
                            );
                            toast.success("Holerite encontrado!", {
                              description: `Documento do período ${toYYYYDashMM(
                                documents[0]?.anomes,
                              )} localizado.`,
                            });
                          } else {
                            setDocuments([]);
                            toast.warning("Nenhum holerite encontrado", {
                              description:
                                "Não foi localizado holerite para o período informado.",
                            });
                          }
                        } else if (tipoDocumento === "beneficios") {
                          const payload = {
                            cpf: onlyDigits(cpfNumbers),
                            matricula: trimStr(matricula),
                            competencia: normalizeYYYYMM(
                              formatCompetencia(anomes),
                            ),
                          };

                          const res = await api.post<{
                            cpf?: string;
                            matricula?: string | number;
                            competencia?: string;
                            cabecalho?: {
                              lote?: number;
                              uuid?: string;
                              [k: string]: any;
                            };
                            beneficios?: any[];
                            uuid?: string; // fallback
                          }>("/documents/beneficios/buscar", payload);

                          const cab = getCabecalhoNormalized(res.data);

                          const lista = Array.isArray(
                            (res.data as any)?.beneficios,
                          )
                            ? (res.data as any).beneficios
                            : [];

                          const hasCabecalho =
                            !!cab && Object.keys(cab || {}).length > 0;
                          const hasBeneficios = lista.length > 0;

                          if (hasCabecalho || hasBeneficios) {
                            const competenciaYYYYMM = normalizeYYYYMM(
                              res.data.competencia || payload.competencia,
                            );

                            const loteDoc =
                              (cab?.lote as number | undefined) ??
                              (lista.length
                                ? (lista[0]?.lote as number | undefined)
                                : undefined) ??
                              1;

                            const documento = {
                              id_documento: String(loteDoc),
                              anomes: competenciaYYYYMM,

                              // >>> ADIÇÕES IMPORTANTES para preview:
                              cpf: String(payload.cpf),
                              matricula: String(payload.matricula),
                              competencia: String(competenciaYYYYMM),

                              // >>> armazenar dados para evitar nova busca no preview
                              cabecalho: cab,
                              beneficios: lista,

                              // >>> opcional: manter uuid no doc (ajuda no montar)
                              uuid: cab?.uuid ?? (res.data as any)?.uuid,
                            };

                            setDocuments([documento as any]);
                            sessionStorage.setItem(
                              "beneficiosData",
                              JSON.stringify(res.data),
                            );

                            toast.success("Benefícios encontrados!", {
                              description: `Documento do período ${toYYYYDashMM(
                                competenciaYYYYMM,
                              )} localizado.`,
                            });
                          } else {
                            setDocuments([]);
                            toast.warning("Nenhum benefício encontrado", {
                              description:
                                "Não foi localizado documento de benefícios para o período informado.",
                            });
                          }
                        } else {
                          const cp = [
                            { nome: "tipodedoc", valor: nomeDocumento },
                            { nome: "matricula", valor: trimStr(matricula) },
                            {
                              nome: "colaborador",
                              valor: onlyDigits(cpfNumbers),
                            },
                          ];

                          const payload = {
                            id_template: Number(templateId),
                            cp,
                            campo_anomes: "anomes",
                            anomes: anomes.includes("/")
                              ? `${anomes.split("/")[1]}-${anomes
                                  .split("/")[0]
                                  .padStart(2, "0")}`
                              : anomes.length === 6
                                ? `${anomes.slice(0, 4)}-${anomes.slice(4, 6)}`
                                : anomes,
                            cpf: onlyDigits(cpfNumbers),
                          };

                          // [NOVO - TRCT] – se for Informe/TRTC, muda a rota
                          const endpoint = isTrct
                            ? "/documents/search/informetrct"
                            : isRecibo
                              ? "/documents/search/recibos"
                              : "/documents/search";

                          const res = await api.post<{
                            total_bruto: number;
                            ultimos_6_meses: string[];
                            total_encontrado: number;
                            documentos: DocumentoGenerico[];
                          }>(endpoint, payload);

                          const { documentos = [], total_encontrado = 0 } =
                            res.data;
                          setDocuments(documentos);

                          const qtd =
                            typeof total_encontrado === "number"
                              ? total_encontrado
                              : documentos.length;

                          if (qtd > 0) {
                            toast.success(
                              `${qtd} documento(s) encontrado(s)!`,
                              {
                                description: `Foram localizados ${qtd} documentos do tipo ${nomeDocumento}.`,
                              },
                            );
                          } else {
                            toast.warning("Nenhum documento encontrado", {
                              description:
                                "Não foram localizados documentos do tipo ${nomeDocumento} para os critérios informados.",
                            });
                          }
                        }

                        setPaginaAtual(1);
                      } catch (err: any) {
                        setDocuments([]);

                        const description = extractErrorMessage(
                          err,
                          "Erro ao buscar documentos.",
                        );
                        const status = err?.response?.status;

                        switch (status) {
                          case 401:
                            toast.error("Não autorizado", {
                              description:
                                "Sua sessão expirou. Faça login novamente.",
                              action: {
                                label: "Ir para login",
                                onClick: () => navigate("/login"),
                              },
                            });
                            break;
                          case 403:
                            toast.error("Acesso negado", { description });
                            break;
                          case 404:
                            toast.error("Documento não encontrado", {
                              description,
                            });
                            break;
                          case 500:
                            toast.error("Erro interno do servidor", {
                              description:
                                "Ocorreu um problema no servidor. Tente novamente em alguns minutos.",
                              action: {
                                label: "Tentar novamente",
                                onClick: () => window.location.reload(),
                              },
                            });
                            break;
                          default:
                            toast.error("Erro ao buscar documentos", {
                              description,
                              action: {
                                label: "Tentar novamente",
                                onClick: () => window.location.reload(),
                              },
                            });
                        }
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isAnyLoading || !anomes || (!!cpf && !!cpfError)}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed p-5"
                  >
                    {isAnyLoading ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {/* TABELA: SOMENTE para gestor */}
          {user?.gestor ? (
            <div className="overflow-x-auto border border-[#cfe8d8] rounded-xl bg-white/70">
              <table className="w-full text-sm text-left text-[#0b2b14]">
                <thead className="bg-[#e9f8ef] text-xs uppercase text-[#2f4f38]/80">
                  <tr>{renderTableHeader()}</tr>
                </thead>
                <tbody>
                  {documentosVisiveis.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          tipoDocumento === "holerite" ||
                          tipoDocumento === "beneficios"
                            ? 3
                            : 2
                        }
                        className="text-center py-4 text-[#2f4f38]/60"
                      >
                        Nenhum documento encontrado.
                      </td>
                    </tr>
                  ) : (
                    documentosVisiveis.map((doc) => (
                      <tr
                        key={doc.id_documento}
                        className="border-t border-[#d8efe0] hover:bg-[#f2fbf5] transition-colors"
                      >
                        {renderDocumentInfo(doc)}
                        <td className="px-4 py-2 text-right">
                          <Button
                            onClick={() => visualizarDocumento(doc)}
                            disabled={
                              isAnyLoading ||
                              loadingPreviewId === doc.id_documento
                            }
                            className="bg-gradient-to-r from-[#25601d] to-[#2fa146] hover:opacity-95 text-white px-3 py-1.5 text-sm rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingPreviewId === doc.id_documento
                              ? "Abrindo..."
                              : "Visualizar"}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {user?.gestor && totalPaginas > 1 && (
            <div className="flex justify-center mt-6 w-full overflow-x-auto px-2">
              <Pagination>
                <PaginationContent className="flex flex-wrap justify-center gap-1">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                      className={
                        paginaAtual === 1 || isAnyLoading
                          ? "pointer-events-none opacity-50"
                          : "hover:bg-gray-700 cursor-pointer"
                      }
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(
                    (p) => (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={paginaAtual === p}
                          onClick={() => setPaginaAtual(p)}
                          className={
                            isAnyLoading
                              ? "pointer-events-none opacity-50"
                              : "hover:bg-gray-700 cursor-pointer"
                          }
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setPaginaAtual((p) => Math.min(totalPaginas, p + 1))
                      }
                      className={
                        paginaAtual === totalPaginas || isAnyLoading
                          ? "pointer-events-none opacity-50"
                          : "hover:bg-gray-700 cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
function dbgGroupEnd() {
  console.groupEnd();
}
