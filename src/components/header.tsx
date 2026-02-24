import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BiLogOut } from "react-icons/bi";
import { IoPersonCircle } from "react-icons/io5";
import { RxHamburgerMenu } from "react-icons/rx";
import { HiHome } from "react-icons/hi";
import { Moon, Sun } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useTheme } from "@/components/ui/useTheme";

// ✅ coloque a sua logo (escudo + texto ZionDocs) aqui
import logoZionDocs from "@/assets/Logo.png";

export default function Header() {
  const { user, isAuthenticated, isLoading, logout } = useUser();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const isDark = theme === "dark";

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleGoToLogin = () => {
    navigate("/login", { replace: false });
  };

  const headerClass = [
    "fixed top-0 w-full text-white z-50",
    "bg-gradient-to-r from-[#308425] to-[#2fa146]",
    isDark ? "shadow-[0_18px_45px_rgba(0,0,0,0.55)]" : "shadow-xl",
    isDark ? "border-b border-white/10" : "border-b border-transparent",
  ].join(" ");

  if (isLoading) {
    return (
      <header className={headerClass}>
        <div className="container mx-auto flex items-center justify-between pt-4 pb-4 pl-1">
          <div className="ml-4 flex items-center">
            <span className="h-8 w-40 rounded animate-pulse bg-white/30" />
          </div>

          <div className="flex items-center gap-4 mr-4">
            <span className="h-8 w-24 rounded animate-pulse bg-white/30" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={headerClass}>
      <div className="container mx-auto flex items-center justify-between pt-4 pb-4 pl-1">
        <Link
          to="/"
          className="ml-4 inline-flex items-center focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Ir para início"
        >
          {/* ✅ Logo ZionDocs (escudo + texto) */}
          <div className="bg-white/95 rounded px-5 py-1 flex items-center">
            <img
              src={logoZionDocs}
              alt="ZionDocs"
              className="h-8 w-auto object-contain select-none scale-150 "
              draggable={false}
              loading="eager"
              decoding="async"
            />
          </div>
        </Link>

        <nav className="hidden md:flex space-x-4">
          <Link
            to="/"
            className="flex items-center hover:text-white transition-colors text-white ml-10"
          >
            <HiHome className="mr-1" /> Início
          </Link>

          {isAuthenticated && user?.rh === true && (
            <Link
              to="/chat"
              className="flex items-center hover:text-white transition-colors text-white/90"
              title="Console de Atendimento RH"
            >
              ChatRH
            </Link>
          )}
        </nav>

        <div className="hidden md:flex items-center">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="hover:cursor-pointer">
                <Button
                  variant="default"
                  className="flex items-center bg-transparent hover:bg-white/15 mr-8 text-white"
                >
                  <IoPersonCircle className="!w-8 !h-8 text-white" />
                  <span>{user?.nome || "Usuário"}</span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56 bg-white border border-[#bff3d4] text-[#0b2b14] shadow-md">
                <DropdownMenuItem
                  onClick={toggle}
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-100 focus:bg-gray-100"
                >
                  <span className="flex items-center gap-2 text-[#0b2b14]">
                    {isDark ? (
                      <Moon className="h-4 w-4 text-[#0b2b14]" />
                    ) : (
                      <Sun className="h-4 w-4 text-[#0b2b14]" />
                    )}
                    Tema
                  </span>

                  <span className="text-xs text-gray-500">
                    {isDark ? "Escuro" : "Claro"}
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 hover:bg-gray-100 focus:bg-gray-100 focus:text-red-600 cursor-pointer"
                >
                  <BiLogOut className="mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={handleGoToLogin}
              className="bg-white text-[#0b2b14] hover:bg-white/90 mr-4"
            >
              Entrar
            </Button>
          )}
        </div>

        <Sheet>
          <SheetTrigger asChild className="md:hidden mr-2">
            <Button
              variant="default"
              size="icon"
              className="bg-white/20 hover:bg-white/30 border border-white/25"
            >
              <RxHamburgerMenu className="!h-6 !w-6 text-white" />
            </Button>
          </SheetTrigger>

          <SheetContent
            side="right"
            className={[
              "text-white",
              "bg-gradient-to-b from-[#25601d] to-[#2fa146]",
              "border-l border-white/15",
            ].join(" ")}
          >
            <SheetHeader>
              <SheetTitle className="text-left text-white">Menu</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {isAuthenticated && (
                <div className="flex flex-col items-center text-center p-4 bg-white/12 rounded-lg space-y-1 border border-white/15">
                  <IoPersonCircle className="text-4xl mb-1 text-white" />
                  <div className="max-w-full break-words">
                    <p className="font-semibold text-white text-sm">
                      {user?.nome}
                    </p>
                    <p className="text-xs text-white/80 truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>
              )}

              <Link
                to="/"
                className="flex items-center p-2 rounded-lg text-white hover:bg-white/10 hover:text-white transition-colors border border-transparent hover:border-white/15"
              >
                <HiHome className="mr-2" /> Início
              </Link>

              {isAuthenticated && user?.rh === true && (
                <Link
                  to="/chat"
                  className="flex items-center p-2 rounded-lg text-white hover:bg-white/10 hover:text-white transition-colors border border-transparent hover:border-white/15"
                  title="Console de Atendimento RH"
                >
                  ChatRH
                </Link>
              )}

              <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center justify-between p-2 rounded-lg text-white transition-colors border border-transparent hover:bg-white/10 hover:border-white/15"
              >
                <span className="flex items-center gap-2">
                  {isDark ? (
                    <Moon className="h-4 w-4 text-white" />
                  ) : (
                    <Sun className="h-4 w-4 text-white" />
                  )}
                  Tema
                </span>
                <span className="text-xs text-white/80">
                  {isDark ? "Escuro" : "Claro"}
                </span>
              </button>

              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center p-2 rounded-lg text-red-500 hover:bg-white/90 bg-white border border-transparent hover:border-white/15 transition-colors"
                >
                  <BiLogOut className="mr-2" /> Sair
                </button>
              ) : (
                <button
                  onClick={handleGoToLogin}
                  className="w-full flex items-center justify-center p-2 bg-white text-[#0b2b14] rounded-lg hover:bg-white/90 transition-colors"
                >
                  Entrar
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
