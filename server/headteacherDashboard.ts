import type { Express, Request, Response } from 'express';
import { db } from './database';
import { hasPermission } from './permissions';
import { requireRole } from './rbac';
import { listSignupRequests } from './accountSignup';
import type {
  AuditLogEntry,
  HeadteacherApprovalItem,
  HeadteacherAttentionItem,
  HeadteacherDashboardView,
  NotificationMessage,
  SchoolEvent,
  UserProfile
} from '../src/types';

const ADMIN_ROLES = ['HEAD_TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'] as const;

function localDateString(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function byRecentTimestamp<T extends { createdAt?: string; timestamp?: string; date?: string }>(
  left: T,
  right: T
): number {
  return String(right.createdAt ?? right.timestamp ?? right.date ?? '').localeCompare(
    String(left.createdAt ?? left.timestamp ?? left.date ?? '')
  );
}

function percentage(part: number, total: number): number | null {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : null;
}

const ATTENTION_GUIDANCE: Record<
  HeadteacherApprovalItem['type'],
  { severity: HeadteacherAttentionItem['severity']; why: string; action: string; responsible: string }
> = {
  ADMISSION: {
    severity: 'MEDIUM',
    why: 'A family is waiting for an admission decision and the school register is not yet final.',
    action: 'Open Admissions Management and review the application.',
    responsible: 'Admissions officer / Headteacher'
  },
  MARKS: {
    severity: 'HIGH',
    why: 'Marks cannot be approved or used for report cards until the submission is reviewed.',
    action: 'Open Academic Administration and review the marks submission.',
    responsible: 'Academic Officer / Headteacher'
  },
  REPORT_CARD: {
    severity: 'HIGH',
    why: 'Approved report cards are not visible to families until they are published.',
    action: 'Open Report Cards & Printing and publish the approved card.',
    responsible: 'Headteacher / authorized publisher'
  },
  SIGNUP: {
    severity: 'MEDIUM',
    why: 'A new account request is waiting for verification and approval.',
    action: 'Open Parent & Student Sign-ups and review the request.',
    responsible: 'Headteacher / authorized administrator'
  },
  STAFF_REQUEST: {
    severity: 'LOW',
    why: 'An invited staff member has not activated their SchoolCare account yet.',
    action: 'Open Staff Management and resend or confirm the invitation.',
    responsible: 'Headteacher / School IT'
  },
  FINANCE: {
    severity: 'MEDIUM',
    why: 'An unpaid invoice affects the school fee position and parent communication.',
    action: 'Open Fees & Finance and follow up on the invoice.',
    responsible: 'Accountant / Headteacher'
  }
};

function attentionFromApproval(item: HeadteacherApprovalItem): HeadteacherAttentionItem {
  const guidance = ATTENTION_GUIDANCE[item.type];
  return {
    id: `approval-${item.id}`,
    category: item.type,
    severity: guidance.severity,
    title: item.title,
    whatHappened: item.detail,
    whyItMatters: guidance.why,
    actionNeeded: guidance.action,
    responsible: guidance.responsible,
    dueAt: null,
    status: item.status,
    tab: item.tab,
    permission: item.permission
  };
}

/**
 * School-authoritative Headteacher overview. All data is resolved from the
 * authenticated account's school; browser-supplied school IDs are ignored.
 */
export function registerHeadteacherDashboardRoutes(app: Express): void {
  app.get(
    '/api/dashboard/headteacher',
    requireRole(...ADMIN_ROLES),
    async (req: Request, res: Response) => {
      try {
        const actor = req.user as UserProfile;
        const schoolId = actor.schoolId;
        const today = localDateString();
        const school = db.getSchool(schoolId);

        const students = db.getStudents(schoolId);
        const archivedStudents = db.getStudents(schoolId, undefined, undefined, true).filter(
          student => Boolean(student.archivedAt)
        );
        const staff = db.getStaff(schoolId).filter(member => member.status === 'ACTIVE');
        const parents = db.getGuardians(schoolId);
        const activeClasses = db.getClasses(schoolId).filter(
          classItem => (classItem.status ?? 'ACTIVE') === 'ACTIVE'
        );

        const attendance = db.getAttendance(schoolId, today);
        const present = attendance.filter(record => record.status === 'PRESENT').length;
        const absent = attendance.filter(record => record.status === 'ABSENT').length;
        const late = attendance.filter(record => record.status === 'LATE').length;

        const reportCards = db.getReportCards(schoolId).filter(
          card => Number.isFinite(card.overallAverage)
        );
        const average = reportCards.length
          ? Number(
              (
                reportCards.reduce((sum, card) => sum + card.overallAverage, 0) / reportCards.length
              ).toFixed(1)
            )
          : null;
        const passRate = reportCards.length
          ? percentage(reportCards.filter(card => card.overallAverage >= 50).length, reportCards.length)
          : null;
        const gradeDistribution = reportCards.reduce<Record<string, number>>(
          (distribution, card) => {
            const grade = card.overallAverage >= 80 ? 'A'
              : card.overallAverage >= 70 ? 'B'
              : card.overallAverage >= 60 ? 'C'
              : card.overallAverage >= 50 ? 'D'
              : 'F';
            distribution[grade] = (distribution[grade] ?? 0) + 1;
            return distribution;
          },
          { A: 0, B: 0, C: 0, D: 0, F: 0 }
        );

        const approvals: HeadteacherApprovalItem[] = [];

        if (hasPermission(actor, 'students.write')) {
          for (const application of db.getAdmissions(schoolId).filter(item =>
            item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW'
          )) {
            approvals.push({
              id: application.id,
              type: 'ADMISSION',
              title: `Admission · ${application.applicantFullName}`,
              detail: `${application.referenceNumber} · ${application.applicationType.replaceAll('_', ' ')}`,
              status: application.status,
              createdAt: application.submittedAt,
              tab: 'admissions',
              permission: 'students.write'
            });
          }
        }

        if (hasPermission(actor, 'marks.review')) {
          for (const submission of db
            .getAcademicCollection<{ id: string; schoolId: string; status: string; createdAt: string; className?: string; subjectName?: string }>(
              'markSubmissions',
              schoolId
            )
            .filter(item => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW')) {
            approvals.push({
              id: submission.id,
              type: 'MARKS',
              title: `Marks · ${submission.subjectName ?? 'Subject'}`,
              detail: `${submission.className ?? 'Class'} submission awaiting review`,
              status: submission.status,
              createdAt: submission.createdAt,
              tab: 'academic-admin',
              permission: 'marks.review'
            });
          }
        }

        if (hasPermission(actor, 'reports.publish')) {
          for (const card of db.getReportCards(schoolId, undefined, { approvedOnly: true }).filter(
            item => !item.publishedAt
          )) {
            approvals.push({
              id: card.id,
              type: 'REPORT_CARD',
              title: `Report card · ${card.studentName}`,
              detail: `${card.className} · ${card.academicYear} ${card.term}`,
              status: 'APPROVED_NOT_PUBLISHED',
              createdAt: card.approvedAt ?? card.generatedAt ?? '',
              tab: 'report-printing',
              permission: 'reports.publish'
            });
          }
        }

        if (hasPermission(actor, 'invitations.manage')) {
          try {
            const signupRequests = await listSignupRequests(schoolId);
            for (const request of signupRequests.filter(item =>
              item.status === 'PENDING' || item.status === 'VERIFIED'
            )) {
              approvals.push({
                id: request.id,
                type: 'SIGNUP',
                title: `Account request · ${request.fullName}`,
                detail: `${request.role} · verification ${request.status.toLowerCase()}`,
                status: request.status,
                createdAt: request.createdAt,
                tab: 'signup-requests',
                permission: 'invitations.manage'
              });
            }
          } catch (error) {
            console.error('[Dashboard] Signup approvals unavailable:', error);
          }
        }

        if (hasPermission(actor, 'staff.read')) {
          for (const invitation of db.getStaffInvitations(schoolId).filter(item =>
            !item.consumedAt && !item.revokedAt
          )) {
            approvals.push({
              id: invitation.id,
              type: 'STAFF_REQUEST',
              title: `Staff invitation · ${invitation.fullName}`,
              detail: `${invitation.professionalTitle} · awaiting activation`,
              status: 'PENDING_ACTIVATION',
              createdAt: invitation.createdAt,
              tab: 'staff-management',
              permission: 'staff.read'
            });
          }
        }

        if (hasPermission(actor, 'finance.write')) {
          for (const invoice of db.getInvoices(schoolId).filter(item =>
            item.status === 'PENDING' || item.status === 'OVERDUE'
          )) {
            approvals.push({
              id: invoice.id,
              type: 'FINANCE',
              title: `Invoice · ${invoice.invoiceNumber}`,
              detail: `${invoice.studentName} · ${invoice.balanceRwf.toLocaleString()} RWF outstanding`,
              status: invoice.status,
              createdAt: invoice.createdAt,
              tab: 'finance',
              permission: 'finance.write'
            });
          }
        }

        approvals.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        const approvalsByType = approvals.reduce<Record<string, number>>((counts, item) => {
          counts[item.type] = (counts[item.type] ?? 0) + 1;
          return counts;
        }, {});

        const pendingAdmissions = db
          .getAdmissions(schoolId)
          .filter(item => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW').length;
        const publishedResults = db.getReportCards(schoolId).filter(item => Boolean(item.publishedAt)).length;
        const pendingAcademicApprovals = approvals.filter(item =>
          item.type === 'MARKS' || item.type === 'REPORT_CARD'
        ).length;

        const attendanceTrendMap = new Map<string, { date: string; present: number; total: number }>();
        for (const record of db.getAttendance(schoolId)) {
          const date = String(record.date).slice(0, 10);
          const entry = attendanceTrendMap.get(date) ?? { date, present: 0, total: 0 };
          entry.total += 1;
          if (record.status === 'PRESENT') entry.present += 1;
          attendanceTrendMap.set(date, entry);
        }
        const attendanceTrend = Array.from(attendanceTrendMap.values())
          .sort((left, right) => left.date.localeCompare(right.date))
          .slice(-14)
          .map(entry => ({ ...entry, rate: percentage(entry.present, entry.total) }));

        const classPerformanceMap = new Map<
          string,
          { className: string; values: number[]; passed: number }
        >();
        for (const card of reportCards) {
          const className = card.className || 'Unassigned';
          const entry = classPerformanceMap.get(className) ?? {
            className,
            values: [],
            passed: 0
          };
          entry.values.push(card.overallAverage);
          if (card.overallAverage >= 50) entry.passed += 1;
          classPerformanceMap.set(className, entry);
        }
        const classPerformance = Array.from(classPerformanceMap.values())
          .map(entry => ({
            className: entry.className,
            evaluated: entry.values.length,
            average: entry.values.length
              ? Number(
                  (
                    entry.values.reduce((sum, value) => sum + value, 0) / entry.values.length
                  ).toFixed(1)
                )
              : null,
            passRate: percentage(entry.passed, entry.values.length)
          }))
          .sort((left, right) => left.className.localeCompare(right.className));

        const markSubmissions = db.getAcademicCollection<{ status?: string }>('markSubmissions', schoolId);
        const examinationCompletion = {
          total: markSubmissions.length,
          draft: markSubmissions.filter(item => item.status === 'DRAFT').length,
          submitted: markSubmissions.filter(
            item => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW'
          ).length,
          approved: markSubmissions.filter(item => item.status === 'APPROVED').length,
          returned: markSubmissions.filter(item => item.status === 'RETURNED').length
        };

        const staffInvitations = hasPermission(actor, 'staff.read')
          ? db.getStaffInvitations(schoolId)
          : null;
        const staffTaskCompletion = staffInvitations
          ? {
              total: staffInvitations.length,
              activated: staffInvitations.filter(item => Boolean(item.consumedAt)).length,
              pending: staffInvitations.filter(
                item => !item.consumedAt && !item.revokedAt
              ).length
            }
          : null;

        const attentionItems: HeadteacherAttentionItem[] = approvals
          .slice(0, 8)
          .map(attentionFromApproval);

        if (hasPermission(actor, 'attendance.read')) {
          const followUps = new Map<
            string,
            { studentName: string; className: string; recordedByName: string; count: number }
          >();
          for (const record of attendance.filter(
            item => item.status === 'ABSENT' && !item.parentExplanation
          )) {
            const entry = followUps.get(record.studentId) ?? {
              studentName: record.studentName,
              className: record.className,
              recordedByName: record.recordedByName,
              count: 0
            };
            entry.count += 1;
            followUps.set(record.studentId, entry);
          }
          for (const entry of followUps.values()) {
            attentionItems.push({
              id: `attendance-${today}-${entry.studentName}`,
              category: 'ATTENDANCE',
              severity: 'HIGH',
              title: `Attendance follow-up · ${entry.studentName}`,
              whatHappened: `${entry.count} absence record${entry.count === 1 ? '' : 's'} today with no parent explanation.`,
              whyItMatters: 'Unexplained absences can hide safeguarding, health or transport problems.',
              actionNeeded: 'Check the attendance record and contact the parent or guardian.',
              responsible: entry.recordedByName || 'Class teacher',
              dueAt: null,
              status: 'FOLLOW_UP_REQUIRED',
              tab: 'attendance',
              permission: 'attendance.read'
            });
          }
        }

        const activities: AuditLogEntry[] = db
          .getAuditLogs(schoolId)
          .slice()
          .sort(byRecentTimestamp)
          .slice(0, 6);
        const notifications: NotificationMessage[] = db
          .getNotifications(schoolId)
          .slice()
          .sort(byRecentTimestamp)
          .slice(0, 5);
        const events: SchoolEvent[] = db
          .getEvents(schoolId)
          .filter(event => String(event.date).slice(0, 10) >= today)
          .sort((left, right) => String(left.date).localeCompare(String(right.date)))
          .slice(0, 5);

        const healthIncidents = hasPermission(actor, 'health.read')
          ? db.getHealthIncidents(schoolId)
          : null;
        const invoices = hasPermission(actor, 'finance.read') ? db.getInvoices(schoolId) : null;
        const disciplineRecords = hasPermission(actor, 'discipline.read')
          ? db.getModuleRecords(schoolId, 'discipline')
          : null;

        const view: HeadteacherDashboardView = {
          generatedAt: new Date().toISOString(),
          schoolId,
          schoolName: school?.name ?? 'School',
          currentTerm: school?.currentTerm ?? null,
          academicPeriod: {
            academicYear: school?.currentAcademicYear ?? null,
            term: school?.currentTerm ?? null,
            source: school?.currentAcademicYear || school?.currentTerm
              ? 'School record'
              : 'No academic period recorded'
          },
          totals: {
            students: students.length,
            staff: staff.length,
            teachers: staff.filter(member => member.role === 'TEACHER').length,
            parents: parents.length,
            activeClasses: activeClasses.length,
            archivedStudents: archivedStudents.length,
            pendingAdmissions,
            publishedResults,
            pendingAcademicApprovals
          },
          attendance: {
            date: today,
            total: attendance.length,
            present,
            absent,
            late,
            rate: percentage(present, attendance.length)
          },
          academics: {
            evaluated: reportCards.length,
            average,
            passRate,
            gradeDistribution
          },
          performance: {
            attendanceTrend,
            classPerformance,
            examinationCompletion,
            staffTaskCompletion
          },
          approvals: {
            total: approvals.length,
            byType: approvalsByType,
            items: approvals.slice(0, 8)
          },
          attention: {
            total: attentionItems.length,
            items: attentionItems.slice(0, 12)
          },
          activities,
          notifications,
          events,
          health: healthIncidents
            ? {
                urgent: healthIncidents.filter(
                  item => !item.resolved && (item.priority === 'URGENT' || item.priority === 'EMERGENCY')
                ).length,
                total: healthIncidents.length
              }
            : null,
          finance: invoices
            ? {
                billed: invoices.reduce((sum, item) => sum + item.totalAmountRwf, 0),
                collected: invoices.reduce((sum, item) => sum + item.paidAmountRwf, 0),
                outstanding: invoices.reduce((sum, item) => sum + item.balanceRwf, 0)
              }
            : null,
          discipline: disciplineRecords
            ? { openRecords: disciplineRecords.filter(record => !record.resolved).length }
            : null
        };

        return res.json(view);
      } catch (error) {
        console.error('[Dashboard] Headteacher overview failed:', error);
        return res.status(500).json({ error: 'Unable to build the Headteacher dashboard.' });
      }
    }
  );
}
