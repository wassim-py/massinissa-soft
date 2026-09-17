"use client";

import FormContainer from "./FormContainer";
import { Class, Lesson, Teacher } from "@prisma/client";

type TimetableLesson = Lesson & {
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
      />
    </div>
  );
};

export default LessonActions;
