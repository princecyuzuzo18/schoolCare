import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { getVisibleNavSections, type NavItem } from '../navigation';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  urgentIncidentCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onNavigate, urgentIncidentCount }) => {
  const { role, effectivePermissions, school } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const sections = useMemo(
    () => getVisibleNavSections(role, effectivePermissions),
    [role, effectivePermissions]
  );

  const getLabel = (item: NavItem): string => (item.labelKey ? t(item.labelKey) : item.label);

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sections;
    }

    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(item => {
          const label = (item.labelKey ? t(item.labelKey) : item.label).toLowerCase();
          const description = (item.description ?? '').toLowerCase();
          return label.includes(normalizedQuery) || description.includes(normalizedQuery);
        })
      }))
      .filter(section => section.items.length > 0);
  }, [query, sections, t]);

  const totalVisibleItems = sections.reduce((count, section) => count + section.items.length, 0);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white min-h-[calc(100vh-4rem)]">
      <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 shadow-sm">
            <img
              src="/images/school-logo.png"
              alt="ES Rubengera Secondary School official logo"
              className="h-full w-full object-contain bg-white p-1"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--schoolcare-brand-700)]">SchoolCare</p>
            <p className="truncate text-[10px] text-slate-600">ES RUBENGERA RTB</p>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter navigation"
            aria-label="Filter navigation"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-[11px] font-medium text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear navigation filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] font-medium text-slate-500" aria-live="polite">
          {query ? `${filteredSections.reduce((count, section) => count + section.items.length, 0)} of ${totalVisibleItems} sections shown` : `${totalVisibleItems} pages in your workspace`}
        </p>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {filteredSections.map(section => {
          const hasActiveItem = section.items.some(item => item.id === currentTab);
          const isCollapsed = !query && !hasActiveItem && Boolean(collapsedSections[section.id]);
          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() =>
                  setCollapsedSections(previous => ({
                    ...previous,
                    [section.id]: !previous[section.id]
                  }))
                }
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <span>{section.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
              {!isCollapsed && (
                <div className="space-y-1">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    const showUrgentBadge = item.id === 'health' && urgentIncidentCount > 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.description}
                        className={`group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${
                          isActive
                            ? 'bg-blue-50 font-semibold text-blue-800 shadow-xs ring-1 ring-inset ring-blue-100'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-blue-600" aria-hidden="true" />
                        )}
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                          <span className="truncate">{getLabel(item)}</span>
                        </span>
                        {showUrgentBadge && (
                          <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                            {urgentIncidentCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredSections.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center">
            <p className="text-xs font-semibold text-slate-600">No matching pages</p>
            <p className="mt-1 text-[11px] text-slate-500">Try a different keyword.</p>
          </div>
        )}
      </nav>

      <div className="border-t border-slate-100 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          <span className="truncate text-[11px] font-medium text-slate-600">
            ES RUBENGERA RTB Online
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-600">
          {school?.currentTerm ? `${school.currentTerm} Academic Session Active` : 'Academic session active'}
        </p>
      </div>
    </aside>
  );
};
