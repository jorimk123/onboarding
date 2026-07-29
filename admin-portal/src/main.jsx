import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, Link } from 'react-router-dom';
import './index.css';
import { api } from './api/client';
import JourneyBuilderPage from './pages/JourneyBuilder';
import ClientsPage from './pages/Clients';
import WebhooksPage from './pages/Webhooks';
import TeamPage from './pages/Team';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (localStorage.getItem('crm_token')) {
      api.me().then(setUser).catch(() => localStorage.removeItem('crm_token')).finally(() => setLoading(false));
    } else setLoading(false);
  }, []);
  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('Admin access only');
    localStorage.setItem('crm_token', token);
    setUser(user);
  };
  const signup = async (body) => {
    const { token, user, business } = await api.registerBusiness(body);
    localStorage.setItem('crm_token', token);
    setUser({ ...user, business });
    return user;
  };
  const acceptInvite = async (body) => {
    const { token, user } = await api.acceptInvite(body);
    localStorage.setItem('crm_token', token);
    setUser(user);
    return user;
  };
  const logout = () => { localStorage.removeItem('crm_token'); setUser(null); };
  if (loading) return <div className="spinner" />;
  return <AuthCtx.Provider value={{ user, login, signup, acceptInvite, logout }}>{children}</AuthCtx.Provider>;
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };
  return (
    <ToastCtx.Provider value={add}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await login(form.email, form.password); nav('/journeys'); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)', marginBottom: 4 }}>Onboarding CRM</div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Admin portal</div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="admin@example.com" /></div>
          <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required /></div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
          New business? <Link to="/signup" style={{ color: 'var(--purple)', fontWeight: 500 }}>Create an account</Link>
        </div>
      </div>
    </div>
  );
}

function SignupPage() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ businessName: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setErr(''); setLoading(true);
    try { await signup(form); nav('/journeys'); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)', marginBottom: 4 }}>Onboarding CRM</div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Create your business account</div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group"><label>Business name</label><input value={form.businessName} onChange={set('businessName')} required placeholder="Acme Inc." autoFocus /></div>
          <div className="form-group"><label>Your name</label><input value={form.name} onChange={set('name')} required placeholder="Jane Smith" /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={set('email')} required placeholder="jane@acme.com" /></div>
          <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={set('password')} required placeholder="At least 8 characters" /></div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>{loading ? 'Creating…' : 'Create business account'}</button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--purple)', fontWeight: 500 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const nav = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [invite, setInvite] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setLoadErr('Missing invite token'); return; }
    api.getInvite(token).then(setInvite).catch(e => setLoadErr(e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setErr(''); setLoading(true);
    try { await acceptInvite({ token, name: form.name, password: form.password }); nav('/journeys'); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)', marginBottom: 4 }}>Onboarding CRM</div>
          {invite && <div style={{ color: 'var(--text2)', fontSize: 13 }}>Join {invite.business_name} as an admin</div>}
        </div>
        {loadErr ? (
          <div style={{ color: 'var(--red)', fontSize: 14, textAlign: 'center' }}>{loadErr}</div>
        ) : !invite ? (
          <div className="spinner" />
        ) : (
          <form onSubmit={submit}>
            <div className="form-group"><label>Email</label><input value={invite.email} disabled /></div>
            <div className="form-group"><label>Your name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
            <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required placeholder="At least 8 characters" /></div>
            {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>{loading ? 'Creating account…' : 'Accept invite & sign in'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">{user?.business?.name || 'Onboarding CRM'}</div>
        <nav className="sidebar-nav">
          <NavLink to="/journeys" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>🗺 Journeys</NavLink>
          <NavLink to="/clients" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>👥 Clients</NavLink>
          <NavLink to="/team" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>🧑‍💼 Team</NavLink>
          <NavLink to="/webhooks" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>🔗 Webhooks</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>{user?.email} · {user?.role}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ width: '100%' }}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function JourneysPage() {
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const load = () => { setLoading(true); api.getJourneys().then(setJourneys).finally(() => setLoading(false)); };
  useEffect(load, []);
  const del = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await api.deleteJourney(id); toast('Deleted'); load();
  };
  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Journeys</div><div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>Build onboarding journeys for your clients</div></div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New journey</button>
      </div>
      {loading ? <div className="spinner" /> : journeys.length === 0 ? (
        <div className="empty"><div className="empty-icon">🗺</div><p>No journeys yet</p><button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first journey</button></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Name</th><th>Sections</th><th>Tasks</th><th>Clients</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {journeys.map(j => (
                <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/journeys/${j.id}`)}>
                  <td><div style={{ fontWeight: 500 }}>{j.name}</div>{j.description && <div style={{ color: 'var(--text2)', fontSize: 12 }}>{j.description}</div>}</td>
                  <td><span className="badge badge-purple">{j.section_count}</span></td>
                  <td><span className="badge badge-gray">{j.task_count}</span></td>
                  <td><span className="badge badge-teal">{j.client_count}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{new Date(j.created_at).toLocaleDateString()}</td>
                  <td onClick={e => e.stopPropagation()}><button className="btn btn-danger btn-sm" onClick={() => del(j.id, j.name)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <JourneyModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

export function JourneyModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: initial?.name || '', description: initial?.description || '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial) await api.updateJourney(initial.id, form); else await api.createJourney(form);
      toast(initial ? 'Updated' : 'Created'); onSave();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{initial ? 'Edit journey' : 'New journey'}</div>
        <form onSubmit={submit}>
          <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Standard Client Onboarding" /></div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/journeys" element={<RequireAdmin><Layout><JourneysPage /></Layout></RequireAdmin>} />
          <Route path="/journeys/:id" element={<RequireAdmin><Layout><JourneyBuilderPage /></Layout></RequireAdmin>} />
          <Route path="/clients" element={<RequireAdmin><Layout><ClientsPage /></Layout></RequireAdmin>} />
          <Route path="/team" element={<RequireAdmin><Layout><TeamPage /></Layout></RequireAdmin>} />
          <Route path="/webhooks" element={<RequireAdmin><Layout><WebhooksPage /></Layout></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/journeys" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);
