/**
 * src/lib/mergeStudents.ts
 *
 * Core engine for merging duplicate student records into a single keeper student.
 * Safely re-points all foreign key relations and cleans up duplicates inside
 * a single PostgreSQL transaction.
 */

import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface MergeStudentsInput {
  sourceId?: string;
  sourceGlobalNumber?: number;
  targetId?: string;
  targetGlobalNumber?: number;
  preferredName?: string;
  performedBy?: string;
}

export interface MergeSummary {
  vouchersMoved: number;
  enrollmentsMoved: number;
  enrollmentsDeduped: number;
  attendancesMoved: number;
  attendancesDeduped: number;
  catchUpsMoved: number;
  catchUpsDeduped: number;
  parentPhonesMoved: number;
  parentPhonesDeduped: number;
  workshopsMoved: number;
  workshopAttendancesMoved: number;
  bookReceiptsMoved: number;
  bookDistributionsMoved: number;
  levelTestsMoved: number;
}

export interface MergeResult {
  success: boolean;
  source: {
    id: string;
    globalNumber: number;
    name: string;
    branchId: number;
  };
  target: {
    id: string;
    globalNumber: number;
    name: string;
    branchId: number;
  };
  summary: MergeSummary;
  auditLogId?: number;
}

export async function mergeStudents(
  input: MergeStudentsInput,
  externalTx?: Prisma.TransactionClient
): Promise<MergeResult> {
  const executeMerge = async (tx: Prisma.TransactionClient): Promise<MergeResult> => {
    // 1. Resolve source student
    let source = null;
    if (input.sourceId) {
      source = await tx.student.findUnique({ where: { id: input.sourceId } });
    } else if (input.sourceGlobalNumber !== undefined) {
      source = await tx.student.findUnique({ where: { globalNumber: Number(input.sourceGlobalNumber) } });
    }

    if (!source) {
      throw new Error(
        `Source (duplicate) student not found: ${input.sourceId ?? input.sourceGlobalNumber}`
      );
    }

    // 2. Resolve target student
    let target = null;
    if (input.targetId) {
      target = await tx.student.findUnique({ where: { id: input.targetId } });
    } else if (input.targetGlobalNumber !== undefined) {
      target = await tx.student.findUnique({ where: { globalNumber: Number(input.targetGlobalNumber) } });
    }

    if (!target) {
      throw new Error(
        `Target (keeper) student not found: ${input.targetId ?? input.targetGlobalNumber}`
      );
    }

    if (source.id === target.id) {
      throw new Error(
        `Source and Target cannot be the same student (ID: ${source.id}, GlobalNumber: #${source.globalNumber})`
      );
    }

    const summary: MergeSummary = {
      vouchersMoved: 0,
      enrollmentsMoved: 0,
      enrollmentsDeduped: 0,
      attendancesMoved: 0,
      attendancesDeduped: 0,
      catchUpsMoved: 0,
      catchUpsDeduped: 0,
      parentPhonesMoved: 0,
      parentPhonesDeduped: 0,
      workshopsMoved: 0,
      workshopAttendancesMoved: 0,
      bookReceiptsMoved: 0,
      bookDistributionsMoved: 0,
      levelTestsMoved: 0,
    };

    // 3. Parent Phone Numbers
    const [sourcePhones, targetPhones] = await Promise.all([
      tx.parentPhoneNumber.findMany({ where: { studentId: source.id } }),
      tx.parentPhoneNumber.findMany({ where: { studentId: target.id } }),
    ]);

    const targetPhoneSet = new Set(targetPhones.map((p) => p.phone.trim().replace(/\s+/g, '')));
    for (const phone of sourcePhones) {
      const clean = phone.phone.trim().replace(/\s+/g, '');
      if (targetPhoneSet.has(clean)) {
        await tx.parentPhoneNumber.delete({ where: { id: phone.id } });
        summary.parentPhonesDeduped++;
      } else {
        await tx.parentPhoneNumber.update({
          where: { id: phone.id },
          data: { studentId: target.id },
        });
        targetPhoneSet.add(clean);
        summary.parentPhonesMoved++;
      }
    }

    // 4. Vouchers (Tuition, Inscription, Book, Workshop vouchers)
    const vouchersMovedRes = await tx.voucher.updateMany({
      where: { studentId: source.id },
      data: { studentId: target.id },
    });
    summary.vouchersMoved = vouchersMovedRes.count;

    // 5. Enrollments
    const [sourceEnrollments, targetEnrollments] = await Promise.all([
      tx.enrollment.findMany({ where: { studentId: source.id } }),
      tx.enrollment.findMany({ where: { studentId: target.id } }),
    ]);

    for (const sourceEnr of sourceEnrollments) {
      const existingTargetEnr = targetEnrollments.find(
        (e) => e.classId === sourceEnr.classId && e.academicYearId === sourceEnr.academicYearId
      );

      if (existingTargetEnr) {
        // Both students enrolled in the same class: deduplicate
        // If source was charged inscription fee and target wasn't, mark target as charged
        if (sourceEnr.inscriptionFeeCharged && !existingTargetEnr.inscriptionFeeCharged) {
          await tx.enrollment.update({
            where: { id: existingTargetEnr.id },
            data: {
              inscriptionFeeCharged: true,
              inscriptionFeeAmount:
                sourceEnr.inscriptionFeeAmount ?? existingTargetEnr.inscriptionFeeAmount,
            },
          });
        }

        // Re-point any transfer records
        await tx.enrollmentTransfer.updateMany({
          where: { fromEnrollmentId: sourceEnr.id },
          data: { fromEnrollmentId: existingTargetEnr.id },
        });
        await tx.enrollmentTransfer.updateMany({
          where: { toEnrollmentId: sourceEnr.id },
          data: { toEnrollmentId: existingTargetEnr.id },
        });

        // Delete redundant source enrollment
        await tx.enrollment.delete({ where: { id: sourceEnr.id } });
        summary.enrollmentsDeduped++;
      } else {
        // Re-assign enrollment to target
        await tx.enrollment.update({
          where: { id: sourceEnr.id },
          data: { studentId: target.id },
        });
        summary.enrollmentsMoved++;
      }
    }

    // 6. Attendances
    const [sourceAttendances, targetAttendances] = await Promise.all([
      tx.attendance.findMany({ where: { studentId: source.id } }),
      tx.attendance.findMany({ where: { studentId: target.id } }),
    ]);

    const targetAttMap = new Map(targetAttendances.map((a) => [a.lessonId, a]));
    for (const att of sourceAttendances) {
      const existing = targetAttMap.get(att.lessonId);
      if (existing) {
        // Favor PRESENT / LATE over ABSENT
        if (existing.status === 'ABSENT' && (att.status === 'PRESENT' || att.status === 'LATE')) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: {
              status: att.status,
              justification: att.justification ?? existing.justification,
            },
          });
        }
        await tx.attendance.delete({ where: { id: att.id } });
        summary.attendancesDeduped++;
      } else {
        await tx.attendance.update({
          where: { id: att.id },
          data: { studentId: target.id },
        });
        targetAttMap.set(att.lessonId, att);
        summary.attendancesMoved++;
      }
    }

    // 7. Catch-Up Attendances
    const [sourceCatchUps, targetCatchUps] = await Promise.all([
      tx.catchUpAttendance.findMany({ where: { studentId: source.id } }),
      tx.catchUpAttendance.findMany({ where: { studentId: target.id } }),
    ]);

    const targetCatchUpLessonIds = new Set(targetCatchUps.map((c) => c.missedLessonId));
    for (const catchUp of sourceCatchUps) {
      if (targetCatchUpLessonIds.has(catchUp.missedLessonId)) {
        await tx.catchUpAttendance.delete({ where: { id: catchUp.id } });
        summary.catchUpsDeduped++;
      } else {
        await tx.catchUpAttendance.update({
          where: { id: catchUp.id },
          data: { studentId: target.id },
        });
        targetCatchUpLessonIds.add(catchUp.missedLessonId);
        summary.catchUpsMoved++;
      }
    }

    // 8. Workshops
    const [sourceParticipants, targetParticipants] = await Promise.all([
      tx.workshopParticipant.findMany({ where: { studentId: source.id } }),
      tx.workshopParticipant.findMany({ where: { studentId: target.id } }),
    ]);

    const targetPartMap = new Map(targetParticipants.map((p) => [p.workshopId, p]));
    for (const part of sourceParticipants) {
      const existing = targetPartMap.get(part.workshopId);
      if (existing) {
        const combinedPaid = new Decimal(existing.totalPaid.toString()).plus(
          new Decimal(part.totalPaid.toString())
        );
        const combinedRefunded = new Decimal(existing.totalRefunded.toString()).plus(
          new Decimal(part.totalRefunded.toString())
        );
        await tx.workshopParticipant.update({
          where: { id: existing.id },
          data: {
            totalPaid: combinedPaid,
            totalRefunded: combinedRefunded,
          },
        });
        await tx.workshopParticipant.delete({ where: { id: part.id } });
      } else {
        await tx.workshopParticipant.update({
          where: { id: part.id },
          data: { studentId: target.id },
        });
      }
      summary.workshopsMoved++;
    }

    // Workshop Attendances
    const [sourceWsAtt, targetWsAtt] = await Promise.all([
      tx.workshopAttendance.findMany({ where: { studentId: source.id } }),
      tx.workshopAttendance.findMany({ where: { studentId: target.id } }),
    ]);

    const targetWsAttSessions = new Set(targetWsAtt.map((w) => w.sessionId));
    for (const w of sourceWsAtt) {
      if (targetWsAttSessions.has(w.sessionId)) {
        await tx.workshopAttendance.delete({ where: { id: w.id } });
      } else {
        await tx.workshopAttendance.update({
          where: { id: w.id },
          data: { studentId: target.id },
        });
        targetWsAttSessions.add(w.sessionId);
      }
      summary.workshopAttendancesMoved++;
    }

    // 9. Book Receipts & Distributions
    const [sourceReceipts, targetReceipts] = await Promise.all([
      tx.bookReceipt.findMany({ where: { studentId: source.id } }),
      tx.bookReceipt.findMany({ where: { studentId: target.id } }),
    ]);
    const targetBookIds = new Set(targetReceipts.map((r) => r.bookId));
    for (const r of sourceReceipts) {
      if (targetBookIds.has(r.bookId)) {
        await tx.bookReceipt.delete({ where: { id: r.id } });
      } else {
        await tx.bookReceipt.update({
          where: { id: r.id },
          data: { studentId: target.id },
        });
        targetBookIds.add(r.bookId);
      }
      summary.bookReceiptsMoved++;
    }

    const [sourceDists, targetDists] = await Promise.all([
      tx.bookCopyDistribution.findMany({ where: { studentId: source.id } }),
      tx.bookCopyDistribution.findMany({ where: { studentId: target.id } }),
    ]);
    const targetDropIds = new Set(targetDists.map((d) => d.bookDropId));
    for (const d of sourceDists) {
      if (targetDropIds.has(d.bookDropId)) {
        await tx.bookCopyDistribution.delete({ where: { id: d.id } });
      } else {
        await tx.bookCopyDistribution.update({
          where: { id: d.id },
          data: { studentId: target.id },
        });
        targetDropIds.add(d.bookDropId);
      }
      summary.bookDistributionsMoved++;
    }

    // 10. Level Tests
    const levelTestsMovedRes = await tx.levelTest.updateMany({
      where: { studentId: source.id },
      data: { studentId: target.id },
    });
    summary.levelTestsMoved = levelTestsMovedRes.count;

    // 11. Family Linkage
    const sourceFamilyPayer = await tx.family.findUnique({
      where: { payerStudentId: source.id },
    });
    if (sourceFamilyPayer) {
      const targetFamilyPayer = await tx.family.findUnique({
        where: { payerStudentId: target.id },
      });
      if (!targetFamilyPayer) {
        await tx.family.update({
          where: { id: sourceFamilyPayer.id },
          data: { payerStudentId: target.id },
        });
      } else {
        await tx.family.update({
          where: { id: sourceFamilyPayer.id },
          data: { payerStudentId: null },
        });
      }
    }

    // If target has no family and source does, adopt source family
    if (!target.familyId && source.familyId) {
      await tx.student.update({
        where: { id: target.id },
        data: { familyId: source.familyId },
      });
    }

    // 12. Backfill target missing info (phone, address, birthday, gender)
    const targetUpdates: Record<string, any> = {};
    if ((!target.phone || target.phone.trim() === '' || target.phone === 'غير متوفر') && source.phone && source.phone !== 'غير متوفر') {
      targetUpdates.phone = source.phone;
    }
    if (!target.address && source.address) {
      targetUpdates.address = source.address;
    }
    if (!target.birthday && source.birthday) {
      targetUpdates.birthday = source.birthday;
    }
    if (!target.sex && source.sex) {
      targetUpdates.sex = source.sex;
    }
    if (input.preferredName && input.preferredName.trim() !== '') {
      targetUpdates.name = input.preferredName.trim();
    }

    if (Object.keys(targetUpdates).length > 0) {
      await tx.student.update({
        where: { id: target.id },
        data: targetUpdates,
      });
    }

    // 13. Create Audit Log
    const audit = await tx.auditLog.create({
      data: {
        entityType: 'Student',
        entityId: target.id,
        action: 'MERGE_STUDENT',
        userId: input.performedBy || 'system',
        userName: input.performedBy || 'Merge Script',
        branchId: target.registeredBranchId,
        oldValue: JSON.stringify({
          sourceStudent: {
            id: source.id,
            globalNumber: source.globalNumber,
            name: source.name,
            phone: source.phone,
          },
        }),
        newValue: JSON.stringify({
          targetStudent: {
            id: target.id,
            globalNumber: target.globalNumber,
            name: targetUpdates.name ?? target.name,
            phone: targetUpdates.phone ?? target.phone,
          },
        }),
        details: `Merged duplicate student #${source.globalNumber} (${source.name}) into keeper #${target.globalNumber} (${target.name}). Summary: ${JSON.stringify(summary)}`,
      },
    });

    // 14. Finally, safely delete source student!
    await tx.student.delete({
      where: { id: source.id },
    });

    return {
      success: true,
      source: {
        id: source.id,
        globalNumber: source.globalNumber,
        name: source.name,
        branchId: source.registeredBranchId,
      },
      target: {
        id: target.id,
        globalNumber: target.globalNumber,
        name: targetUpdates.name ?? target.name,
        branchId: target.registeredBranchId,
      },
      summary,
      auditLogId: audit.id,
    };
  };

  if (externalTx) {
    return executeMerge(externalTx);
  }

  return prisma.$transaction(async (tx) => {
    return executeMerge(tx);
  });
}
