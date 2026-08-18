import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, Link } from 'react-router-dom';
import './index.css';
import { api } from './api/client';
import JourneyBuilderPage from './pages/JourneyBuilder';
import ClientsPage from './pages/Clients';
import WebhooksPage from './pages/Webhooks';
import TeamPage from './pages/Team';
import PersonDetailPage from './pages/PersonDetail';
import MemberPortalPreviewPage from './pages/MemberPortalPreview';
import SettingsPage from './pages/Settings';
import { applyAccentColor } from './theme';

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
  useEffect(() => { applyAccentColor(user?.business?.accent_color); }, [user?.business?.accent_color]);
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
  const refreshUser = () => api.me().then(setUser).catch(() => {});
  if (loading) return <div className="spinner" />;
  return <AuthCtx.Provider value={{ user, login, signup, acceptInvite, logout, refreshUser }}>{children}</AuthCtx.Provider>;
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
    try { await login(form.email, form.password); nav('/overview'); }
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
    try { await signup(form); nav('/overview'); } catch (e) { setErr(e.message); } finally { setLoading(false); }
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
    try { await acceptInvite({ token, name: form.name, password: form.password }); nav('/overview'); }
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

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', chip: 'rgba(91,79,214,.14)', dot: '#5b4fd6', r: '50%' },
  { to: '/clients', label: 'People', chip: 'rgba(255,157,192,.22)', dot: '#e0538a', r: '50%' },
  { to: '/journeys', label: 'Templates', chip: 'rgba(34,169,140,.16)', dot: '#22a98c', r: '3px' },
  { to: '/portal', label: 'Member portal', chip: 'rgba(91,79,214,.14)', dot: '#9a92ff', r: '50%' },
  { to: '/team', label: 'Team', chip: 'rgba(91,79,214,.14)', dot: '#5b4fd6', r: '3px' },
  { to: '/webhooks', label: 'Webhooks', chip: 'rgba(30,40,80,.08)', dot: 'rgba(30,40,80,.5)', r: '3px' },
  { to: '/settings', label: 'Admin settings', chip: 'rgba(30,40,80,.08)', dot: 'rgba(30,40,80,.5)', r: '3px' },
];

function Layout({ children, crumb, title, actions }) {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          {user?.business?.logo_url ? (
            <img src={user.business.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 11, objectFit: 'cover', flexShrink: 0, boxShadow: '0 2px 8px rgba(91,79,214,.4)' }} onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <div className="sidebar-logo-chip"><div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,.94)' }} /></div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.business?.name || 'Onboarding CRM'}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)' }}>{user?.role === 'owner' ? 'Organization owner' : 'Admin'}</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span className="nav-chip" style={{ background: item.chip }}><span style={{ width: 8, height: 8, borderRadius: item.r, background: item.dot, display: 'block' }} /></span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: 16, borderRadius: 16, background: 'var(--card-bg-tint)', border: '1px solid rgba(255,255,255,.85)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>{user?.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2, marginBottom: 10 }}>{user?.email} · {user?.role}</div>
          <button className="btn btn-secondary btn-sm" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">
        {(crumb || title) && (
          <div className="topbar">
            <div style={{ minWidth: 0 }}>
              {crumb && <div className="page-eyebrow">{crumb}</div>}
              {title && <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>{title}</div>}
            </div>
            <div style={{ flex: 1 }} />
            {actions}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!['owner', 'admin'].includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

const TEMPLATE_CHIPS = [
  { bg: 'rgba(91,79,214,.16)', dot: '#5b4fd6' },
  { bg: 'rgba(255,157,192,.2)', dot: '#e0538a' },
  { bg: 'rgba(34,169,140,.16)', dot: '#22a98c' },
  { bg: 'rgba(186,117,23,.16)', dot: '#ba7517' },
];

function JourneysPage() {
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const load = () => { setLoading(true); api.getJourneys().then(setJourneys).finally(() => setLoading(false)); };
  useEffect(load, []);
  const del = async (id, name, e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${name}"?`)) return;
    await api.deleteJourney(id); toast('Deleted'); load();
  };
  return (
    <Layout crumb="Journeys" title="Template library" actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>New journey</button>}>
      <div className="page" style={{ paddingTop: 0 }}>
        {loading ? <div className="spinner" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
            <div onClick={() => setShowCreate(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 10, minHeight: 210, padding: 24, borderRadius: 24, border: '1.5px dashed rgba(91,79,214,.4)', background: 'linear-gradient(165deg,rgba(154,146,255,.12),rgba(255,255,255,.55))', cursor: 'pointer' }}>
              <div style={{ width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(150deg,var(--purple-mid),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700 }}>+</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Build from scratch</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text2)' }}>Start with an empty journey and add your own sections and tasks.</div>
            </div>
            {journeys.map((j, i) => {
              const chip = TEMPLATE_CHIPS[i % TEMPLATE_CHIPS.length];
              return (
                <div key={j.id} onClick={() => nav(`/journeys/${j.id}`)} className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 210, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 10, background: chip.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: chip.dot }} /></span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>Journey</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={e => del(j.id, j.name, e)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>Delete</button>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)', marginTop: 12 }}>{j.name}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text2)', marginTop: 4, flex: 1 }}>{j.description || 'No description yet.'}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
                    {Array.from({ length: 6 }).map((_, si) => (
                      <span key={si} style={{ flex: 1, height: 6, borderRadius: 6, background: si < Math.min(6, j.section_count) ? `linear-gradient(90deg, ${chip.dot}, ${chip.dot})` : 'rgba(30,40,80,.09)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>
                    <span>{j.task_count} tasks</span><span>Used by {j.client_count} {j.client_count === 1 ? 'person' : 'people'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showCreate && <JourneyModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); load(); }} />}
    </Layout>
  );
}

function OverviewPage() {
  const [clients, setClients] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([api.getClients(), api.getJourneys()]).then(([c, j]) => { setClients(c); setJourneys(j); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout crumb="Dashboard" title="Overview"><div className="spinner" /></Layout>;

  const rows = clients.flatMap(c => (c.journeys || []).map(j => ({ client: c, journey: j })));
  const inProgress = rows.filter(r => !r.journey.completed_at);
  const completed = rows.filter(r => r.journey.completed_at);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const initials = name => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pctOf = j => j.task_count > 0 ? Math.round((j.completed_count / j.task_count) * 100) : 0;

  return (
    <Layout crumb="Dashboard" title={`${greeting}, ${(user?.business?.name || '').split(' ')[0] || ''}`}>
      <div className="page" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>In progress</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, color: 'var(--text)' }}>{inProgress.length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>Completed</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, color: 'var(--teal-text)' }}>{completed.length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>People &amp; journeys</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, color: 'var(--text)' }}>{clients.length} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)' }}>/ {journeys.length}</span></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Not completed</div>
              <span className="badge badge-purple">{inProgress.length}</span>
            </div>
            {inProgress.length === 0 ? <div style={{ padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>Nobody in progress right now.</div> : inProgress.slice(0, 8).map(({ client, journey: j }, i) => {
              const pct = pctOf(j);
              return (
                <div key={client.id + j.journey_id} onClick={() => nav('/clients')} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 1.1fr 70px', alignItems: 'center', gap: 10, padding: '12px 4px', borderTop: i ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>{initials(client.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{client.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.journey_name}</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}><span style={{ fontWeight: 600, color: 'var(--text2)' }}>{j.completed_count}/{j.task_count} tasks</span><span style={{ fontWeight: 800 }}>{pct}%</span></div>
                    <div className="progress-bar" style={{ marginTop: 5 }}><div className="progress-fill" style={{ width: pct + '%' }} /></div>
                  </div>
                  <span className="badge badge-amber" style={{ justifySelf: 'start' }}>Active</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card card-tint">
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Journeys</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {journeys.slice(0, 6).map(j => (
                  <div key={j.id} onClick={() => nav(`/journeys/${j.id}`)} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.85)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{j.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>{j.client_count} people</span>
                  </div>
                ))}
                {journeys.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>No journeys yet.</div>}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Completed</div>
              {completed.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Nobody has finished a journey yet.</div> : completed.slice(0, 5).map(({ client, journey: j }, i) => (
                <div key={client.id + j.journey_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-light)', color: 'var(--teal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700 }}>{initials(client.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{j.journey_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
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
          <Route path="/overview" element={<RequireAdmin><OverviewPage /></RequireAdmin>} />
          <Route path="/journeys" element={<RequireAdmin><JourneysPage /></RequireAdmin>} />
          <Route path="/journeys/:id" element={<RequireAdmin><Layout crumb="Journeys" title="Journey builder"><JourneyBuilderPage /></Layout></RequireAdmin>} />
          <Route path="/clients" element={<RequireAdmin><Layout crumb="CRM" title="People"><ClientsPage /></Layout></RequireAdmin>} />
          <Route path="/clients/:id" element={<RequireAdmin><Layout crumb="CRM · People" title="Person"><PersonDetailPage /></Layout></RequireAdmin>} />
          <Route path="/portal" element={<RequireAdmin><Layout crumb="Journeys" title="Member portal preview"><MemberPortalPreviewPage /></Layout></RequireAdmin>} />
          <Route path="/team" element={<RequireAdmin><Layout crumb="Administration" title="Team"><TeamPage /></Layout></RequireAdmin>} />
          <Route path="/webhooks" element={<RequireAdmin><Layout crumb="Administration" title="Webhooks"><WebhooksPage /></Layout></RequireAdmin>} />
          <Route path="/settings" element={<RequireAdmin><Layout crumb="Administration" title="Admin settings"><SettingsPage /></Layout></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);
