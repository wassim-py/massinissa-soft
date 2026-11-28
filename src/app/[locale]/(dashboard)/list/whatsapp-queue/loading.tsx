import { TableSkeleton } from "@/components/ui/Skeletons";

export default function WhatsAppQueueLoading() {
  return <TableSkeleton rows={8} columns={5} />;
}
