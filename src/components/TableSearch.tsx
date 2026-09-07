"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TableSearch = ({
  placeholder = "بحث...", // Default placeholder
}: {
  placeholder?: string;
}) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams);
    if (e.target.value) {
      params.set("search", e.target.value);
    } else {
      params.delete("search");
    }
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="w-full md:w-auto flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 px-2">
      <Image src="/search.png" alt="" width={14} height={14} />
      <input
        type="text"
        placeholder={placeholder} // Use the placeholder prop
        onChange={handleSearch}
        defaultValue={searchParams.get("search")?.toString()}
        className="w-[200px] p-2 bg-transparent outline-none"
      />
    </div>
  );
};

export default TableSearch;
