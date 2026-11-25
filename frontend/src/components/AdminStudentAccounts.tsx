'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Student = { id_estudiante: number; codigo_anonimizado: string; evaluaciones_disponibles: number };

function makeTemporaryPassword() {
  const random = new Uint8Array(24);
  window.crypto.getRandomValues(random);
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function AdminStudentAccounts({ onLogout }: { onLogout: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [username, setUsername] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const load = async () => setStudents(await api.getStudentsReadyForAccount());
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? students.filter((item) => item.codigo_anonimizado.toLowerCase().includes(query)) : students;
  }, [students, search]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentId) return;
    setBusy(true); setError(null); setCreated(null);
    const password = makeTemporaryPassword();
    try {
      await api.createStudentUser({ username: username.trim(), password, studentId: Number(studentId) });
      setCreated({ username: username.trim(), password });
      setStudentId(''); setUsername(''); await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <section className="mx-auto max-w-3xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <div><h2 className="text-xl font-bold text-slate-900">Cuentas para formularios</h2><p className="text-sm text-slate-600">Crea acceso estudiantil solo para registros con evaluaciones PCL-5 disponibles.</p></div>
      <button type="button" onClick={onLogout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cerrar sesión</button>
    </header>

    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {created && <div role="status" className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="font-semibold">Cuenta creada. Entrega estas credenciales al estudiante por un canal seguro; la contraseña no se podrá recuperar desde el sistema.</p>
      <p>Usuario: <code className="font-mono">{created.username}</code></p>
      <p>Contraseña temporal: <code className="break-all font-mono">{created.password}</code></p>
      <button type="button" onClick={() => navigator.clipboard.writeText(`Usuario: ${created.username}\nContraseña: ${created.password}`)} className="rounded border border-emerald-300 px-3 py-1.5 font-medium">Copiar credenciales</button>
    </div>}

    <form onSubmit={create} aria-labelledby="student-account-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="student-account-heading" className="font-semibold text-slate-900">Crear cuenta de estudiante</h3>
      <div><label htmlFor="student-search" className="block text-sm font-medium">Buscar por código</label><input id="student-search" name="student-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
      <div><label htmlFor="student-to-link" className="block text-sm font-medium">Estudiante con evaluaciones pendientes</label><select id="student-to-link" name="studentId" required value={studentId} onChange={(e) => { setStudentId(e.target.value); const selected = students.find((student) => student.id_estudiante === Number(e.target.value)); setUsername(selected?.codigo_anonimizado ?? ''); setCreated(null); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Selecciona un estudiante</option>{visibleStudents.map((student) => <option key={student.id_estudiante} value={student.id_estudiante}>{student.codigo_anonimizado} · {student.evaluaciones_disponibles} evaluación(es) disponible(s)</option>)}</select></div>
      <div><label htmlFor="student-username" className="block text-sm font-medium">Usuario de acceso</label><input id="student-username" name="username" autoComplete="username" required minLength={3} maxLength={100} value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
      <p className="text-sm text-slate-600">La contraseña temporal se generará aleatoriamente al crear la cuenta y se mostrará una sola vez.</p>
      <button type="submit" disabled={busy || !studentId} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      {!students.length && <p className="text-sm text-slate-600">No hay estudiantes sin cuenta con una evaluación publicada pendiente. PSS-10 no aparece mientras su versión siga bloqueada.</p>}
    </form>
  </section>;
}
