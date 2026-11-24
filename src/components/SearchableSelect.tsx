import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableOption {
  id: string;
  name: string;
  detail?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}

/**
 * Lightweight, dependency-free dropdown with type-ahead filtering. Options are
 * always supplied by the caller (API data), never hardcoded in the component.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  emptyText = 'No matching options'
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => options.find(option => option.id === value), [options, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(option =>
      option.name.toLowerCase().includes(needle) || option.detail?.toLowerCase().includes(needle)
    );
  }, [options, query]);

  return (
    <label className="relative block text-xs font-bold text-slate-600">
      {label}
      <div
        className={`mt-1 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 ${
          disabled ? 'opacity-60' : ''
        }`}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setOpen(false);
            setQuery('');
          }
        }}
      >
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          type="text"
          value={open ? query : selected?.name ?? ''}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={!open}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={event => { setQuery(event.target.value); setOpen(true); }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400"
        />
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </div>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs font-medium text-slate-400">{emptyText}</p>
          ) : filtered.map(option => (
            <button
              key={option.id}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
                setQuery('');
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-blue-50 ${
                option.id === value ? 'bg-blue-50 text-blue-800' : 'text-slate-700'
              }`}
            >
              <span>
                <span className="block font-bold">{option.name}</span>
                {option.detail && <span className="block text-[10px] font-medium text-slate-400">{option.detail}</span>}
              </span>
              {option.id === value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </label>
  );
};
