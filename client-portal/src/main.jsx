import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import './index.css';
import { api } from './api/client';
import DashboardPage from './pages/Dashboard';
import JourneyPage from './pages/Journey';
import { applyAccentColor } from './theme';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (localStorage.getItem('crm_client_token')) {
      api.me().then(setUser).catch(() => localStorage.removeItem('crm_client_token')).finally(() => setLoading(false));
    } else setLoading(false);
  }, []);
  useEffect(() => { applyAccentColor(user?.business?.accent_color); }, [user?.business?.accent_color]);
  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    if (user.role !== 'client') throw new Error('Please use the admin portal.');
    localStorage.setItem('crm_client_token', token);
    setUser(user); return user;
  };
  const acceptInvite = async (body) => {
    const { token, user } = await api.acceptInvite(body);
    localStorage.setItem('crm_client_token', token);
    setUser(user); return user;
  };
  const logout = () => { localStorage.removeItem('crm_client_token'); setUser(null); };
  if (loading) return <div className="spinner" />;
  return <AuthCtx.Provider value={{ user, login, acceptInvite, logout }}>{children}</AuthCtx.Provider>;
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

function AuthLayout({ children }) {
  const { user } = useAuth();
  const logoUrl = user?.business?.logo_url;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ maxWidth: 64, maxHeight: 56, width: 'auto', height: 'auto', borderRadius: 10, objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>✓</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700 }}>{user?.business?.name || 'Onboarding Portal'}</div>
      </div>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>{children}</div>
    </div>
  );
}

function AcceptInvitePage() {
  const { acceptInvite } = useAuth(); const nav = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [invite, setInvite] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setLoadErr('This invite link is missing or invalid. Ask your onboarding contact for a new link.'); return; }
    api.getInvite(token).then(i => { setInvite(i); setForm(f => ({ ...f, name: i.name || '' })); }).catch(e => setLoadErr(e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setErr(''); setLoading(true);
    try { await acceptInvite({ token, name: form.name, password: form.password }); nav('/'); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Set up your account</div>
      {invite && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>You've been invited by {invite.business_name}{invite.journey_name ? ` — you'll start with "${invite.journey_name}"` : ''}.</div>}
      {loadErr ? (
        <div className="form-error">{loadErr}</div>
      ) : !invite ? (
        <div className="spinner" />
      ) : (
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <div className="form-group"><label>Email</label><input value={invite.email} disabled /></div>
          <div className="form-group"><label>Full name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Jane Smith" autoFocus /></div>
          <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required placeholder="At least 8 characters" /></div>
          {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn btn-primary btn-full" disabled={loading}>{loading ? 'Creating…' : 'Get started'}</button>
        </form>
      )}
      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
        Already have an account? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 500 }}>Sign in</Link>
      </div>
    </AuthLayout>
  );
}

function LoginPage() {
  const { login } = useAuth(); const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await login(form.email, form.password); nav('/'); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <AuthLayout>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Welcome back</div>
      <form onSubmit={submit}>
        <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoFocus /></div>
        <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required /></div>
        {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
        No account yet? You'll need an invite link from your onboarding contact.
      </div>
    </AuthLayout>
  );
}

function RequireClient({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireClient><DashboardPage /></RequireClient>} />
          <Route path="/journey/:id" element={<RequireClient><JourneyPage /></RequireClient>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);
