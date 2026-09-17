import { TableSkeleton } from "@/components/ui/Skeletons";

export default function ConfigurationLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-surface-muted rounded-xl" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-surface-muted rounded-lg" />
          <div className="h-4 w-64 bg-surface-muted/60 rounded-md" />
        </div>
      </div>

      {/* Configuration Tab bar */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 w-32 bg-surface-muted rounded-xl" />
        ))}
      </div>

      {/* Tab content */}
      <TableSkeleton rows={8} columns={4} />
    </div>
  );
}
