/**
 * Report card printing, publication and distribution API.
 *
 * The PDF itself is rendered client-side from the approved data returned here;
 * no marks or comments are created in this module.
 */
import type { Express, Request, Response } from 'express';
import {
  AcademicTerm,
  AcademicYear,
  ReportCard,
  ReportDistribution,
  UserProfile
} from '../src/types';
import { db } from './database';
import { PermissionError } from './permissions';
import {
  HttpError,
  addHistory,
  attendanceSummary,
  canDistributeReports,
  canGenerateReports,
  canPublishReports,
  canReviewMarks,
  generateReportCards,
  getAcademicYear,
  getAssignments,
  getSettings,
  getTerm,
  notifyParentsAndStudents,
  requireActor,
  scopedSchoolId,
  uid
} from './academicCore';

type AsyncHandler = (req: Request, res: Response) => void | Promise<void>;

function wrap(handler: AsyncHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message, missing: (error as HttpError & { missing?: unknown }).missing });
        return;
      }
      if (error instanceof PermissionError) {
        res.status(403).json({ error: error.message });
        return;
      }
      console.error('Report printing API error:', error);
      res.status(500).json({ error: 'Report request failed.' });
    }
  };
}

function actorOf(req: Request): UserProfile {
  return requireActor(req.user);
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function requireGenerator(req: Request): UserProfile {
  const actor = actorOf(req);
  if (!canGenerateReports(actor)) {
    throw new HttpError(403, 'Only the Headteacher or an authorized report administrator may generate official reports.');
  }
  return actor;
}

function requirePublisher(req: Request): UserProfile {
  const actor = actorOf(req);
  if (!canPublishReports(actor)) throw new HttpError(403, 'You are not authorized to publish report cards.');
  return actor;
}

function requireDistributor(req: Request): UserProfile {
  const actor = actorOf(req);
  if (!canDistributeReports(actor)) {
    throw new HttpError(403, 'You are not authorized to manage report distribution.');
  }
  return actor;
}

function canViewUnpublishedReports(actor: UserProfile): boolean {
  return canGenerateReports(actor) || canReviewMarks(actor) || canPublishReports(actor) || canDistributeReports(actor);
}

function classIdsForScope(
  schoolId: string,
  year: AcademicYear,
  term: AcademicTerm,
  requested: unknown
): string[] {
  if (Array.isArray(requested) && requested.length > 0 && requested.every(id => typeof id === 'string')) {
    return requested as string[];
  }
  if (typeof requested === 'string' && requested && requested !== 'all') return [requested];
  return Array.from(new Set(getAssignments(schoolId, year.id, term.id).map(item => item.classId)));
}

function updateDistribution(
  schoolId: string,
  id: string,
  actor: UserProfile,
  updates: Partial<ReportDistribution>,
  action: string
): ReportDistribution {
  const current = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId).find(item => item.id === id);
  if (!current) throw new HttpError(404, 'Distribution record not found.');
  const updated = db.updateAcademicRecord<ReportDistribution>('reportDistributions', id, schoolId, {
    ...updates,
    updatedAt: new Date().toISOString(),
    history: addHistory({
      action, by: actor.id, byName: actor.fullName, role: actor.role, at: new Date().toISOString()
    }, current.history)
  });
  if (!updated) throw new HttpError(404, 'Distribution record not found.');
  return updated;
}

export function registerReportPrintingRoutes(app: Express): void {
  // --- Generation ----------------------------------------------------

  app.post('/api/academics/reports/generate', wrap((req, res) => {
    const actor = requireGenerator(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const year = getAcademicYear(schoolId, typeof b.yearId === 'string' ? b.yearId : undefined);
    const term = getTerm(schoolId, typeof b.termId === 'string' ? b.termId : undefined, year?.id);
    if (!year || !term) throw new HttpError(400, 'Select a valid academic year and term.');
    const classIds = classIdsForScope(schoolId, year, term, b.classIds ?? b.classId);
    if (classIds.length === 0) throw new HttpError(400, 'No classes have subject assignments for the selected term.');
    const studentIds = Array.isArray(b.studentIds) && b.studentIds.every(id => typeof id === 'string')
      ? b.studentIds as string[] : undefined;
    const cards: ReportCard[] = [];
    const missingByClass: Array<{ classId: string; items: unknown[] }> = [];
    for (const classId of classIds) {
      const result = generateReportCards(schoolId, year, term, classId, actor,
        studentIds && classIds.length === 1 ? { studentIds } : {});
      if (result.missing.length > 0) missingByClass.push({ classId, items: result.missing });
      cards.push(...result.cards);
    }
    if (cards.length === 0 && missingByClass.length > 0) {
      res.status(422).json({ error: 'Reports cannot be generated while required marks are missing or unapproved.', missingByClass });
      return;
    }
    res.json({ generated: cards.length, cards, missingByClass });
  }));

  // --- Retrieval & print data ----------------------------------------

  app.get('/api/academics/reports/cards', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    const isPortal = actor.role === 'PARENT' || actor.role === 'STUDENT';
    const allowed = actor.role === 'PARENT' ? actor.linkedStudentIds ?? []
      : actor.role === 'STUDENT' ? [actor.studentId ?? ''] : null;
    const yearId = req.query.yearId as string | undefined;
    const termId = req.query.termId as string | undefined;
    const year = yearId ? getAcademicYear(schoolId, yearId) : undefined;
    const term = termId ? getTerm(schoolId, termId, year?.id) : undefined;
    const publishedOnly = isPortal || !canViewUnpublishedReports(actor) || req.query.publishedOnly === 'true';
    let cards = db.getReportCards(schoolId, req.query.studentId as string | undefined, {
      academicYear: (req.query.academicYear as string) || year?.name,
      term: (req.query.term as string) || term?.name,
      publishedOnly
    });
    if (allowed) cards = cards.filter(card => allowed.includes(card.studentId));
    if (actor.role === 'TEACHER') {
      const assignedClasses = new Set(getAssignments(schoolId).filter(item => item.teacherIds.includes(actor.id)).map(item => item.classId));
      cards = cards.filter(card => card.classId ? assignedClasses.has(card.classId) : false);
    }
    res.json(cards);
  }));

  app.get('/api/academics/reports/print-data', wrap((req, res) => {
    const actor = actorOf(req);
    if (actor.role === 'PARENT' || actor.role === 'STUDENT') {
      throw new HttpError(403, 'Official bulk printing is restricted to school staff.');
    }
    const schoolId = scopedSchoolId(req);
    const year = getAcademicYear(schoolId, req.query.yearId as string);
    const term = getTerm(schoolId, req.query.termId as string, year?.id);
    let cards = db.getReportCards(schoolId, req.query.studentId as string | undefined, {
      academicYear: year?.name,
      term: term?.name,
      publishedOnly: actor.role === 'TEACHER' ? true : req.query.publishedOnly === 'true'
    });
    const classId = req.query.classId as string | undefined;
    if (classId && classId !== 'all') cards = cards.filter(card => card.classId === classId);
    if (actor.role === 'TEACHER') {
      const assigned = getAssignments(schoolId, year?.id, term?.id, classId)
        .filter(item => item.teacherIds.includes(actor.id)).map(item => item.classId);
      cards = cards.filter(card => card.classId ? assigned.includes(card.classId) : false);
    }
    const distributions = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId);
    const school = db.getSchool(schoolId);
    res.json({
      school,
      academicYear: year,
      term,
      settings: getSettings(schoolId),
      cards: cards.map(card => {
        const attendance = attendanceSummary(schoolId, card.classId ?? '', term, card.studentId);
        return {
          ...card,
          // Per-student values are shared by the HTML sheet and PDF export.
          attendanceDaysPresent: attendance.present,
          attendanceTotalDays: attendance.total,
          distribution: distributions.find(item => item.reportCardId === card.id)?.status ?? 'NOT_GENERATED'
        };
      }),
      total: cards.length
    });
  }));

  app.get('/api/academics/reports/:id', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    const card = db.getReportCardById(schoolId, req.params.id);
    if (!card) throw new HttpError(404, 'Report card not found.');
    const isPortal = actor.role === 'PARENT' || actor.role === 'STUDENT';
    if (isPortal && !card.publishedAt) throw new HttpError(403, 'This report card has not been published.');
    if (actor.role === 'STUDENT' && card.studentId !== actor.studentId) throw new HttpError(403, 'Access denied.');
    if (actor.role === 'PARENT' && !actor.linkedStudentIds?.includes(card.studentId)) throw new HttpError(403, 'Access denied.');
    if (actor.role === 'TEACHER') {
      const assigned = card.classId ? getAssignments(schoolId).some(item =>
        item.classId === card.classId && item.teacherIds.includes(actor.id)) : false;
      if (!card.publishedAt || !assigned) throw new HttpError(403, 'Access denied.');
    } else if (!isPortal && !canViewUnpublishedReports(actor) && !card.publishedAt) {
      throw new HttpError(403, 'This report card has not been published.');
    }
    const distribution = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId)
      .find(item => item.reportCardId === card.id);
    const term = db.getAcademicCollection<AcademicTerm>('terms', schoolId)
      .find(item => item.name === card.term);
    const attendance = attendanceSummary(schoolId, card.classId ?? '', term, card.studentId);
    res.json({
      card: {
        ...card,
        attendanceDaysPresent: attendance.present,
        attendanceTotalDays: attendance.total
      },
      school: db.getSchool(schoolId),
      settings: getSettings(schoolId),
      distribution: distribution?.status ?? 'NOT_GENERATED',
      attendance
    });
  }));

  // --- Publication ----------------------------------------------------

  app.post('/api/academics/reports/:id/publish', wrap((req, res) => {
    const actor = requirePublisher(req);
    const schoolId = scopedSchoolId(req);
    const card = db.getReportCardById(schoolId, req.params.id);
    if (!card) throw new HttpError(404, 'Report card not found.');
    if (!card.isApproved) throw new HttpError(409, 'Only approved report cards can be published.');
    const now = new Date().toISOString();
    const updated = db.updateReportCard(schoolId, card.id, {
      publishedAt: now, publishedBy: actor.id, status: 'PUBLISHED',
      issueDate: card.issueDate ?? now.slice(0, 10)
    });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'PUBLISH_REPORT_CARD', 'REPORT_CARD', card.id, `Published report card for ${card.studentName}`);
    notifyParentsAndStudents(schoolId, card.studentId, card.studentName,
      'Your report card is available', 'Ikarita yawe y’amanota iraboneka',
      `The ${card.term} ${card.academicYear} report card is now available in your portal.`,
      `Ikarita y’amanota ya ${card.term} ${card.academicYear} ubu iraboneka muri portal.`,
      card.id);
    res.json(updated);
  }));

  app.post('/api/academics/reports/publish-batch', wrap((req, res) => {
    const actor = requirePublisher(req);
    const schoolId = scopedSchoolId(req);
    const ids = bodyOf(req).ids;
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new HttpError(400, 'Report card ids are required.');
    const now = new Date().toISOString();
    let published = 0;
    for (const id of ids as string[]) {
      const card = db.getReportCardById(schoolId, id);
      if (!card || !card.isApproved || card.publishedAt) continue;
      db.updateReportCard(schoolId, id, {
        publishedAt: now, publishedBy: actor.id, status: 'PUBLISHED',
        issueDate: card.issueDate ?? now.slice(0, 10)
      });
      notifyParentsAndStudents(schoolId, card.studentId, card.studentName,
        'Your report card is available', 'Ikarita yawe y’amanota iraboneka',
        `The ${card.term} ${card.academicYear} report card is now available in your portal.`,
        `Ikarita y’amanota ya ${card.term} ${card.academicYear} ubu iraboneka muri portal.`, card.id);
      published += 1;
    }
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'PUBLISH_REPORT_CARDS_BATCH', 'REPORT_CARD', ids.join(','), `Published ${published} report card(s)`);
    res.json({ published });
  }));

  app.post('/api/academics/reports/:id/unpublish', wrap((req, res) => {
    const actor = requirePublisher(req);
    const schoolId = scopedSchoolId(req);
    const reason = typeof bodyOf(req).reason === 'string' ? String(bodyOf(req).reason) : 'Unpublished by authorized administrator';
    const card = db.getReportCardById(schoolId, req.params.id);
    if (!card) throw new HttpError(404, 'Report card not found.');
    const updated = db.updateReportCard(schoolId, card.id, { publishedAt: undefined, status: 'APPROVED' });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UNPUBLISH_REPORT_CARD', 'REPORT_CARD', card.id, reason);
    res.json(updated);
  }));

  // --- Distribution tracking -----------------------------------------

  app.get('/api/academics/distributions', wrap((req, res) => {
    const actor = actorOf(req);
    if (actor.role === 'PARENT' || actor.role === 'STUDENT') {
      throw new HttpError(403, 'Distribution tracking is available to school staff only.');
    }
    const schoolId = scopedSchoolId(req);
    let list = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId);
    const status = req.query.status as string | undefined;
    if (status) list = list.filter(item => item.status === status);
    const classId = req.query.classId as string | undefined;
    if (classId && classId !== 'all') {
      const cardIds = new Set(db.getReportCards(schoolId).filter(card => card.classId === classId).map(card => card.id));
      list = list.filter(item => cardIds.has(item.reportCardId));
    }
    res.json(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }));

  app.post('/api/academics/distributions/:id/printed', wrap((req, res) => {
    const actor = requireDistributor(req);
    const schoolId = scopedSchoolId(req);
    const current = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId)
      .find(item => item.id === req.params.id);
    if (!current) throw new HttpError(404, 'Distribution record not found.');
    if (!['GENERATED', 'PRINTED'].includes(current.status)) {
      throw new HttpError(409, 'This report has already progressed beyond printing.');
    }
    const updated = updateDistribution(schoolId, req.params.id, actor,
      { status: 'PRINTED', printedAt: current.printedAt ?? new Date().toISOString() }, 'PRINTED');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'MARK_REPORT_PRINTED', 'REPORT_DISTRIBUTION', updated.id, `Printed report for ${updated.studentName}`);
    res.json(updated);
  }));

  app.post('/api/academics/distributions/:id/issue', wrap((req, res) => {
    const actor = requireDistributor(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    if (typeof b.issuedToName !== 'string' || !b.issuedToName.trim()) throw new HttpError(400, 'Recipient name is required.');
    const current = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId).find(item => item.id === req.params.id);
    if (!current) throw new HttpError(404, 'Distribution record not found.');
    if (!['GENERATED', 'PRINTED'].includes(current.status)) throw new HttpError(409, 'This report cannot be issued from its current status.');
    const updated = updateDistribution(schoolId, current.id, actor, {
      status: 'ISSUED', issuedAt: new Date().toISOString(),
      issuedToName: String(b.issuedToName).trim(),
      issuedToRelationship: typeof b.relationship === 'string' ? b.relationship : undefined,
      notes: typeof b.notes === 'string' ? b.notes : current.notes
    }, 'ISSUED');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'ISSUE_REPORT_CARD', 'REPORT_DISTRIBUTION', updated.id, `Issued to ${updated.issuedToName}`);
    res.json(updated);
  }));

  app.post('/api/academics/distributions/:id/collect', wrap((req, res) => {
    const actor = requireDistributor(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    if (typeof b.collectedByName !== 'string' || !b.collectedByName.trim()) {
      throw new HttpError(400, 'Collection confirmation name is required.');
    }
    const current = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId).find(item => item.id === req.params.id);
    if (!current) throw new HttpError(404, 'Distribution record not found.');
    if (current.status !== 'ISSUED') throw new HttpError(409, 'Only an issued report can be marked as collected.');
    const updated = updateDistribution(schoolId, current.id, actor, {
      status: 'COLLECTED', collectedAt: new Date().toISOString(),
      collectedByName: String(b.collectedByName).trim()
    }, 'COLLECTED');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CONFIRM_REPORT_COLLECTION', 'REPORT_DISTRIBUTION', updated.id, `Collected by ${updated.collectedByName}`);
    res.json(updated);
  }));

  app.patch('/api/academics/distributions/:id', wrap((req, res) => {
    const actor = requireDistributor(req);
    const schoolId = scopedSchoolId(req);
    const notes = bodyOf(req).notes;
    if (typeof notes !== 'string') throw new HttpError(400, 'Notes are required.');
    const updated = updateDistribution(schoolId, req.params.id, actor, { notes }, 'NOTES_UPDATED');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_REPORT_DISTRIBUTION_NOTES',
      'REPORT_DISTRIBUTION', updated.id, `Notes updated for ${updated.studentName}`);
    res.json(updated);
  }));
}

export { uid };
