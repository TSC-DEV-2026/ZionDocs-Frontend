"use client";

import avatar from "@/assets/Avatar de Recepição.png";
import logoAst from "@/assets/AST.jpg.jpeg";
import logoWecan from "@/assets/WCBR.jpg.jpeg";

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import LoadingScreen from "@/components/ui/loadingScreen";
import api from "@/utils/axiosInstance";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import Cookies from "js-cookie";
import { useTheme } from "@/components/ui/useTheme";

interface Documento {
  id: number;
  nome: string;
}

interface TemplateGED {
  id_tipo: string;
}

const AST_CLIENTES = new Set<string>(["6685", "6862", "6683"]);
const WECAN_CLIENTES = new Set<string>([
  "14002",
  "14003",
  "5238",
  "123",
  "6852",
  "6689",
]);

function getClienteCode(user: any): string | null {
  const direct = user?.cliente;
  if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
    return String(direct).trim();
  }

  const fromDados = user?.dados?.[0]?.id;
  if (
    fromDados !== undefined &&
    fromDados !== null &&
    String(fromDados).trim() !== ""
  ) {
    return String(fromDados).trim();
  }

  return null;
}

function getClientLogo(user: any): { src: string; alt: string } | null {
  const code = getClienteCode(user);
  if (!code) return null;

  if (AST_CLIENTES.has(code)) return { src: logoAst, alt: "AST" };
  if (WECAN_CLIENTES.has(code)) return { src: logoWecan, alt: "WE CAN" };

  return null;
}

function ClientLogoAboveDocs({ src, alt }: { src: string; alt: string }) {
  const isWecan = alt === "WE CAN";

  const cardSize = isWecan
    ? "h-24 w-[360px] sm:h-28 sm:w-[440px]"
    : "h-20 w-[420px] sm:h-24 sm:w-[520px]";

  const title = isWecan ? "WE CAN BR" : "AST";
  const subtitle = isWecan ? "RECURSOS HUMANOS" : "FACILITIES";

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      <div className="flex items-center justify-center pb-8">
        <div
          className={[
            "overflow-hidden rounded-lg",
            "bg-white/10 backdrop-blur-sm",
            "ring-1 ring-[#77b66c]/20",
            "shadow-[0_12px_30px_rgba(0,0,0,0.30)]",
            "flex items-center justify-between",
            "px-4",
            cardSize,
          ].join(" ")}
          title={alt}
          aria-label={`Cliente ${alt}`}
        >
          <div className="h-full flex items-center justify-center shrink-0">
            <img
              src={src}
              alt={alt}
              className="h-full w-auto object-contain p-3"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>

          <div className="flex flex-col items-end justify-center text-right pr-2 leading-tight">
            <div className="text-white font-extrabold tracking-wide text-lg sm:text-xl">
              {title}
            </div>
            <div className="text-white/80 font-semibold tracking-[0.18em] text-[11px] sm:text-xs">
              {subtitle}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [, setTemplates] = useState<TemplateGED[]>([]);
  const [listsLoaded, setListsLoaded] = useState(false);

  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: userLoading } = useUser();
  const { theme } = useTheme();

  useEffect(() => {
    document.title = "Portal do funcionário";
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (userLoading) return;

    const controller = new AbortController();
    setListsLoaded(false);

    (async () => {
      try {
        const shouldFetchTemplates =
          (Cookies.get("is_sapore") || "").toLowerCase() === "true";

        if (shouldFetchTemplates) {
          const [resDocs, resTemplates] = await Promise.all([
            api.get<Documento[]>("/documents", { signal: controller.signal }),
            api.get<TemplateGED[]>("/searchdocuments/templates", {
              signal: controller.signal,
            }),
          ]);

          const docsSorted = [...resDocs.data].sort((a, b) =>
            a.nome.localeCompare(b.nome),
          );
          setDocumentos(docsSorted);
          setTemplates(resTemplates.data);
        } else {
          const resDocs = await api.get<Documento[]>("/documents", {
            signal: controller.signal,
          });

          const docsSorted = [...resDocs.data].sort((a, b) =>
            a.nome.localeCompare(b.nome),
          );
          setDocumentos(docsSorted);
          setTemplates([]);
        }

        setListsLoaded(true);
      } catch (error: any) {
        if (
          controller.signal.aborted ||
          error?.code === "ERR_CANCELED" ||
          error?.name === "CanceledError"
        ) {
          return;
        }
        toast.error("Falha ao carregar opções", {
          description:
            "Não foi possível carregar a lista de documentos. Tente novamente.",
        });
        console.warn("Erro ao carregar documentos:", error);
      }
    })();

    return () => controller.abort();
  }, [isAuthenticated, userLoading]);

  const DEFAULT_TEMPLATE_ID = "3";
  const DOC_TEMPLATE_RULES: Array<{ match: (n: string) => boolean; id: string }> =
    [
      {
        match: (n) => /recibo\s*va|vale\s*alimenta(ç|c)[aã]o/i.test(n ?? ""),
        id: "3",
      },
      { match: (n) => /trtc|trct|informe\s*rendimento/i.test(n ?? ""), id: "6" },
    ];

  const getTemplateId = (nomeDocumento: string): string => {
    const rule = DOC_TEMPLATE_RULES.find((r) => r.match(nomeDocumento));
    return rule?.id || DEFAULT_TEMPLATE_ID;
  };

  const getDocumentType = (nomeDocumento: string): string => {
    const nomeLower = (nomeDocumento || "").toLowerCase();

    if (
      nomeLower.includes("holerite") ||
      nomeLower.includes("folha") ||
      nomeLower.includes("pagamento")
    ) {
      return "holerite";
    }

    if (nomeLower.includes("beneficio") || nomeLower.includes("benefícios")) {
      return "beneficios";
    }

    if (
      nomeLower.includes("trtc") ||
      nomeLower.includes("trct") ||
      nomeLower.includes("informe rendimento")
    ) {
      return "trct";
    }

    return "generico";
  };

  const gridCols = useMemo(() => {
    const total = documentos.length;
    if (total <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (total === 3) return "grid-cols-1 sm:grid-cols-3";
    if (total === 4)
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    if (total === 5)
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  }, [documentos]);

  const clientLogo = useMemo(() => {
    if (!isAuthenticated) return null;
    return getClientLogo(user);
  }, [isAuthenticated, user]);

  if (userLoading) return <LoadingScreen />;
  if (isAuthenticated && !listsLoaded) return <LoadingScreen />;

  // ✅ Fundo agora respeita o tema (não “força” claro)
  const isDark = theme === "dark";

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />

      {/* BACKGROUND */}
      {isDark ? (
        <>
          <div className="fixed inset-0 z-0 bg-[#07160f]" />
          <div className="fixed inset-0 z-0 bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.16),rgba(7,22,15,0))]" />
          <div className="fixed inset-0 z-0 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.12),rgba(7,22,15,0))]" />
        </>
      ) : (
        <>
          <div className="fixed inset-0 z-0 bg-[#eaf6ee]" />
          <div className="fixed inset-0 z-0 bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(34,197,94,0.22),rgba(234,246,238,0))]" />
          <div className="fixed inset-0 z-0 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(21,128,61,0.16),rgba(234,246,238,0))]" />
        </>
      )}

      <main className="relative z-10 flex flex-col items-center flex-grow w-full pt-24">
        {isAuthenticated ? (
          <>
            {clientLogo ? (
              <ClientLogoAboveDocs src={clientLogo.src} alt={clientLogo.alt} />
            ) : null}

            <div
              className={`grid justify-center items-center gap-6 w-full max-w-6xl mx-auto px-4 pb-10 ${gridCols}`}
            >
              {documentos.map(({ id, nome }) => {
                const documentType = getDocumentType(nome);
                const templateId = getTemplateId(nome);

                const handleClick = () => {
                  if (documentType === "holerite")
                    navigate("/documentos?tipo=holerite");
                  else if (documentType === "beneficios")
                    navigate("/documentos?tipo=beneficios");
                  else if (documentType === "trct") {
                    navigate(
                      `/documentos?tipo=trct&template=${templateId}&documento=${encodeURIComponent(
                        nome,
                      )}`,
                    );
                  } else {
                    navigate(
                      `/documentos?tipo=generico&template=${templateId}&documento=${encodeURIComponent(
                        nome,
                      )}`,
                    );
                  }
                };

                // ✅ Cards variam levemente no dark (pra não “morrer” no fundo)
                const cardClasses = isDark
                  ? [
                      "bg-gradient-to-b from-[#0e3a26] via-[#0a2d1d] to-[#061a11]",
                      "text-[#f3f3f3] rounded-lg cursor-pointer transition-all",
                      "border border-[#77b66c]/40",
                      "hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)] hover:translate-x-1",
                      "hover:border-[#b7f3c4]/55",
                    ].join(" ")
                  : [
                      "bg-gradient-to-b from-[#0f4a2d] via-[#0b3a24] to-[#072517]",
                      "text-[#f3f3f3] rounded-lg cursor-pointer transition-all",
                      "border border-[#77b66c]/55",
                      "hover:shadow-[0_18px_40px_rgba(0,0,0,0.35)] hover:translate-x-1",
                      "hover:border-[#b7f3c4]/70",
                    ].join(" ");

                return (
                  <div
                    key={id}
                    className={cardClasses}
                    onClick={handleClick}
                  >
                    <div className="flex flex-col items-center justify-center p-6">
                      <FileText size={40} className="mb-2 text-[#eaffef]" />
                      <h3 className="text-lg font-semibold text-center text-[#f6fff8]">
                        {nome}
                      </h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-4 w-full">
            <div
              className={[
                "bg-gradient-to-r from-[#25601d] to-[#2fa146]",
                "text-[#f3f3f3] rounded-xl",
                "shadow-[0_20px_60px_rgba(0,0,0,0.40)]",
                "w-full max-w-4xl p-6 mx-auto",
                "border border-[#2db750]",
              ].join(" ")}
            >
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-4 text-center sm:text-left">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#eaffef] flex-shrink-0">
                  <img
                    src={avatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-bold">
                    SEJA BEM-VINDO ao SuperRH
                  </h1>
                  <p className="text-sm text-[#eaffef]/90">
                    O SuperRH é um novo meio de comunicação entre você e o RH da
                    empresa. Consulte seus documentos, converse com o RH e muito
                    mais.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 w-full mt-auto">
        <Footer />
      </footer>
    </div>
  );
}