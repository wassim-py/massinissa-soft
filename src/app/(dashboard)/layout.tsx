import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import Image from "next/image";
import Link from "next/link";



export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen flex">
      {/* LEFT */}
      <div className="w-[14%] md:w-[8%] lg:w-[16%] xl:w-[14%] p-4">
        <Link
          href="/"
          className="flex items-center justify-center lg:justify-start gap-2"
        >
          <Image src="/logo.png" alt="logo" width={32} height={32} />
          {/* The brand name "Classty" should remain in English for brand consistency */}
          <span className="hidden lg:block font-bold">Classty</span>
        </Link>
        <Menu />
      </div>
      {/* RIGHT */}
      <div className="w-[86%] md:w-[92%] lg:w-[84%] xl:w-[86%] bg-[#F7F8FA] flex flex-col">
        <Navbar />
        {/* We wrap the children in a 'main' tag with 'flex-grow' to ensure the footer is pushed to the bottom */}
        <main className="flex-grow">
            {children}
        </main>
        {/* ADDED: A minimal, professional footer */}
        <footer className="mt-auto p-4 text-center text-xs text-gray-500 border-t">
            <p>
                &copy; {new Date().getFullYear()} Classty. جميع الحقوق محفوظة. | بدعم من 
                <a 
                    href="https://landing-classty.vercel.app/"
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="font-semibold text-blue-600 hover:underline"
                >
                    &nbsp;Classty
                </a>
            </p>
        </footer>
      </div>
    </div>
  );
}
