import { TableSkeleton } from "@/components/ui/Skeletons";

export default function AttendanceClassMatrixLoading() {
  return <TableSkeleton rows={10} columns={6} />;
}
