"use client";

import FormContainer from "./FormContainer"; // <-- FIX: Import the FormContainer
import { Class, Lesson, Subject, Teacher } from "@prisma/client";

// This type should match the one in Timetable.tsx
type TimetableLesson = Lesson & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
};

const LessonActions = ({ lesson }: { lesson: TimetableLesson }) => {
  return (
    <div className="flex justify-end gap-3">
      <FormContainer table="lesson" type="delete" id={lesson.id} />
      <FormContainer
        table="lesson"
        type="update"
        data={lesson}
        // NOTE: relatedData will be passed from FormContainer in the next step
      />
    </div>
  );
};

export default LessonActions;
