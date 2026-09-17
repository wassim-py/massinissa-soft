import { TableSkeleton } from "@/components/ui/Skeletons";

export default function TeachersLoading() {
  return <TableSkeleton rows={10} columns={5} />;
}
