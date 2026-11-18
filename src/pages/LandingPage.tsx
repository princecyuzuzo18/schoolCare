import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Facebook,
  GraduationCap,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  School,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
  Youtube
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LandingPageProps {
  onNavigate: (tab: string) => void;
  publicMode?: boolean;
}

interface Feature {
  title: string;
  description: string;
  items: string[];
  icon: LucideIcon;
}

type PolicyKey = 'privacy' | 'terms';

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About Us' },
  { id: 'features', label: 'Features' },
  { id: 'services', label: 'Our Services' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'contact', label: 'Contact Us' }
] as const;

const FEATURES: Feature[] = [
  {
    title: 'Student Management',
    description: 'Keep every learner record accurate, complete, and easy to find.',
    items: ['Student registration', 'Student profiles', 'Academic records', 'Information management'],
    icon: Users
  },
  {
    title: 'Teacher Management',
    description: 'Organize your school community and manage staff responsibilities.',
    items: ['Teacher registration', 'Teacher profiles', 'Teacher assignments', 'Staff management'],
    icon: UserCheck
  },
  {
    title: 'Academic Management',
    description: 'Plan teaching and learning with a clear academic structure.',
    items: ['Classes and subjects', 'Timetables', 'Examinations', 'Results and grading'],
    icon: GraduationCap
  },
  {
    title: 'Attendance Management',
    description: 'Understand attendance patterns and follow up when it matters.',
    items: ['Student attendance', 'Teacher attendance', 'Tracking and reports'],
    icon: ClipboardCheck
  },
  {
    title: 'Financial Management',
    description: 'Make fees, payment records, and balances easier to manage.',
    items: ['School fees', 'Payment records', 'Outstanding balances', 'Financial reports'],
    icon: CreditCard
  },
  {
    title: 'Communication',
    description: 'Keep families informed and connected to school life.',
    items: ['Announcements', 'Parent-teacher communication', 'Notifications'],
    icon: MessageSquare
  },
  {
    title: 'Reports and Analytics',
    description: 'Turn everyday school information into useful insight.',
    items: ['Academic performance', 'Student statistics', 'Financial statistics', 'Administrative reports'],
    icon: BarChart3
  },
  {
    title: 'Security and Access Control',
    description: 'Protect school information with clear, role-based access.',
    items: ['Role-based permissions', 'Secure authentication', 'Protected school information'],
    icon: ShieldCheck
  }
];

const BENEFITS = [
  {
    title: 'Improved Efficiency',
    description: 'Replace scattered registers and repetitive paperwork with clear, connected workflows.',
    icon: Sparkles
  },
  {
    title: 'Better Communication',
    description: 'Give teachers, families, and administrators a reliable shared view of what matters.',
    icon: MessageSquare
  },
  {
    title: 'Centralized Information Management',
    description: 'Keep academic, attendance, finance, and communication records in one organized place.',
    icon: School
  }
];

const STEPS = [
  {
    title: 'Register Your School',
    description: 'Create your school profile and set up the essentials in one place.',
    icon: School
  },
  {
    title: 'Configure Academic Information',
    description: 'Add classes, subjects, terms, and timetables to match your school.',
    icon: BookOpen
  },
  {
    title: 'Add Students and Teachers',
    description: 'Build your school community with secure, role-based profiles.',
    icon: Users
  },
  {
    title: 'Manage Your School Digitally',
    description: 'Use one platform for daily operations, communication, and reporting.',
    icon: CheckCircle2
  }
];

const DEMO_STATISTICS = [
  { value: 12, label: 'Schools Supported' },
  { value: 8400, label: 'Students Managed' },
  { value: 460, label: 'Teachers Connected' },
  { value: 125000, label: 'Academic Activities Managed' }
];

const POLICY_CONTENT: Record<PolicyKey, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    paragraphs: [
      'SchoolCare is designed to keep school information organized, access-controlled, and available only to authorized roles.',
      'This public demonstration page does not collect personal information through forms. Production deployments should publish the school’s approved data-protection notice before collecting student, parent, or staff data.',
      'For questions about how your school handles information, contact the school directly using the details in the footer.'
    ]
  },
  terms: {
    title: 'Terms and Conditions',
    paragraphs: [
      'Access to the SchoolCare platform is provisioned by school administrators for authorized students, parents, guardians, teachers, and staff.',
      'Accounts are role-based and must be used only for legitimate school administration and learning activities.',
      'Production use is subject to the school’s published policies and applicable data-protection requirements.'
    ]
  }
};

const SOCIAL_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Facebook', href: 'https://www.facebook.com/', icon: Facebook },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/', icon: Linkedin },
  { label: 'Instagram', href: 'https://www.instagram.com/', icon: Instagram },
  { label: 'YouTube', href: 'https://www.youtube.com/', icon: Youtube }
];

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'true';

    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const duration = 1400;
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplayValue(Math.floor(value * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={ref}>{displayValue.toLocaleString('en-US')}</span>;
};

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, publicMode = false }) => {
  const { school } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [policy, setPolicy] = useState<PolicyKey | null>(null);

  const schoolName = school?.name || 'ES RUBENGERA RTB';
  const schoolEmail = school?.email || 'info@esrubengera.rw';
  const schoolPhone = school?.phone || '+250 788 999 112';
  const schoolAddress = [school?.sector, school?.district, school?.province, school?.country]
    .filter(Boolean)
    .join(', ') || 'Rubengera Sector, Karongi District, Western Province, Rwanda';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen && !policy) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        setPolicy(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen, policy]);

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'true';
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const handleNavigate = (target: string) => {
    setMobileMenuOpen(false);
    if (target === 'sign-in' || target === 'get-started') {
      onNavigate(publicMode ? 'login' : 'dashboard');
      return;
    }
    if (publicMode) {
      scrollToSection(target);
      return;
    }
    onNavigate(target);
  };

  return (
    <div className="marketing-page min-h-screen overflow-x-hidden bg-[#FAF7EF] text-[#202B29]">
      {publicMode && (
        <header
          className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
            scrolled || mobileMenuOpen
              ? 'border-b border-[#064E3B]/10 bg-[#FAF7EF]/95 shadow-[0_12px_40px_rgba(6,78,59,0.09)] backdrop-blur-xl'
              : 'border-b border-transparent bg-[#FAF7EF]/80 backdrop-blur-md'
          }`}
        >
          <div className="marketing-shell flex h-[4.5rem] items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => handleNavigate('home')}
              className="group flex shrink-0 items-center gap-3 text-left"
              aria-label="SchoolCare home"
            >
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-[#064E3B] shadow-lg shadow-[#064E3B]/20 transition-transform duration-300 group-hover:-rotate-3">
                <img src="/logo.svg" alt="" className="h-8 w-8" />
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-bold tracking-tight text-[#064E3B]">SchoolCare</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A7A57]">
                  School Management
                </span>
              </span>
            </button>

            <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map(link => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleNavigate(link.id)}
                  className="rounded-full px-3.5 py-2 text-sm font-semibold text-[#43514D] transition-colors hover:bg-[#064E3B]/8 hover:text-[#064E3B]"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            <div className="hidden items-center gap-2.5 lg:flex">
              <button
                type="button"
                onClick={() => handleNavigate('sign-in')}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-[#064E3B] transition-colors hover:bg-[#064E3B]/8"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('get-started')}
                className="marketing-primary-btn px-5 py-2.5 text-sm"
              >
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(value => !value)}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[#064E3B]/15 bg-white text-[#064E3B] shadow-sm lg:hidden"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <nav
              id="mobile-navigation"
              aria-label="Mobile navigation"
              className="border-t border-[#064E3B]/10 bg-[#FAF7EF] px-5 pb-6 pt-4 shadow-xl lg:hidden"
            >
              <div className="mx-auto flex max-w-md flex-col gap-1">
                {NAV_LINKS.map(link => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => handleNavigate(link.id)}
                    className="rounded-xl px-4 py-3 text-left text-sm font-bold text-[#31413C] transition-colors hover:bg-white hover:text-[#064E3B]"
                  >
                    {link.label}
                  </button>
                ))}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleNavigate('sign-in')}
                    className="rounded-xl border border-[#064E3B]/20 bg-white px-4 py-3 text-sm font-bold text-[#064E3B]"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('get-started')}
                    className="marketing-primary-btn justify-center px-4 py-3 text-sm"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </nav>
          )}
        </header>
      )}

      <main className={publicMode ? 'pt-[4.5rem]' : ''}>
        <section id="home" aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
          <div className="marketing-hero-glow absolute inset-0 -z-10" aria-hidden="true" />
          <div className="marketing-grid-bg absolute inset-0 -z-10 opacity-40" aria-hidden="true" />
          <div className="marketing-shell grid items-center gap-14 py-16 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10 lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex flex-wrap items-center gap-2 rounded-full border border-[#D6A84F]/45 bg-white/80 px-4 py-2 text-xs font-bold text-[#6D5B2F] shadow-sm backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-[#D6A84F]" />
                {schoolName} <span className="text-[#B9A982]">•</span> Karongi, Rwanda
              </div>

              <h1
                id="hero-heading"
                className="text-4xl font-bold leading-[1.08] tracking-tight text-[#064E3B] sm:text-5xl lg:text-[4.1rem]"
              >
                Smarter School Management,{' '}
                <span className="relative inline-block text-[#0B6B51]">
                  Better Education.
                  <svg
                    className="absolute -bottom-2 left-0 h-3 w-full text-[#D6A84F]/70"
                    viewBox="0 0 300 12"
                    fill="none"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M3 9C76 2 218 2 297 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-8 text-[#52615C] sm:text-lg">
                An integrated school administration platform designed to simplify academic management, improve communication, and
                connect students, teachers, parents, and administrators.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleNavigate('get-started')}
                  className="marketing-primary-btn px-7 py-4 text-sm"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('features')}
                  className="marketing-secondary-btn px-6 py-4 text-sm"
                >
                  Explore Features
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-11 flex flex-wrap items-center gap-4 border-t border-[#064E3B]/12 pt-6">
                <div className="flex -space-x-2.5" aria-hidden="true">
                  {['SA', 'TE', 'PA', 'ST'].map((initials, index) => (
                    <span
                      key={initials}
                      className={`grid h-10 w-10 place-items-center rounded-full border-2 border-[#FAF7EF] text-[10px] font-bold text-white ${
                        ['bg-[#064E3B]', 'bg-[#0B6B51]', 'bg-[#B98B36]', 'bg-[#3F5D54]'][index]
                      }`}
                    >
                      {initials}
                    </span>
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-bold text-[#064E3B]">Built for modern school management</p>
                  <p className="mt-0.5 text-[#6B7874]">Admins · Teachers · Parents · Students</p>
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[34rem] lg:mr-0">
              <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[#D6A84F]/20 blur-3xl" aria-hidden="true" />
              <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-[#0B6B51]/10 blur-3xl" aria-hidden="true" />

              <div className="relative rounded-[2.4rem] bg-[#064E3B] p-3 shadow-[0_35px_90px_rgba(6,78,59,0.28)]">
                <div className="overflow-hidden rounded-[1.9rem] bg-white">
                  <div className="relative h-52 overflow-hidden sm:h-60">
                    <img
                      src="/school-classroom.svg"
                      alt="Students learning together in a classroom"
                      className="h-full w-full object-cover"
                      fetchPriority="high"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#032B21]/90 via-[#032B21]/10 to-transparent" />
                    <div className="absolute bottom-4 left-5 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#E8C97F]">Connected campus</p>
                      <p className="mt-1 text-lg font-bold">{schoolName}</p>
                    </div>
                    <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#064E3B] backdrop-blur-sm">
                      Interface preview
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
                    <div className="rounded-2xl bg-[#F6F3EA] p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7A57]">Attendance</p>
                        <UserCheck className="h-4 w-4 text-[#0B6B51]" aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-lg font-bold text-[#064E3B]">Roll call ready</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E7DFC9]">
                        <div className="h-full w-4/5 rounded-full bg-[#D6A84F]" />
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#EAF4EF] p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#4F6E63]">Academics</p>
                        <BookOpen className="h-4 w-4 text-[#0B6B51]" aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-lg font-bold text-[#064E3B]">Records synced</p>
                      <p className="mt-3 text-[11px] font-medium text-[#678077]">Classes · Exams · Results</p>
                    </div>
                  </div>

                  <div className="border-t border-[#EEE9DD] px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6E7C77]">Today at a glance</p>
                      <span className="rounded-full bg-[#EAF4EF] px-2.5 py-1 text-[10px] font-bold text-[#0B6B51]">Demo</span>
                    </div>
                    {[
                      { time: '08:30', label: 'Morning roll call', icon: CalendarCheck },
                      { time: '10:15', label: 'Teacher assignments', icon: Users },
                      { time: '14:00', label: 'Parent notifications', icon: Bell }
                    ].map(({ time, label, icon: Icon }) => (
                      <div key={time} className="flex items-center gap-3 border-t border-[#F1EDE3] py-2.5 first:border-0">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F6F3EA] text-[#B98B36]">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="flex-1 text-xs font-semibold text-[#45534F]">{label}</span>
                        <span className="text-[11px] font-bold text-[#899590]">{time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="marketing-float absolute -bottom-6 -left-3 flex max-w-[16rem] items-center gap-3 rounded-2xl border border-white/70 bg-white p-3.5 shadow-[0_18px_50px_rgba(6,78,59,0.16)] sm:-left-8">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAF4EF] text-[#0B6B51]">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold text-[#064E3B]">Families stay informed</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7874]">Announcements and alerts in one place</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" aria-labelledby="about-heading" className="bg-white py-20 lg:py-28">
          <div className="marketing-shell grid items-center gap-14 lg:grid-cols-2">
            <div className="relative">
              <div className="absolute -left-6 top-8 hidden h-full w-40 rounded-[2.5rem] border border-[#D6A84F]/30 md:block" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[2.3rem] bg-[#EAF4EF] shadow-[0_24px_70px_rgba(6,78,59,0.14)]">
                <img
                  src="/school-library.svg"
                  alt="A calm school library with books and study areas"
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="relative -mt-10 ml-auto mr-4 max-w-[16rem] rounded-2xl bg-[#064E3B] p-5 text-white shadow-xl sm:mr-8">
                <p className="text-2xl font-bold leading-tight">One school. One connected system.</p>
                <p className="mt-2 text-xs leading-5 text-[#C7DED5]">Designed around the daily reality of school life.</p>
              </div>
            </div>

            <div className="max-w-xl">
              <span className="marketing-eyebrow">About the platform</span>
              <h2 id="about-heading" className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#064E3B] sm:text-4xl">
                A better way to run a school, starting with the people in it.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#52615C]">
                SchoolCare brings the essential work of school administration into one calm, organized digital space. It connects
                the people who care for learners every day and gives each of them the right information at the right time.
              </p>
              <p className="mt-4 text-sm leading-7 text-[#6B7874]">
                Built for {schoolName} and ready for modern educational institutions, the platform supports academic management,
                student care, family communication, finance, and reporting without the confusion of disconnected tools.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: School, label: 'Made for school teams' },
                  { icon: ShieldCheck, label: 'Role-aware by design' },
                  { icon: Users, label: 'Family connected' },
                  { icon: BarChart3, label: 'Insight ready' }
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-[#E9E4D9] bg-[#FAF7EF] px-4 py-3">
                    <Icon className="h-5 w-5 shrink-0 text-[#0B6B51]" aria-hidden="true" />
                    <span className="text-sm font-bold text-[#31413C]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" aria-labelledby="features-heading" className="py-20 lg:py-28">
          <div className="marketing-shell">
            <div className="mx-auto max-w-2xl text-center">
              <span className="marketing-eyebrow">Platform features</span>
              <h2 id="features-heading" className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#064E3B] sm:text-4xl">
                Everything your school needs, beautifully connected.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#61706B]">
                Purpose-built tools that work together, so your team can spend less time managing information and more time
                supporting learning.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {FEATURES.map(({ title, description, items, icon: Icon }) => (
                <article key={title} className="marketing-card group flex min-h-[19rem] flex-col rounded-[1.75rem] bg-white p-6">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EAF4EF] text-[#0B6B51] transition-colors duration-300 group-hover:bg-[#DCEDE4]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold leading-snug text-[#064E3B]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#687570]">{description}</p>
                  <ul className="mt-5 space-y-2 border-t border-[#EEE9DD] pt-4">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-xs font-medium leading-5 text-[#52615C]">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B98B36]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="services" aria-labelledby="services-heading" className="bg-white py-20 lg:py-28">
          <div className="marketing-shell grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <span className="marketing-eyebrow">Why choose our platform</span>
              <h2 id="services-heading" className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#064E3B] sm:text-4xl">
                Designed for clarity, built for real school life.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#52615C]">
                A school platform should make work feel lighter. SchoolCare gives every role a clear path, a shared source of
                truth, and the confidence to act quickly.
              </p>
              <div className="relative mt-9 overflow-hidden rounded-[2rem] bg-[#064E3B] p-7 text-white shadow-[0_24px_70px_rgba(6,78,59,0.2)]">
                <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full border border-white/10" aria-hidden="true" />
                <div className="absolute -bottom-20 right-24 h-48 w-48 rounded-full border border-[#D6A84F]/20" aria-hidden="true" />
                <div className="relative flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#E8C97F]">
                    <Bell className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">One place for every important update</p>
                    <p className="mt-1 text-xs leading-5 text-[#C7DED5]">Academic, care, and communication records that stay connected.</p>
                  </div>
                </div>
                <div className="relative mt-6 flex flex-wrap gap-2">
                  {['Students', 'Teachers', 'Families', 'Reports'].map(label => (
                    <span key={label} className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-bold">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {BENEFITS.map(({ title, description, icon: Icon }, index) => (
                <article key={title} className="marketing-card group flex gap-5 rounded-[1.6rem] bg-[#FAF7EF] p-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#0B6B51] shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold tracking-[0.2em] text-[#B98B36]">0{index + 1}</span>
                      <h3 className="text-lg font-bold text-[#064E3B]">{title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#687570]">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="stats-heading" className="relative isolate overflow-hidden bg-[#064E3B] py-20 text-white lg:py-24">
          <div className="marketing-ring absolute -right-24 -top-40 h-[32rem] w-[32rem] rounded-full border border-white/8" aria-hidden="true" />
          <div className="marketing-ring absolute -bottom-52 -left-24 h-[30rem] w-[30rem] rounded-full border border-[#D6A84F]/15" aria-hidden="true" />
          <div className="marketing-shell relative">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D6A84F]/35 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#E8C97F]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Demonstration figures
              </span>
              <h2 id="stats-heading" className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                A clear view of everyday school impact.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#C7DED5]">
                Illustrative values shown for design purposes. Replace them with verified live metrics when available.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_STATISTICS.map(({ value, label }) => (
                <div key={label} className="rounded-[1.6rem] border border-white/12 bg-white/6 p-6 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      <AnimatedNumber value={value} />
                      <span className="text-[#D6A84F]">+</span>
                    </p>
                    <span className="rounded-full bg-[#D6A84F]/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#E8C97F]">
                      Demo
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#D7E8E1]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="steps-heading" className="py-20 lg:py-28">
          <div className="marketing-shell">
            <div className="mx-auto max-w-2xl text-center">
              <span className="marketing-eyebrow">How it works</span>
              <h2 id="steps-heading" className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#064E3B] sm:text-4xl">
                Four simple steps to a more connected school.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#61706B]">
                A guided path from first setup to confident everyday use.
              </p>
            </div>

            <div className="relative mt-14 grid gap-6 md:grid-cols-4">
              <div className="absolute left-[12%] right-[12%] top-7 hidden border-t-2 border-dashed border-[#D6A84F]/45 md:block" aria-hidden="true" />
              {STEPS.map(({ title, description, icon: Icon }, index) => (
                <article key={title} className="relative text-center">
                  <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#064E3B] text-white shadow-lg shadow-[#064E3B]/20">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[#D6A84F] text-[10px] font-bold text-[#3B2D0E]">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-base font-bold leading-snug text-[#064E3B]">{title}</h3>
                  <p className="mx-auto mt-2 max-w-[15rem] text-sm leading-6 text-[#6B7874]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="admissions" aria-labelledby="admissions-heading" className="bg-white pb-20 lg:pb-28">
          <div className="marketing-shell">
            <div className="relative overflow-hidden rounded-[2.2rem] border border-[#E9E4D9] bg-[#FAF7EF] px-6 py-10 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:py-12">
              <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#D6A84F]/12 blur-2xl" aria-hidden="true" />
              <div className="relative max-w-2xl">
                <span className="marketing-eyebrow">Admissions</span>
                <h2 id="admissions-heading" className="mt-3 text-2xl font-bold tracking-tight text-[#064E3B] sm:text-3xl">
                  A smoother start for every new learner.
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#61706B]">
                  Bring registration, student records, and family communication into one clear process from the first day.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleNavigate('get-started')}
                className="marketing-primary-btn relative mt-7 shrink-0 px-6 py-3.5 text-sm lg:mt-0"
              >
                Explore Admissions
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="relative isolate overflow-hidden bg-gradient-to-br from-[#064E3B] via-[#07543F] to-[#04382B] py-20 text-white lg:py-24">
          <div className="marketing-ring absolute -left-32 -top-44 h-[34rem] w-[34rem] rounded-full border border-white/8" aria-hidden="true" />
          <div className="absolute bottom-0 right-0 h-72 w-72 translate-x-1/3 translate-y-1/3 rounded-full bg-[#D6A84F]/15 blur-3xl" aria-hidden="true" />
          <div className="marketing-shell relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D6A84F]/35 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#E8C97F]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Ready when your school is
            </span>
            <h2 id="cta-heading" className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Your School Deserves Smarter Management.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-[#C7DED5]">
              Bring your school operations together with one reliable and easy-to-use management platform.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate('get-started')}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#D6A84F] px-7 py-4 text-sm font-bold text-[#2C2208] shadow-lg shadow-black/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#E5BC6B]"
              >
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <a
                href={`mailto:${schoolEmail}?subject=SchoolCare%20platform%20enquiry`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10"
              >
                Contact Our Team
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" aria-labelledby="footer-heading" className="bg-[#042A20] pb-8 pt-16 text-white">
        <div className="marketing-shell grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.1fr_1.25fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <img src="/logo.svg" alt="" className="h-8 w-8" />
              </span>
              <div>
                <p id="footer-heading" className="text-lg font-bold tracking-tight">SchoolCare</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E8C97F]">Smarter school management</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#B9CEC6]">
              An integrated school administration platform that simplifies academic management, strengthens communication, and
              connects the whole school community.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${label} social link`}
                  title="Demo link — replace with the official school profile"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/12 bg-white/5 text-[#D7E8E1] transition-colors hover:border-[#D6A84F]/50 hover:text-[#E8C97F]"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[#7FA094]">Demo social links — configure official school profiles.</p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C97F]">Quick navigation</h3>
            <ul className="mt-5 space-y-3">
              {NAV_LINKS.map(link => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(link.id)}
                    className="text-sm font-medium text-[#C7D8D2] transition-colors hover:text-white"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C97F]">Platform features</h3>
            <ul className="mt-5 space-y-3">
              {[
                'Student Management',
                'Teacher Management',
                'Academic Management',
                'Attendance Management',
                'Financial Management',
                'Reports and Analytics'
              ].map(label => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => handleNavigate('features')}
                    className="text-left text-sm font-medium text-[#C7D8D2] transition-colors hover:text-white"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C97F]">Get in touch</h3>
            <div className="mt-5 space-y-4 text-sm text-[#C7D8D2]">
              <p className="font-bold text-white">{schoolName}</p>
              <p className="flex items-start gap-3 leading-6">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" />
                {schoolAddress}
              </p>
              <p className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" />
                <a href={`tel:${schoolPhone.replace(/\s+/g, '')}`} className="hover:text-white">{schoolPhone}</a>
              </p>
              <p className="flex items-center gap-3 break-all">
                <Mail className="h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" />
                <a href={`mailto:${schoolEmail}`} className="hover:text-white">{schoolEmail}</a>
              </p>
            </div>
          </div>
        </div>

        <div className="marketing-shell mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-[#8FAAA0] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SchoolCare Rwanda. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => setPolicy('privacy')} className="font-semibold text-[#C7D8D2] hover:text-white">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setPolicy('terms')} className="font-semibold text-[#C7D8D2] hover:text-white">
              Terms and Conditions
            </button>
          </div>
        </div>
      </footer>

      {policy && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02170F]/75 p-4 backdrop-blur-sm"
          onClick={() => setPolicy(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-title"
            className="w-full max-w-lg rounded-[1.75rem] bg-white p-7 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="policy-title" className="text-xl font-bold text-[#064E3B]">{POLICY_CONTENT[policy].title}</h2>
              <button
                type="button"
                autoFocus
                onClick={() => setPolicy(null)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-[#F6F3EA] text-[#52615C] hover:bg-[#EAF4EF]"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {POLICY_CONTENT[policy].paragraphs.map(paragraph => (
                <p key={paragraph} className="text-sm leading-7 text-[#52615C]">{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
