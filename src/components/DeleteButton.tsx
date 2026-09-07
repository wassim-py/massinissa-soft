"use client";

import {
  deleteClass,
  deleteCourse,
  deleteEvent,
  deleteExam,
  deleteLesson,
  deleteParent,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteAnnouncement,
  deleteWorkshop,
  deleteWorkshopParticipant, // ADDED: Import the new action
} from "@/lib/actions";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";

import { toast } from "react-toastify";


// NEW: A specific confirmation component for refunds
const RefundConfirmation = ({
  formAction,
  setOpen,
}: {
  formAction: any;
  setOpen: (isOpen: boolean) => void;
}) => {
  return (
    <form action={formAction} className="p-6 flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-gray-800">Refund Payment</h2>
        <p className="text-gray-600 text-center">
            This will mark the payment as refunded and update the daily ledger. This action cannot be undone.
        </p>
        <div className="w-full mt-2">
            <label htmlFor="refundNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Refund (Optional)
            </label>
            <textarea
                id="refundNotes"
                name="refundNotes"
                rows={3}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g., Canceled enrollment"
            />
        </div>
        <div className="flex items-center gap-4 mt-4 w-full">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300">
                Cancel
            </button>
            <button
            type="submit"
            className="flex-1 bg-red-600 text-white px-6 py-2 font-semibold rounded-md hover:bg-red-700"
            >
            Confirm Refund
            </button>
        </div>
    </form>
  );
};

// This is the pop-up confirmation content
const DeleteConfirmation = ({
  table,
  formAction,
  setOpen,
}: {
  table: string;
  formAction: any;
  setOpen: (isOpen: boolean) => void;
}) => {
  return (
    <form action={formAction} className="p-6 flex flex-col items-center gap-4 text-center">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-12 w-12 text-red-500 opacity-80 mb-2"
        >
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
        <h2 className="text-xl font-bold text-gray-800">Are you sure?</h2>
        <p className="text-gray-600">
            This action cannot be undone. All related data for this {table.replace('Participant', ' Participant')} will be permanently deleted.
        </p>
        <div className="flex items-center gap-4 mt-4 w-full">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300">
                Cancel
            </button>
            <button
            type="submit"
            className="flex-1 bg-red-600 text-white px-6 py-2 font-semibold rounded-md hover:bg-red-700"
            >
            Delete
            </button>
        </div>
    </form>
  );
};


// This is the main reusable Delete Button component
const DeleteButton = ({ table, id, data }: { table: string, id: number | string, data?: any }) => {
  const [open, setOpen] = useState(false);

  const isRefund = table === 'payment' || table === 'workshopPayment';

  // UPDATED: The map of actions now includes workshopParticipant
  const deleteAction = {
      subject: deleteSubject,
      class: deleteClass,
      teacher: deleteTeacher,
      student: deleteStudent,
      exam: deleteExam,
      parent: deleteParent,
      lesson: deleteLesson,
      course: deleteCourse,
      event: deleteEvent,
      announcement: deleteAnnouncement,
      workshop: deleteWorkshop,
      workshopParticipant: deleteWorkshopParticipant, // ADDED
    }[table] || deleteSubject;

  const [state, formAction] = useActionState(deleteAction, { success: false, error: false, message: "" });

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || `${table} has been deleted!`);
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, table, setOpen]);

  // Create a new FormData object to pass to the action
  const actionWithData = (formData: FormData) => {
    formData.append('id', String(id));
    if (data) {
        Object.keys(data).forEach(key => {
            formData.append(key, data[key]);
        });
    }
    return formAction(formData);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-wsmPurple hover:opacity-80"
      >
        <Image src="/delete.png" alt="Delete" width={14} height={14} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl relative w-full max-w-md mx-4">
            <button
              className="absolute top-4 right-4 cursor-pointer"
              onClick={() => setOpen(false)}
            >
              <Image src="/close.png" alt="close" width={14} height={14} />
            </button>
            {isRefund ? (
                <RefundConfirmation formAction={actionWithData} setOpen={setOpen} />
            ) : (
                <DeleteConfirmation table={table} formAction={actionWithData} setOpen={setOpen} />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DeleteButton;
