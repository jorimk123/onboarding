import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../main';

export default function PersonDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [client, setClient] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [journeyId, setJourneyId] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.getClients(), api.getJourneys()])
      .then(([clients, js]) => {
        setClient(clients.find(c => String(c.id) === String(id)) || null);
        setJourneys(js);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const unassign = async (jid, jname) => {
    if (!confirm(`Remove "${jname}"?`)) return;
    await api.unassignJourney(id, jid); toast('Unassigned'); load();
  };

  const assign = async (e) => {
    e.preventDefault();
    try { await api.assignJourney(id, journeyId); toast('Assigned — welcome email sent!'); setAssigning(false); setJourneyId(''); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  if (loading) return <div className="page" style={{ paddingTop: 0 }}><div className="spinner" /></div>;
  if (!client) return <div className="page" style={{ paddingTop: 0 }}><div className="empty"><p>Person not found</p><button className="btn btn-secondary" onClick={() => nav('/clients')}>Back to People</button></div></div>;

  const cj = client.journeys || [];
  const totalTasks = cj.reduce((a, j) => a + (j.task_count || 0), 0);
  const totalDone = cj.reduce((a, j) => a + (j.completed_count || 0), 0);
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  const initials = (client.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const assignedIds = cj.map(j => j.journey_id);
  const available = journeys.filter(j => !assignedIds.includes(j.id));

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/clients')} style={{ marginBottom: 12 }}>← Back to People</button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(150deg,#dbe1ff,#b9c4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#3a4270', flexShrink: 0 }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>{client.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2 }}>{client.email}{client.company ? ` · ${client.company}` : ''}</div>
              </div>
              {totalTasks > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{overallPct}%</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{totalDone} of {totalTasks} tasks</div>
                </div>
              )}
            </div>
            {totalTasks > 0 && (
              <div style={{ marginTop: 16, height: 8, background: 'rgba(30,40,80,.09)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: overallPct + '%', background: 'linear-gradient(90deg,var(--purple-pale),var(--purple))', borderRadius: 8 }} />
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Journeys</div>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => setAssigning(a => !a)}>+ Assign journey</button>
            </div>

            {assigning && (
              <form onSubmit={assign} style={{ display: 'flex', gap: 8, margin: '10px 0 16px' }}>
                <select value={journeyId} onChange={e => setJourneyId(e.target.value)} required>
                  <option value="">Choose a journey…</option>
                  {available.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" disabled={!journeyId}>Assign</button>
              </form>
            )}

            {cj.length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--text3)', fontSize: 13 }}>No journey assigned yet.</div>
            ) : cj.map((j, i) => {
              const pct = j.task_count > 0 ? Math.round((j.completed_count / j.task_count) * 100) : 0;
              return (
                <div key={j.journey_id} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{j.journey_name}</span>
                      <span className={`badge ${j.completed_at ? 'badge-teal' : 'badge-amber'}`}>{j.completed_at ? 'Complete' : 'In progress'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{j.completed_count}/{j.task_count}</span>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => unassign(j.journey_id, j.journey_name)}>Remove</button>
                    </div>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%' }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Everything on file</div>
          {[['Name', client.name], ['Email', client.email], ['Company', client.company || '—']].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{k}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
