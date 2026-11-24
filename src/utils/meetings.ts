/**
 * Helpers for the structured Meetings and Collaboration workspace.
 *
 * These records are stored in the existing generic module store
 * (`meetings` / `collaboration`). This file only normalizes the payload shape
 * and keeps external links and user-entered lists safe; it is not a second
 * data store.
 */

export type MeetingResponseValue = 'YES' | 'NO' | 'MAYBE';
export type TaskStatus = 'OPEN' | 'DONE';

export interface AttendeeResponse {
  userId: string;
  name: string;
  response: MeetingResponseValue;
  respondedAt: string;
  note?: string;
}

export interface MeetingTask {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  status: TaskStatus;
}

export interface WorkspaceRecord {
  id: string;
  title: string;
  date: string;
  time: string;
  link: string;
  invitees: string[];
  agenda: string[];
  notes: string;
  minutes: string;
  tasks: MeetingTask[];
  responses: AttendeeResponse[];
  status: TaskStatus;
  createdAt?: string;
  createdBy?: string;
}

export type WorkspaceMode = 'meetings' | 'collaboration';

const RESPONSE_VALUES: readonly MeetingResponseValue[] = ['YES', 'NO', 'MAYBE'];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

/** Only http(s) links are rendered as clickable external meeting links. */
export function safeExternalLink(value: string): string | null {
  const candidate = asText(value).trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeResponse(value: unknown): AttendeeResponse | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const response = asText(raw.response).toUpperCase() as MeetingResponseValue;
  if (!RESPONSE_VALUES.includes(response)) return null;
  return {
    userId: asText(raw.userId),
    name: asText(raw.name),
    response,
    respondedAt: asText(raw.respondedAt),
    note: asText(raw.note) || undefined
  };
}

function normalizeTask(value: unknown): MeetingTask | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = asText(raw.title).trim();
  if (!title) return null;
  return {
    id: asText(raw.id) || createLocalId('task'),
    title,
    owner: asText(raw.owner),
    dueDate: asText(raw.dueDate),
    status: asText(raw.status).toUpperCase() === 'DONE' ? 'DONE' : 'OPEN'
  };
}

export function createLocalId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${random}`;
}

export function normalizeWorkspaceRecord(raw: Record<string, unknown>): WorkspaceRecord {
  return {
    id: asText(raw.id),
    title: asText(raw.title ?? raw.name),
    date: asText(raw.date),
    time: asText(raw.time),
    link: asText(raw.link),
    invitees: asArray(raw.invitees ?? raw.attendees ?? raw.participants).map(asText).filter(Boolean),
    agenda: asArray(raw.agenda).map(asText).filter(Boolean),
    notes: asText(raw.notes),
    minutes: asText(raw.minutes),
    tasks: asArray(raw.tasks).map(normalizeTask).filter((task): task is MeetingTask => Boolean(task)),
    responses: asArray(raw.responses).map(normalizeResponse).filter((item): item is AttendeeResponse => Boolean(item)),
    status: asText(raw.status).toUpperCase() === 'DONE' ? 'DONE' : 'OPEN',
    createdAt: asText(raw.createdAt) || undefined,
    createdBy: asText(raw.createdBy) || undefined
  };
}

export function toWorkspacePayload(record: Partial<WorkspaceRecord>): Record<string, unknown> {
  const normalized = normalizeWorkspaceRecord(record as Record<string, unknown>);
  return {
    title: normalized.title,
    date: normalized.date,
    time: normalized.time,
    link: normalized.link,
    invitees: normalized.invitees,
    agenda: normalized.agenda,
    notes: normalized.notes,
    minutes: normalized.minutes,
    tasks: normalized.tasks,
    responses: normalized.responses,
    status: normalized.status
  };
}

export function withResponse(
  record: WorkspaceRecord,
  user: { id: string; fullName: string },
  response: MeetingResponseValue,
  note = ''
): WorkspaceRecord {
  const entry: AttendeeResponse = {
    userId: user.id,
    name: user.fullName,
    response,
    respondedAt: new Date().toISOString(),
    note: note.trim() || undefined
  };
  return {
    ...record,
    responses: [...record.responses.filter(item => item.userId !== user.id), entry]
  };
}

export function withTask(
  record: WorkspaceRecord,
  input: { title: string; owner: string; dueDate: string }
): WorkspaceRecord {
  const title = input.title.trim();
  if (!title) return record;
  return {
    ...record,
    tasks: [
      ...record.tasks,
      {
        id: createLocalId('task'),
        title,
        owner: input.owner.trim(),
        dueDate: input.dueDate,
        status: 'OPEN'
      }
    ]
  };
}

export function withToggledTask(record: WorkspaceRecord, taskId: string): WorkspaceRecord {
  return {
    ...record,
    tasks: record.tasks.map(task =>
      task.id === taskId ? { ...task, status: task.status === 'DONE' ? 'OPEN' : 'DONE' } : task
    )
  };
}

export function responseCounts(record: WorkspaceRecord): Record<MeetingResponseValue, number> {
  return record.responses.reduce(
    (counts, item) => ({ ...counts, [item.response]: counts[item.response] + 1 }),
    { YES: 0, NO: 0, MAYBE: 0 } as Record<MeetingResponseValue, number>
  );
}
