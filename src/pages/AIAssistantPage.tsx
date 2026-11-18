import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, api } from '../services/api';

interface Book { id: string; name: string; content: string; uploadedAt: string; }

export const AIAssistantPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN';
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<{role:'user'|'assistant';text:string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api.getModuleRecords<Book>('ai-training-books')
      .then(records => { if (active) setBooks(records); })
      .catch(err => {
        if (active) setBooksError(err instanceof ApiError ? err.message : 'Unable to load training books.');
      })
      .finally(() => { if (active) setBooksLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBooksError('');
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const created = await api.createModuleRecord<Book>('ai-training-books', {
          name: file.name,
          content: String(reader.result).slice(0, 50_000),
          uploadedAt: new Date().toISOString()
        });
        setBooks(prev => [created, ...prev]);
      } catch (err) {
        setBooksError(err instanceof ApiError ? err.message : 'Unable to upload this book.');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setBooksError('Unable to read this file.');
      setUploading(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const removeBook = async (id: string) => {
    if (!window.confirm('Remove this training book?')) return;
    setBooksError('');
    try {
      await api.deleteModuleRecord('ai-training-books', id);
      setBooks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      setBooksError(err instanceof ApiError ? err.message : 'Unable to remove this book.');
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(m => [...m, { role:'user', text: userMsg }]);
    setInput('');
    setLoading(true);
    try {
      const context = books.map(b => `--- ${b.name} ---\n${b.content}`).join('\n\n').slice(0, 30000);
      const { reply } = await api.askAssistant(userMsg, context);
      setMessages(m => [...m, { role:'assistant', text: reply }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Error contacting AI service.';
      setMessages(m => [...m, { role:'assistant', text: message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{minHeight:'70vh'}}>
        <div className="p-4 border-b border-slate-200 font-semibold text-[#102B50]">AI School Assistant</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{maxHeight:'60vh'}}>
          {messages.length === 0 && <p className="text-slate-400 text-sm text-center py-8">Ask a question about school administration.</p>}
          {messages.map((m,i) => (
            <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${m.role==='user'?'bg-blue-600 text-white':'bg-slate-100 text-slate-800'}`}>{m.text}</div>
            </div>
          ))}
          {loading && <div className="text-slate-400 text-sm">Thinking...</div>}
          <div ref={chatEnd} />
        </div>
        <div className="p-4 border-t border-slate-200 flex gap-2">
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }}
            placeholder="Type your question..."
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={sendMessage} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Send</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h2 className="font-semibold text-[#102B50] mb-2">Training Books ({books.length})</h2>
        {booksError && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {booksError}
          </div>
        )}
        {isAdmin ? (
          <>
            <input ref={fileRef} type="file" accept=".txt,.md,.csv" onChange={handleUpload} className="hidden" />
            <button
              onClick={()=>fileRef.current?.click()}
              disabled={uploading}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold mb-3 disabled:cursor-wait disabled:opacity-60"
            >
              {uploading ? 'Uploading...' : 'Upload Book (txt/md/csv)'}
            </button>
            <p className="text-xs text-slate-400 mb-3">Admins can upload books. Content is used as training context for the AI.</p>
          </>
        ) : (
          <p className="text-xs text-slate-400 mb-3">Only administrators can upload training books.</p>
        )}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {booksLoading ? (
            <p role="status" className="text-slate-400 text-sm">Loading books...</p>
          ) : books.length === 0 ? (
            <p className="text-slate-400 text-sm">No books uploaded yet.</p>
          ) : (
            books.map(b => (
              <div key={b.id} className="border border-slate-200 rounded-lg p-2 text-sm">
                <div className="font-medium text-slate-700 truncate">{b.name}</div>
                <div className="text-xs text-slate-400">{new Date(b.uploadedAt).toLocaleDateString()}</div>
                {isAdmin && <button onClick={()=>removeBook(b.id)} className="text-red-600 text-xs mt-1 hover:underline">Remove</button>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
