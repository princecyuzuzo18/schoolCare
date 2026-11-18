import React, { useEffect, useState } from 'react';
import { ApiError, api } from '../services/api';

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'date' | 'number' | 'select';
  options?: string[];
}

interface ModuleCrudProps {
  title: string;
  description?: string;
  fields: Field[];
  moduleKey: string;
}

type ModuleRecord = Record<string, unknown> & { id: string };

export const ModuleCrud: React.FC<ModuleCrudProps> = ({ title, description, fields, moduleKey }) => {
  const [items, setItems] = useState<ModuleRecord[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const describeError = (err: unknown, fallback: string) =>
    err instanceof ApiError ? err.message : fallback;

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const records = await api.getModuleRecords<ModuleRecord>(moduleKey);
      setItems(records);
    } catch (err) {
      setError(describeError(err, 'Unable to load records.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [moduleKey]);

  const reset = () => {
    setForm({});
    setEditingId(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const updated = await api.updateModuleRecord<ModuleRecord>(moduleKey, editingId, form);
        setItems(current => current.map(item => (item.id === editingId ? updated : item)));
      } else {
        const created = await api.createModuleRecord<ModuleRecord>(moduleKey, form);
        setItems(current => [created, ...current]);
      }
      reset();
    } catch (err) {
      setError(describeError(err, 'Unable to save this record.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ModuleRecord) => {
    const formValues: Record<string, unknown> = {};
    fields.forEach(field => {
      formValues[field.key] = item[field.key] ?? '';
    });
    setForm(formValues);
    setEditingId(item.id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this record?')) return;

    setError('');
    try {
      await api.deleteModuleRecord(moduleKey, id);
      setItems(current => current.filter(item => item.id !== id));
    } catch (err) {
      setError(describeError(err, 'Unable to delete this record.'));
    }
  };

  const searchTerm = search.trim().toLowerCase();
  const filtered = items.filter(item =>
    fields.some(field =>
      String(item[field.key] ?? '').toLowerCase().includes(searchTerm)
    )
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#102B50]">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(field => (
            <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label htmlFor={`${moduleKey}-${field.key}`} className="block text-xs font-semibold text-slate-600 mb-1">
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`${moduleKey}-${field.key}`}
                  value={String(form[field.key] ?? '')}
                  onChange={event => setForm({ ...form, [field.key]: event.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                />
              ) : field.type === 'select' ? (
                <select
                  id={`${moduleKey}-${field.key}`}
                  value={String(form[field.key] ?? '')}
                  onChange={event => setForm({ ...form, [field.key]: event.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select...</option>
                  {field.options?.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${moduleKey}-${field.key}`}
                  type={field.type || 'text'}
                  value={String(form[field.key] ?? '')}
                  onChange={event => setForm({ ...form, [field.key]: event.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              )}
            </div>
          ))}
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#102B50]">Records ({filtered.length})</h2>
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label={`Search ${title}`}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {loading ? (
          <p role="status" className="text-slate-500 text-sm text-center py-8">Loading records...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">
            {items.length === 0 ? 'No records yet. Add one above.' : 'No records match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  {fields.map(field => (
                    <th key={field.key} className="py-2 px-3 font-semibold text-slate-600">
                      {field.label}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    {fields.map(field => (
                      <td key={field.key} className="py-2 px-3 text-slate-700">
                        {item[field.key] === undefined || item[field.key] === '' ? '-' : String(item[field.key])}
                      </td>
                    ))}
                    <td className="py-2 px-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="text-blue-600 text-xs font-semibold hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="text-red-600 text-xs font-semibold hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
