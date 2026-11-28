import { TableSkeleton } from "@/components/ui/Skeletons";

export default function WorkshopDetailLoading() {
  return <TableSkeleton rows={8} columns={5} />;
}
