import type { Express, Request, Response } from 'express';
import { db } from './database';
import { hasPermission } from './permissions';
import { requireRole } from './rbac';
import { listSignupRequests } from './accountSignup';
import type {
  AuditLogEntry,
  HeadteacherApprovalItem,
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
          totals: {
            students: students.length,
            staff: staff.length,
            parents: parents.length,
            activeClasses: activeClasses.length,
            archivedStudents: archivedStudents.length
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
          approvals: {
            total: approvals.length,
            byType: approvalsByType,
            items: approvals.slice(0, 8)
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
