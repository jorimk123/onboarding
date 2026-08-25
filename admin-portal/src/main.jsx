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
            // Sized by its own aspect ratio (capped to a 40x40 box) rather than
            // force-cropped into a square — wide/rectangular logos stay wide,
            // square logos stay square.
            <img src={user.business.logo_url} alt="" style={{ maxWidth: 40, maxHeight: 40, width: 'auto', height: 'auto', borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
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

const CATEGORIES = [
  { id: 'Mentors', dot: '#5b4fd6', bg: '#eeecfd', text: '#4a3fb0' },
  { id: 'Students', dot: '#e0538a', bg: '#fbe9f0', text: '#993a5e' },
  { id: 'Partners', dot: '#22a98c', bg: '#e1f5ee', text: '#0f6e56' },
];
const categoryMeta = id => CATEGORIES.find(c => c.id === id) || { id: 'Other', dot: '#8f8fa0', bg: '#f1f1f4', text: 'var(--text2)' };

function JourneysPage() {
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [filter, setFilter] = useState('all');
  const toast = useToast();
  const nav = useNavigate();
  const load = () => { setLoading(true); api.getJourneys().then(setJourneys).finally(() => setLoading(false)); };
  useEffect(load, []);
  const del = async (id, name, e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${name}"?`)) return;
    await api.deleteJourney(id); toast('Deleted'); load();
  };
  const toggleArchive = async (j, e) => {
    e.stopPropagation();
    await api.updateJourney(j.id, { name: j.name, description: j.description, category: j.category, archived: !j.archived_at });
    toast(j.archived_at ? 'Unarchived' : 'Archived'); load();
  };

  const active = journeys.filter(j => !j.archived_at);
  const archived = journeys.filter(j => j.archived_at);
  const shown = filter === 'all' ? active : filter === 'Archived' ? archived : active.filter(j => j.category === filter);

  return (
    <Layout crumb="Journeys" title="Template library" actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>New journey</button>}>
      <div className="page" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className={`flat-tab ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>All journeys</span>
          {CATEGORIES.map(c => (
            <span key={c.id} className={`flat-tab ${filter === c.id ? 'selected' : ''}`} onClick={() => setFilter(c.id)}>{c.id}</span>
          ))}
          <span className={`flat-tab ${filter === 'Archived' ? 'selected' : ''}`} onClick={() => setFilter('Archived')}>Archived</span>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {filter === 'all' && (
              <div onClick={() => setShowCreate(true)} className="flat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 10, minHeight: 200, border: '1.5px dashed var(--flat-border-strong)', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>+</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Build from scratch</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text3)' }}>Start with an empty journey and add your own steps, forms and checks.</div>
              </div>
            )}
            {shown.map(j => {
              const cat = categoryMeta(j.category);
              return (
                <div key={j.id} onClick={() => nav(`/journeys/${j.id}`)} className="flat-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 200, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: cat.dot }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: cat.text }}>{cat.id}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={e => { e.stopPropagation(); setSharing(j); }} className="btn btn-ghost btn-sm">Share</button>
                    <button onClick={e => { e.stopPropagation(); setEditing(j); }} className="btn btn-ghost btn-sm">Edit</button>
                    <button onClick={e => toggleArchive(j, e)} className="btn btn-ghost btn-sm">{j.archived_at ? 'Unarchive' : 'Archive'}</button>
                    <button onClick={e => del(j.id, j.name, e)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>✕</button>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)', marginTop: 10 }}>{j.name}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text2)', marginTop: 4, flex: 1 }}>{j.description || 'No description yet.'}</div>
                  {j.avg_days_to_complete != null && (
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}>Average {j.avg_days_to_complete} days to complete</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: j.avg_days_to_complete != null ? 6 : 14, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>
                    <span>{j.task_count} steps</span><span>Used by {j.client_count} {j.client_count === 1 ? 'person' : 'people'}</span>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && filter !== 'all' && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '30px 0' }}>Nothing here yet.</div>
            )}
          </div>
        )}
      </div>
      {showCreate && <JourneyModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); load(); }} />}
      {editing && <JourneyModal initial={editing} onClose={() => setEditing(null)} onSave={() => { setEditing(null); load(); }} />}
      {sharing && <ShareJourneyModal journey={sharing} onClose={() => setSharing(null)} />}
    </Layout>
  );
}

function ShareJourneyModal({ journey, onClose }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const invite = await api.createInvite({ email, role: 'client', journey_id: journey.id });
      setLink(invite.link);
      toast('Invite created');
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Share "{journey.name}"</div>
        {!link ? (
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Their email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="client@company.com" autoFocus />
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                They'll get a welcome email with a link to create their account and start "{journey.name}".
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send invite'}</button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>Invite created. If email isn't configured, share this link directly:</p>
            <div className="code" style={{ display: 'block', wordBreak: 'break-all', padding: 10, marginBottom: 16 }}>{link}</div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(link); toast('Copied'); }}>Copy link</button>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendChart({ data }) {
  const w = 100, h = 100, pad = 4;
  const max = Math.max(1, ...data.map(d => Math.max(d.started, d.completed)));
  const pt = (v, i) => [pad + (i / (data.length - 1 || 1)) * (w - pad * 2), h - pad - (v / max) * (h - pad * 2)];
  const path = arr => arr.map((d, i) => pt(d, i)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 140 }}>
      <path d={path(data.map(d => d.started))} fill="none" stroke="url(#gStarted)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={path(data.map(d => d.completed))} fill="none" stroke="#22a98c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <defs>
        <linearGradient id="gStarted" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a79dff" /><stop offset="100%" stopColor="#5b4fd6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function OverviewPage() {
  const [analytics, setAnalytics] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([api.getAnalyticsOverview(), api.getJourneys(), api.getClients()])
      .then(([a, j, c]) => { setAnalytics(a); setJourneys(j); setClientCount(c.length); })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !analytics) return <Layout crumb="Dashboard" title="Overview"><div className="spinner" /></Layout>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const initials = name => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const { stats, chart, stalled } = analytics;

  return (
    <Layout crumb="Dashboard" title={`${greeting}, ${(user?.business?.name || '').split(' ')[0] || ''}`}>
      <div className="page" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {stats.map(s => (
            <div key={s.label} className="card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.tone }}>{s.delta}</div>
              </div>
              <div style={{ marginTop: 12, height: 5, borderRadius: 5, background: 'rgba(30,40,80,.09)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.pct}%`, borderRadius: 5, background: 'linear-gradient(90deg,#a79dff,#5b4fd6)' }} />
              </div>
            </div>
          ))}
        </div>

        <section className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Starts and completions</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Last 12 weeks, all journeys</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'linear-gradient(180deg,#a79dff,#5b4fd6)' }} /><span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>Started</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#22a98c' }} /><span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>Completed</span></div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}><TrendChart data={chart} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{chart[0]?.label}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{chart[chart.length - 1]?.label}</span>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Stalled 7+ days</div>
              <span className="badge badge-amber">{stalled.length}</span>
            </div>
            {stalled.length === 0 ? <div style={{ padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>Nobody's stalled right now.</div> : stalled.slice(0, 8).map((s, i) => (
              <div key={s.client_id} onClick={() => nav('/clients')} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 10, padding: '12px 4px', borderTop: i ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>{initials(s.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.journey_name}</div>
                </div>
                <span className="badge badge-amber" style={{ justifySelf: 'end' }}>No activity 7+ days</span>
              </div>
            ))}
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
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>People &amp; journeys</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{clientCount} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}>/ {journeys.length}</span></div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => nav('/clients')}>View People →</button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function JourneyModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: initial?.name || '', description: initial?.description || '', category: initial?.category || '' });
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
          <div className="form-group">
            <label>Category</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <span key={c.id} className={`flat-tab ${form.category === c.id ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, category: f.category === c.id ? '' : c.id }))}>{c.id}</span>
              ))}
            </div>
          </div>
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
