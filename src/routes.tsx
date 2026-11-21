import React from 'react';
import type { HealthIncident } from './types';

import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ParentPortalPage } from './pages/ParentPortalPage';
import { StudentPortalPage } from './pages/StudentPortalPage';
import { HealthCenterPage } from './pages/HealthCenterPage';
import { AttendancePage } from './pages/AttendancePage';
import { CommunicationPage } from './pages/CommunicationPage';
import { StudentsPage } from './pages/StudentsPage';
import { GuardiansPage } from './pages/GuardiansPage';
import { TeacherAcademicsPage } from './pages/TeacherAcademicsPage';
import { AcademicAdminPage } from './pages/AcademicAdminPage';
import { ReportPrintingPage } from './pages/ReportPrintingPage';
import { FinancePage } from './pages/FinancePage';
import { StaffPage } from './pages/StaffPage';
import { TimetablePage } from './pages/TimetablePage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { EventsPage } from './pages/EventsPage';
import { ModuleCrud } from './pages/ModuleCrud';
import { AdmissionsManagementPage } from './pages/AdmissionsManagementPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { SignupRequestsPage } from './pages/SignupRequestsPage';
import { PublicSiteManagementPage } from './pages/PublicSiteManagementPage';

export interface RouteContext {
  onNavigate: (tab: string) => void;
  onOpenIncidentModal: (incident?: HealthIncident) => void;
}

export interface AppRoute {
  id: string;
  title: string;
  render: (context: RouteContext) => React.ReactNode;
}

export const APP_ROUTES: Readonly<Record<string, AppRoute>> = {
  landing: {
    id: 'landing',
    title: 'Home',
    render: ({ onNavigate }) => <LandingPage onNavigate={onNavigate} />
  },
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard',
    render: ({ onNavigate, onOpenIncidentModal }) => (
      <DashboardPage onNavigate={onNavigate} onOpenIncidentModal={onOpenIncidentModal} />
    )
  },
  'parent-portal': {
    id: 'parent-portal',
    title: 'Parent Portal',
    render: () => <ParentPortalPage />
  },
  'student-portal': {
    id: 'student-portal',
    title: 'Student Portal',
    render: () => <StudentPortalPage />
  },
  health: {
    id: 'health',
    title: 'Health & Emergency',
    render: () => <HealthCenterPage />
  },
  attendance: {
    id: 'attendance',
    title: 'Attendance',
    render: () => <AttendancePage />
  },
  communication: {
    id: 'communication',
    title: 'Parent Communication',
    render: () => <CommunicationPage />
  },
  students: {
    id: 'students',
    title: 'Students & Enrollment',
    render: () => <StudentsPage />
  },
  guardians: {
    id: 'guardians',
    title: 'Parents & Guardians',
    render: () => <GuardiansPage />
  },
  academics: {
    id: 'academics',
    title: 'My Academic Work',
    render: () => <TeacherAcademicsPage />
  },
  'academic-admin': {
    id: 'academic-admin',
    title: 'Academic Administration',
    render: () => <AcademicAdminPage />
  },
  'report-printing': {
    id: 'report-printing',
    title: 'Report Cards & Printing',
    render: () => <ReportPrintingPage />
  },
  finance: {
    id: 'finance',
    title: 'Fees & Finance',
    render: () => <FinancePage />
  },
  staff: {
    id: 'staff',
    title: 'Teachers & Staff',
    render: () => <StaffPage />
  },
  'staff-management': {
    id: 'staff-management',
    title: 'Staff Management',
    render: ({ onNavigate }) => <StaffManagementPage onNavigate={onNavigate} />
  },
  permissions: {
    id: 'permissions',
    title: 'Staff Permissions',
    render: () => <PermissionsPage />
  },
  'signup-requests': {
    id: 'signup-requests',
    title: 'Parent & Student Sign-ups',
    render: () => <SignupRequestsPage />
  },
  'public-site': {
    id: 'public-site',
    title: 'Public Website',
    render: () => <PublicSiteManagementPage />
  },
  timetable: {
    id: 'timetable',
    title: 'Timetable & Lessons',
    render: () => <TimetablePage />
  },
  events: {
    id: 'events',
    title: 'Events & Calendar',
    render: () => <EventsPage />
  },
  reports: {
    id: 'reports',
    title: 'Reports & Analytics',
    render: () => <ReportsPage />
  },
  audit: {
    id: 'audit',
    title: 'Audit Logs',
    render: () => <AuditPage />
  },
  admissions: {
    id: 'admissions',
    title: 'Admissions Management',
    render: () => <AdmissionsManagementPage />
  },
  documents: {
    id: 'documents',
    title: 'School Documents',
    render: () => (
      <ModuleCrud
        title="School Documents"
        description="Staff and teacher documents"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'category', label: 'Category' },
          { key: 'owner', label: 'Owner' },
          { key: 'date', label: 'Date', type: 'date' }
        ]}
        moduleKey="documents"
      />
    )
  },
  exams: {
    id: 'exams',
    title: 'Exams & Results',
    render: () => (
      <ModuleCrud
        title="Exams and Results"
        description="Examination records"
        fields={[
          { key: 'examName', label: 'Exam Name' },
          { key: 'subject', label: 'Subject' },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'maxMarks', label: 'Max Marks', type: 'number' }
        ]}
        moduleKey="exams"
      />
    )
  },
  'marking-guides': {
    id: 'marking-guides',
    title: 'Marking Guides',
    render: () => (
      <ModuleCrud
        title="Early Exams & Marking Guides"
        description="Marking guides"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'subject', label: 'Subject' },
          { key: 'guide', label: 'Guide', type: 'textarea' }
        ]}
        moduleKey="marking-guides"
      />
    )
  },
  teaching: {
    id: 'teaching',
    title: 'Teaching & Learning',
    render: () => (
      <ModuleCrud
        title="Teaching and Learning"
        description="Teaching resources"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'subject', label: 'Subject' },
          { key: 'teacher', label: 'Teacher' },
          { key: 'notes', label: 'Notes', type: 'textarea' }
        ]}
        moduleKey="teaching"
      />
    )
  },
  'sms-email': {
    id: 'sms-email',
    title: 'SMS & Email',
    render: () => (
      <ModuleCrud
        title="SMS and Email Messaging"
        description="Messaging log"
        fields={[
          { key: 'recipient', label: 'Recipient' },
          { key: 'channel', label: 'Channel', type: 'select', options: ['SMS', 'Email'] },
          { key: 'message', label: 'Message', type: 'textarea' },
          { key: 'date', label: 'Date', type: 'date' }
        ]}
        moduleKey="sms-email"
      />
    )
  },
  collaboration: {
    id: 'collaboration',
    title: 'Collaboration',
    render: () => (
      <ModuleCrud
        title="School Collaboration"
        description="Collaboration items"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'participants', label: 'Participants' },
          { key: 'notes', label: 'Notes', type: 'textarea' }
        ]}
        moduleKey="collaboration"
      />
    )
  },
  meetings: {
    id: 'meetings',
    title: 'Online Meetings',
    render: () => (
      <ModuleCrud
        title="Online Meetings"
        description="Meeting schedule"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'link', label: 'Link' },
          { key: 'attendees', label: 'Attendees' }
        ]}
        moduleKey="meetings"
      />
    )
  },
  inventory: {
    id: 'inventory',
    title: 'Inventory',
    render: () => (
      <ModuleCrud
        title="Inventory Management"
        description="Resource inventory"
        fields={[
          { key: 'item', label: 'Item' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'location', label: 'Location' },
          { key: 'status', label: 'Status' }
        ]}
        moduleKey="inventory"
      />
    )
  },
  'ai-assistant': {
    id: 'ai-assistant',
    title: 'AI Assistant',
    render: () => <AIAssistantPage />
  },
  discipline: {
    id: 'discipline',
    title: 'Discipline',
    render: () => (
      <ModuleCrud
        title="Student Discipline Management"
        description="Discipline records"
        fields={[
          { key: 'student', label: 'Student' },
          { key: 'incident', label: 'Incident' },
          { key: 'action', label: 'Action' },
          { key: 'date', label: 'Date', type: 'date' }
        ]}
        moduleKey="discipline"
      />
    )
  },
  'partner-schools': {
    id: 'partner-schools',
    title: 'Partner Schools',
    render: () => (
      <ModuleCrud
        title="Partner School Management"
        description="Partner schools"
        fields={[
          { key: 'name', label: 'School Name' },
          { key: 'contact', label: 'Contact' },
          { key: 'email', label: 'Email' },
          { key: 'notes', label: 'Notes', type: 'textarea' }
        ]}
        moduleKey="partner-schools"
      />
    )
  },
  innovations: {
    id: 'innovations',
    title: 'Innovations',
    render: () => (
      <ModuleCrud
        title="Innovations"
        description="Innovation initiatives"
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'owner', label: 'Owner' },
          { key: 'status', label: 'Status' }
        ]}
        moduleKey="innovations"
      />
    )
  },
  settings: {
    id: 'settings',
    title: 'School Settings',
    render: () => <SettingsPage />
  }
};

export function getRoute(tab: string): AppRoute | undefined {
  return APP_ROUTES[tab];
}

export const APP_ROUTE_IDS = Object.keys(APP_ROUTES);
