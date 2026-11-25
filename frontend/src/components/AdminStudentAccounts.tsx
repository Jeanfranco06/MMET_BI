'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';

type Student = { id_estudiante: number; codigo_anonimizado: string; evaluaciones_disponibles: number };

function makeTemporaryPassword() {
  const random = new Uint8Array(24);
  window.crypto.getRandomValues(random);
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function AdminStudentAccounts({ onLogout: _onLogout }: { onLogout?: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [username, setUsername] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const load = async () => setStudents(await api.getStudentsReadyForAccount());
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? students.filter((item) => item.codigo_anonimizado.toLowerCase().includes(query)) : students;
  }, [students, search]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentId) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    const password = makeTemporaryPassword();
    try {
      await api.createStudentUser({ username: username.trim(), password, studentId: Number(studentId) });
      setCreated({ username: username.trim(), password });
      setStudentId('');
      setUsername('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`Usuario: ${created.username}\nContraseña: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card flex items-start gap-3.5">
        <span className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center shrink-0">
          <UserPlus className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Gestión de Cuentas Estudiantiles
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Habilita credenciales seguras para estudiantes con evaluaciones PSS-10 o PCL-5 publicadas pendientes.
          </p>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {created && (
        <div
          role="status"
          className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-sm text-emerald-950 shadow-card"
        >
          <div className="flex items-center gap-2 font-display font-bold text-emerald-900">
            <KeyRound className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>Cuenta creada exitosamente</span>
          </div>
          <p className="text-xs text-emerald-800">
            Entrega estas credenciales al estudiante por un canal seguro. Por seguridad, la contraseña temporal no volverá a mostrarse.
          </p>
          <div className="rounded-xl bg-white border border-emerald-200/80 p-3.5 space-y-1.5 text-xs">
            <div>
              <span className="text-slate-500">Usuario:</span>{' '}
              <code className="font-mono font-bold text-slate-900">{created.username}</code>
            </div>
            <div>
              <span className="text-slate-500">Contraseña temporal:</span>{' '}
              <code className="break-all font-mono font-bold text-slate-900">{created.password}</code>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Credenciales copiadas' : 'Copiar credenciales'}
          </button>
        </div>
      )}

      <form
        onSubmit={create}
        aria-labelledby="student-account-heading"
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card"
      >
        <h3 id="student-account-heading" className="font-display text-sm font-bold text-slate-900">
          Crear nueva cuenta de acceso estudiantil
        </h3>

        <div>
          <label htmlFor="student-search" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Filtrar por código anonimizado
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="student-search"
              name="student-search"
              type="search"
              placeholder="Ej. UNT26-EST-"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-800 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label htmlFor="student-to-link" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Estudiante con evaluaciones pendientes ({visibleStudents.length} disponibles)
          </label>
          <select
            id="student-to-link"
            name="studentId"
            required
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              const selected = students.find((student) => student.id_estudiante === Number(e.target.value));
              setUsername(selected?.codigo_anonimizado ?? '');
              setCreated(null);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800"
          >
            <option value="">Selecciona un estudiante…</option>
            {visibleStudents.map((student) => (
              <option key={student.id_estudiante} value={student.id_estudiante}>
                {student.codigo_anonimizado} · {student.evaluaciones_disponibles} evaluación(es) disponible(s)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="student-username" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nombre de usuario
          </label>
          <input
            id="student-username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={100}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-medium text-slate-800 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/70 p-3 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
          <span>Se generará una contraseña aleatoria de alta entropía al crear la cuenta.</span>
        </div>

        <button
          type="submit"
          disabled={busy || !studentId}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-45 transition-colors"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          {busy ? 'Creando cuenta…' : 'Crear cuenta estudiantil'}
        </button>

        {!students.length && (
          <p className="text-xs text-slate-500">
            No hay estudiantes sin cuenta con evaluaciones publicadas pendientes en este momento.
          </p>
        )}
      </form>
    </section>
  );
}
