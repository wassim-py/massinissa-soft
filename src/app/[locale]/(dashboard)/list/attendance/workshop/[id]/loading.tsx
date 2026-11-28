import { TableSkeleton } from "@/components/ui/Skeletons";

export default function WorkshopAttendanceLoading() {
  return <TableSkeleton rows={8} columns={4} />;
}
