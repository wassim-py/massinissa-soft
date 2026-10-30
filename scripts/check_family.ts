import { prisma } from './lib/db';

async function main() {
  const atts = await prisma.attendance.findMany({
    where: {
      lesson: { classId: { in: [56, 57] } },
      status: 'PRESENT'
    },
    include: {
      student: {
        include: {
          family: {
            include: {
              students: true
            }
          }
        }
      },
      lesson: true
    }
  });

  const fams = atts.filter(a => a.student.familyId);
  console.log(`Present attendances with family: ${fams.length}`);
  for (const f of fams) {
    console.log(`${f.student.name} | Family: ${f.student.family?.name} | Discount: ${f.student.family?.discountPercentage}% | PayerId: ${f.student.family?.payerStudentId} | isPayer: ${f.student.family?.payerStudentId === f.studentId} | Lesson #${f.lessonId} (${f.lesson.classId})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
