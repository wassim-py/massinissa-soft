import { TableSkeleton } from "@/components/ui/Skeletons";

export default function TakeAttendanceLoading() {
  return <TableSkeleton rows={12} columns={4} />;
}
