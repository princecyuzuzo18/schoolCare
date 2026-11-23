import type { Express, Request, Response } from 'express';
import { db } from './database';
import { requirePermission } from './rbac';
import type { Student, UserProfile } from '../src/types';

/** Minimal RFC-4180 style CSV parser: handles quoted commas and escaped quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

const REQUIRED_COLUMNS = ['firstname', 'lastname', 'dob'];

/**
 * CSV-first student import with row-level validation. Invalid rows are
 * reported and skipped; valid rows are created in the actor's own school.
 * Browser-supplied school IDs are never trusted.
 */
export function registerStudentImportRoutes(app: Express): void {
  app.post(
    '/api/students/import',
    requirePermission('students.write'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user as UserProfile;
        const raw = typeof req.body?.csv === 'string' ? req.body.csv : '';
        if (!raw.trim()) {
          return res.status(400).json({ error: 'CSV content is required.' });
        }

        const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
        if (rows.length < 2) {
          return res.status(400).json({ error: 'CSV must include a header and at least one student row.' });
        }

        const HEADER_ALIASES: Record<string, string> = {
          admissionno: 'admissionnumber',
          class: 'classname',
          bloodgroup: 'bloodgroup',
          dateofbirth: 'dob',
          birthdate: 'dob'
        };
        const headers = rows[0].map(header => {
          const normalized = header.toLowerCase().replace(/[\s_-]/g, '');
          return HEADER_ALIASES[normalized] ?? normalized;
        });
        const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
        if (missing.length) {
          return res.status(400).json({ error: `Missing required columns: ${missing.join(', ')}.` });
        }

        const schoolId = actor.schoolId;
        const activeClasses = db.getActiveClasses(schoolId);
        const activeCombinations = db.getAcademicCollection<any>('combinations', schoolId).filter(
          item => item.status === 'ACTIVE'
        );
        const created: Student[] = [];
        const errors: Array<{ row: number; error: string }> = [];

        for (let index = 1; index < rows.length; index += 1) {
          const cells = rows[index];
          const record: Record<string, string> = {};
          headers.forEach((header, position) => {
            record[header] = cells[position] ?? '';
          });

          const firstName = record.firstname ?? '';
          const lastName = record.lastname ?? '';
          const dob = record.dob ?? '';
          const rowNumber = index + 1;

          if (!firstName || !lastName || !dob || Number.isNaN(Date.parse(dob))) {
            errors.push({ row: rowNumber, error: 'First name, last name and a valid date of birth are required.' });
            continue;
          }

          const gender = String(record.gender || 'M').toUpperCase() === 'F' ? 'F' : 'M';
          const classMatch = activeClasses.find(cls =>
            cls.id === record.classid ||
            cls.name.toLowerCase() === String(record.classname || '').toLowerCase()
          ) ?? activeClasses[0];
          const combinationMatch = activeCombinations.find(combination =>
            [combination.id, combination.name, combination.code].some(value =>
              String(value || '').toLowerCase() === String(record.combination || '').toLowerCase()
            )
          ) ?? activeCombinations.find(combination => combination.id === classMatch?.combinationId);

          if (!classMatch || !combinationMatch) {
            errors.push({
              row: rowNumber,
              error: 'No active class or combination is available for this row.'
            });
            continue;
          }

          const student = {
            id: `std-${Date.now()}-${index}`,
            schoolId,
            admissionNumber:
              record.admissionnumber || `ESR-${new Date().getFullYear()}-${Date.now()}-${index}`,
            firstName,
            lastName,
            gender,
            dob,
            classId: classMatch.id,
            className: classMatch.name,
            combination:
              record.combination || combinationMatch.name || classMatch.combination || '',
            combinationId: combinationMatch.id,
            educationLevel: combinationMatch.educationLevel,
            academicProgramme: combinationMatch.academicProgramme,
            enrollmentStatus: 'ACTIVE',
            admissionDate: record.admissiondate || new Date().toISOString().split('T')[0],
            bloodGroup: record.bloodgroup || 'O+',
            allergies: record.allergies || 'None',
            medicalNotes: record.medicalnotes || '',
            photoUrl: '',
            nationalId: record.nationalid || null,
            previousSchool: record.previousschool || null
          } as Student;

          created.push(db.createStudent(student));
        }

        if (created.length) {
          db.logAudit(
            schoolId,
            actor.id,
            actor.fullName,
            actor.role,
            'STUDENTS_IMPORTED',
            'STUDENT',
            `${created.length}`,
            `CSV import created ${created.length} student record(s); ${errors.length} row(s) rejected`,
            req.ip
          );
        }

        return res.json({ created: created.length, rejected: errors.length, errors, students: created });
      } catch (error) {
        console.error('[Students] CSV import failed:', error);
        return res.status(500).json({ error: 'Unable to import students.' });
      }
    }
  );
}
