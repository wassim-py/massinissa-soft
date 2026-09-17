import { TableSkeleton } from "@/components/ui/Skeletons";

export default function DefaultListLoading() {
  return <TableSkeleton rows={10} columns={5} />;
}
