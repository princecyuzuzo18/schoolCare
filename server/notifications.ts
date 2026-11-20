import nodemailer from 'nodemailer';
import type {
  AdmissionApplication,
  AdmissionNotificationStatus,
  ApplicationStatus,
  StaffInvitationDeliveryMode
} from '../src/types';

function commaList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export function smsConfigured(): boolean {
  return Boolean(process.env.SMS_GATEWAY_URL && process.env.SMS_API_KEY);
}

async function sendEmail(to: string, subject: string, text: string): Promise<AdmissionNotificationStatus> {
  if (!emailConfigured()) {
    return { channel: 'email', configured: false, sent: false, detail: 'Email provider is not configured.' };
  }
  try {
    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text
    });
    return { channel: 'email', configured: true, sent: true };
  } catch (error) {
    return {
      channel: 'email',
      configured: true,
      sent: false,
      detail: error instanceof Error ? error.message : 'Email delivery failed.'
    };
  }
}

async function sendSms(to: string, text: string): Promise<AdmissionNotificationStatus> {
  if (!smsConfigured()) {
    return { channel: 'sms', configured: false, sent: false, detail: 'SMS provider is not configured.' };
  }
  try {
    const response = await fetch(process.env.SMS_GATEWAY_URL as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SMS_API_KEY}`
      },
      body: JSON.stringify({
        to,
        message: text,
        senderId: process.env.SMS_SENDER_ID || 'SchoolCare'
      }),
      signal: AbortSignal.timeout(6000)
    });
    return {
      channel: 'sms',
      configured: true,
      sent: response.ok,
      detail: response.ok ? undefined : `SMS gateway returned HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      channel: 'sms',
      configured: true,
      sent: false,
      detail: error instanceof Error ? error.message : 'SMS delivery failed.'
    };
  }
}

function statusLabel(status: ApplicationStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function notifySubmission(application: AdmissionApplication): Promise<AdmissionNotificationStatus[]> {
  const results: AdmissionNotificationStatus[] = [];
  const reference = application.referenceNumber;
  const applicantMessage =
    `SchoolCare Admissions: your application ${reference} was received. ` +
    'The school will contact you using the details you provided. Keep this reference number for future communication.';

  if (application.applicantEmail) {
    results.push(
      await sendEmail(
        application.applicantEmail,
        `SchoolCare application ${reference} received`,
        applicantMessage
      )
    );
  }
  if (smsConfigured() && application.applicantPhone) {
    results.push(await sendSms(application.applicantPhone, applicantMessage));
  }

  const adminEmails = commaList(process.env.ADMISSIONS_NOTIFICATION_EMAILS);
  if (adminEmails.length > 0) {
    const adminBody =
      `A new ${application.applicationType} application was submitted.\n` +
      `Reference: ${reference}\nApplicant: ${application.applicantFullName}\n` +
      `Submitted: ${application.submittedAt}\n\nReview it in SchoolCare > Admissions Management.`;
    for (const email of adminEmails) {
      results.push(await sendEmail(email, `New SchoolCare application ${reference}`, adminBody));
    }
  }

  return results;
}

export async function notifyStatusChange(
  application: AdmissionApplication,
  status: ApplicationStatus,
  responseNote?: string
): Promise<AdmissionNotificationStatus[]> {
  const results: AdmissionNotificationStatus[] = [];
  const message =
    `SchoolCare Admissions: the status of application ${application.referenceNumber} is now ${statusLabel(status)}.` +
    (responseNote ? ` School response: ${responseNote}` : '') +
    ' Use your reference number and registered contact to view the update.';

  if (application.applicantEmail) {
    results.push(
      await sendEmail(
        application.applicantEmail,
        `Update on SchoolCare application ${application.referenceNumber}`,
        message
      )
    );
  }
  if (smsConfigured() && application.applicantPhone) {
    results.push(await sendSms(application.applicantPhone, message));
  }
  return results;
}

export async function sendVerificationCode(
  application: AdmissionApplication,
  channel: 'email' | 'sms',
  code: string
): Promise<AdmissionNotificationStatus> {
  const message = `Your SchoolCare application verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`;
  if (channel === 'email' && application.applicantEmail) {
    return sendEmail(
      application.applicantEmail,
      `Verification code for ${application.referenceNumber}`,
      message
    );
  }
  return sendSms(application.guardianPhone || application.applicantPhone, message);
}

/**
 * Sends a one-time code for account sign-up through the same configured
 * SMS/email gateways used by admissions. Callers must hash the code before
 * storing it; the raw code is never persisted.
 */
export async function sendAccountVerificationCode(
  to: string,
  channel: 'email' | 'sms',
  code: string
): Promise<AdmissionNotificationStatus> {
  const recipient = to.trim();
  if (!recipient) {
    return { channel, configured: false, sent: false, detail: 'No verification contact is on file.' };
  }
  const message =
    `Your SchoolCare account verification code is ${code}. ` +
    'It expires in 10 minutes. Do not share it with anyone.';
  if (channel === 'email') {
    return sendEmail(recipient, 'Verify your SchoolCare account', message);
  }
  return sendSms(recipient, message);
}

/**
 * Attempts to deliver a staff invitation through the configured channels.
 * The raw activation token is only placed in the message body; it is never
 * written to application logs or to the invitation record.
 */
export async function notifyStaffInvitation(input: {
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  activationUrl: string;
  deliveryMode?: StaffInvitationDeliveryMode;
}): Promise<AdmissionNotificationStatus[]> {
  if (input.deliveryMode === 'SECURE_ACTIVATION') {
    return [{
      channel: 'email',
      configured: false,
      sent: false,
      detail: 'Secure activation link was prepared for manual handover.'
    }];
  }

  const results: AdmissionNotificationStatus[] = [];
  const message =
    `SchoolCare staff invitation for ${input.fullName} (${input.role}). ` +
    `Open this one-time activation link to set your password: ${input.activationUrl} ` +
    'The link expires in 7 days. Do not share it.';

  if (input.email) {
    results.push(await sendEmail(input.email, 'Your SchoolCare staff invitation', message));
  }
  if (smsConfigured() && input.phone) {
    results.push(await sendSms(input.phone, message));
  }
  if (results.length === 0) {
    results.push({
      channel: 'email',
      configured: false,
      sent: false,
      detail: 'No delivery contact available. Share the activation link securely.'
    });
  }
  return results;
}
