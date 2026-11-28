import { TableSkeleton } from "@/components/ui/Skeletons";

export default function SubjectsLoading() {
  return <TableSkeleton rows={8} columns={3} />;
}
