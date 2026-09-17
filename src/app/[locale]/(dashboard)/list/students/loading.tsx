import { TableSkeleton } from "@/components/ui/Skeletons";

export default function StudentsLoading() {
  return <TableSkeleton rows={10} columns={6} />;
}
