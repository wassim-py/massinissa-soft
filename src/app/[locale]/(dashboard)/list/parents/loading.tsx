import { TableSkeleton } from "@/components/ui/Skeletons";

export default function ParentsLoading() {
  return <TableSkeleton rows={10} columns={5} />;
}
