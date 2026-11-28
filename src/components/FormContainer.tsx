import FormModal from "./FormModal";
import { getAuthSession } from "@/lib/auth";
import { serializeForClient } from "@/lib/utils";

// UPDATED: This type now includes "workshop" and "formation"
export type FormContainerProps = {
  table:
    | "teacher"
    | "student"
    | "parent"
    | "subject"
    | "class"
    | "lesson"
    | "attendance"
    | "announcement"
    | "payment"
    | "workshop"
    | "formation";
  type: "create" | "update" | "delete";
  data?: any;
  id?: number | string;
  relatedData?: any;
};

/**
 * Lightweight Server Component wrapper for FormModal.
 * Enforces server-side RBAC without executing N+1 database queries or duplicating
 * multi-megabyte dropdown payloads on list pages — FormModal fetches `relatedData`
 * lazily on demand when the user opens a create/update modal (or uses pre-supplied
 * `relatedData` immediately if provided).
 */
const FormContainer = async ({
  table,
  type,
  data,
  id,
  relatedData,
}: FormContainerProps) => {
  const session = await getAuthSession();
  if (!session.can(type, table)) {
    return null;
  }

  const hasPreSuppliedRelated =
    relatedData && typeof relatedData === "object" && Object.keys(relatedData).length > 0;

  return (
    <div className="">
      <FormModal
        table={table}
        type={type}
        data={serializeForClient(data)}
        id={id}
        relatedData={hasPreSuppliedRelated ? serializeForClient(relatedData) : undefined}
      />
    </div>
  );
};

export default FormContainer;
