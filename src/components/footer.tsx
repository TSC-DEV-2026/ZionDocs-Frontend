import { useTheme } from "@/components/ui/useTheme";

export default function Footer() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <footer
      className={[
        "py-8 px-6 sm:px-10",
        "border-t",
        isDark ? "border-white/10" : "border-[#76b986]",
        // continua verde nos dois, só ajusta transparência/contraste
        isDark ? "bg-[#0f944680] text-white" : "bg-[#0f9446a2] text-black",
      ].join(" ")}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col justify-between items-center">
          <h2 className="text-2xl font-bold mb-3">SuperRH</h2>
          <p
            className={[
              "text-sm leading-relaxed text-center",
              isDark ? "text-white/85" : "text-black",
            ].join(" ")}
          >
            Conectando colaboradores ao RH com tecnologia, transparência e agilidade.
          </p>
        </div>
      </div>

      <div
        className={[
          "mt-10 pt-4 text-center border-t",
          isDark ? "border-white/15" : "border-black/20",
        ].join(" ")}
      >
        <p className={["text-sm", isDark ? "text-white/85" : "text-black"].join(" ")}>
          © {new Date().getFullYear()} SuperRH. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}