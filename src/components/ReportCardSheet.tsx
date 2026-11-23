import React from 'react';
import type { ReportCard, School } from '../types';

export type PrintableReportCard = ReportCard & {
  attendance?: { present: number; total: number };
  distribution?: string;
};

interface ReportCardSheetProps {
  card: PrintableReportCard;
  school?: School | null;
  id?: string;
  className?: string;
}

/**
 * Official A4 report-card layout shared by staff printing, PDF export data and
 * the parent/student portals. Every value comes from server-approved data.
 */
export const ReportCardSheet: React.FC<ReportCardSheetProps> = ({ card, school, id, className = '' }) => {
  const attendanceTotal = card.attendance?.total ?? card.attendanceTotalDays;
  const attendancePresent = card.attendance?.present ?? card.attendanceDaysPresent;

  return (
    <div id={id} className={`academic-report-sheet rounded-2xl border border-slate-300 bg-white p-6 shadow-sm ${className}`}>
      <div className="border-b-2 border-slate-800 pb-4 text-center">
        <h2 className="text-xl font-black uppercase tracking-wide">{school?.name || 'SchoolCare'}</h2>
        <p className="text-xs text-slate-600">
          {[school?.sector, school?.district, school?.province].filter(Boolean).join(', ')}
        </p>
        {school?.motto && <p className="mt-1 text-xs italic text-slate-500">{school.motto}</p>}
        <p className="mt-3 text-base font-black">TERM REPORT CARD / INDANGAMANOTA</p>
        <p className="text-xs font-semibold text-slate-600">{card.academicYear} - {card.term}</p>
        {card.publishedAt && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Published {card.publishedAt.slice(0, 10)}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
        <Info label="Student name" value={card.studentName} />
        <Info label="Admission number" value={card.admissionNumber} />
        <Info
          label="Class / combination"
          value={[card.className, card.combination, card.programme].filter(Boolean).join(' - ')}
        />
        <Info
          label="Level / programme"
          value={[card.educationLevel, card.academicLevel].filter(Boolean).join(' - ') || '-'}
        />
        <Info label="Issue date" value={card.issueDate || '-'} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-[10px] uppercase">
              {['Subject', 'Coursework', 'Test', 'Exam', 'Total', 'Grade', 'Rank', 'Remarks'].map(label => (
                <th key={label} className="border border-slate-300 p-2 text-left">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((subject, index) => (
              <tr key={`${subject.subjectName}-${index}`}>
                <td className="border border-slate-300 p-2 font-semibold">
                  {subject.subjectName}
                  {subject.subjectCode && <span className="ml-1 font-normal text-slate-500">({subject.subjectCode})</span>}
                </td>
                <td className="border border-slate-300 p-2">
                  {subject.courseworkScore ?? subject.catScore}/{(subject.courseworkMax ?? subject.catMax)}
                </td>
                <td className="border border-slate-300 p-2">{subject.testScore ?? 0}/{subject.testMax ?? 0}</td>
                <td className="border border-slate-300 p-2">{subject.examScore}/{subject.examMax}</td>
                <td className="border border-slate-300 p-2 font-bold">
                  {subject.totalMarks ?? subject.catScore + subject.examScore}
                </td>
                <td className="border border-slate-300 p-2 font-bold">{subject.grade}</td>
                <td className="border border-slate-300 p-2">{subject.rankInClass || '-'}</td>
                <td className="border border-slate-300 p-2">{subject.teacherComment || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <Info label="Overall average" value={`${card.overallAverage}%`} />
        <Info label="Overall grade" value={card.overallGrade || '-'} />
        <Info label="Position" value={card.overallRank ? `${card.overallRank} / ${card.totalStudentsInClass || 1}` : '-'} />
        <Info label="Attendance" value={attendanceTotal ? `${attendancePresent} / ${attendanceTotal} days` : '-'} />
        <Info label="Conduct" value={card.conductScore || card.conductRemarks || '-'} />
        <Info label="Promotion" value={card.promotionDecision || 'Not configured'} />
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <Info label="Class teacher remarks" value={card.classTeacherRemarks || 'Not recorded'} />
        <Info label="Head teacher remarks" value={card.headTeacherRemarks || 'Not recorded'} />
        <Info label="Strengths" value={card.strengths || 'Not recorded'} />
        <Info label="Areas for improvement" value={card.areasForImprovement || 'Not recorded'} />
      </div>

      <div className="mt-8 grid gap-6 text-xs sm:grid-cols-3">
        <Signature label="Class teacher" name={card.classTeacherName || ''} />
        <Signature label="Head teacher" name={card.headTeacherName || ''} />
        <div className="flex h-20 items-center justify-center rounded-full border-2 border-slate-400 text-[10px] font-bold text-slate-400">
          SCHOOL STAMP
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] text-slate-400">
        Generated from approved marks. Unauthorized alteration of this report is prohibited.
      </p>
    </div>
  );
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="border-b border-slate-500 pb-1">&nbsp;</div>
      <p className="mt-1 font-bold">{label}</p>
      <p className="text-slate-600">{name || '-'}</p>
    </div>
  );
}
