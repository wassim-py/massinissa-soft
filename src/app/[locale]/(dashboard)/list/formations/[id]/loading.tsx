import { TableSkeleton } from "@/components/ui/Skeletons";

export default function FormationDetailLoading() {
  return <TableSkeleton rows={8} columns={5} />;
}
