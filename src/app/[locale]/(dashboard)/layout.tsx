import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tFooter = await getTranslations("footer");

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-surface-muted">
      {/* DESKTOP SIDEBAR (visible only on lg and up: >= 1024px) */}
      <aside
        className="hidden lg:flex flex-col w-64 border-e border-border bg-surface shrink-0 h-screen sticky top-0 overflow-y-auto p-4"
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 px-3 py-2 mb-2"
        >
          <Image src="/logo.png" alt="Classty Logo" width={32} height={32} priority />
          <span className="font-bold text-xl text-gray-900 tracking-tight">
            Classty
          </span>
        </Link>
        <div className="mt-2 flex-1">
          <Menu />
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-surface-muted">
        <Navbar
          mobileNav={
            <MobileNav>
              <Menu />
            </MobileNav>
          }
        />
        <main className="flex-grow p-3 sm:p-4 md:p-6 w-full max-w-full">
          {children}
        </main>
        <footer className="mt-auto p-4 text-center text-xs text-gray-500 border-t border-border bg-surface">
          <p>
            {tFooter("copyright", { year: new Date().getFullYear().toString() })}{" "}
            | {tFooter("poweredBy")}{" "}
            <a
              href="https://landing-classty.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Classty
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
