import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../main';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  useEffect(() => { api.getJourneys().then(setJourneys).finally(() => setLoading(false)); }, []);

  const allTasks = journeys.reduce((a, j) => a + parseInt(j.task_count || 0), 0);
  const allDone = journeys.reduce((a, j) => a + parseInt(j.completed_count || 0), 0);
  const pct = allTasks > 0 ? Math.round((allDone / allTasks) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>✓</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{user?.business?.name || 'Onboarding Portal'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Hi, {user?.name?.split(' ')[0]}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Your onboarding</h1>
        <p style={{ color: 'var(--text2)', fontSize: 15, marginBottom: 28 }}>Complete each step to finish your onboarding journey.</p>

        {!loading && journeys.length > 0 && (
          <div className="card" style={{ padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--teal)" strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 26}`}
                  strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
                  strokeLinecap="round" transform="rotate(-90 32 32)"
                  style={{ transition: 'stroke-dashoffset .5s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>{pct}%</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{pct === 100 ? '🎉 All done!' : 'Overall progress'}</div>
              <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{allDone} of {allTasks} tasks · {journeys.length} journey{journeys.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {loading ? <div className="spinner" /> : journeys.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No journey assigned yet</div>
            <div style={{ color: 'var(--text2)' }}>Your team will assign your onboarding journey shortly. Check back after receiving your welcome email.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {journeys.map(j => {
              const total = parseInt(j.task_count || 0);
              const done = parseInt(j.completed_count || 0);
              const p = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={j.id} className="card" style={{ padding: '20px 24px', cursor: 'pointer' }}
                  onClick={() => nav(`/journey/${j.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{j.name}</div>
                        <span className={`badge ${j.completed_at ? 'badge-green' : p > 0 ? 'badge-amber' : 'badge-gray'}`}>
                          {j.completed_at ? 'Complete' : p > 0 ? 'In progress' : 'Not started'}
                        </span>
                      </div>
                      {j.description && <div style={{ color: 'var(--text2)', fontSize: 13 }}>{j.description}</div>}
                    </div>
                    <div style={{ color: 'var(--teal)', fontSize: 20 }}>→</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: p + '%', background: 'var(--teal)', borderRadius: 99, transition: 'width .4s' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{done}/{total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
