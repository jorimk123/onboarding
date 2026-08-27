import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../main';

// One step row inside an expanded journey: status dot, title, type badge,
// and (if answered) the client's submitted responses.
const BGCHECK_LABEL = { pending: 'Sent to applicant — not yet submitted', submitted: 'Submitted — awaiting your review', clear: 'Cleared ✓', consider: 'Flagged for review', suspended: 'Suspended', failed: 'Failed' };

function StepRow({ task, index, clientId, onCleared, toast }) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const responseEntries = Object.entries(task.responses || {});
  const hasBody = responseEntries.length > 0 || task.step_type === 'Sign' || task.step_type === 'Book' || task.step_type === 'BGCheck';

  const markCleared = async () => {
    setClearing(true);
    try { await api.markBackgroundCheckCleared(clientId, task.id); toast('Marked cleared ✓'); onCleared(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setClearing(false); }
  };

  return (
    <div style={{ borderRadius: 14, background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.85)', overflow: 'hidden' }}>
      <div onClick={() => hasBody && setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: hasBody ? 'pointer' : 'default' }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: task.completed ? 11 : 10.5, fontWeight: 800,
          background: task.completed ? 'var(--teal)' : 'rgba(30,40,80,.1)',
          color: task.completed ? '#fff' : 'var(--text3)',
        }}>{task.completed ? '✓' : index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
        </div>
        {task.step_type && <span className="badge badge-gray" style={{ fontSize: 10, padding: '3px 8px' }}>{task.step_type}</span>}
        <span className={`badge ${task.completed ? 'badge-teal' : 'badge-gray'}`} style={{ fontSize: 10, padding: '3px 8px' }}>
          {task.completed ? 'Done' : 'Pending'}
        </span>
        {hasBody && <span style={{ fontSize: 11, color: 'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>⌄</span>}
      </div>
      {open && (
        <div style={{ padding: '2px 12px 12px 44px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {responseEntries.length > 0 ? responseEntries.map(([fid, val]) => {
            const field = (task.fields || []).find(f => f.id === fid);
            return (
              <div key={fid}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{field?.label || fid}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 2 }}>{String(val ?? '') || '—'}</div>
              </div>
            );
          }) : task.step_type === 'BGCheck' ? (
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                {task.background_check ? (BGCHECK_LABEL[task.background_check.status] || task.background_check.status) : 'Not started — client hasn’t begun the background check yet.'}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                {task.background_check?.results_url && (
                  <a href={task.background_check.results_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">View results ↗</a>
                )}
                {task.background_check?.status === 'submitted' && !task.completed && (
                  <button className="btn btn-primary btn-sm" disabled={clearing} onClick={markCleared}>{clearing ? 'Marking…' : 'Mark cleared ✓'}</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {task.step_type === 'Sign' ? (task.completed ? 'Document signed.' : 'Not signed yet.') :
               task.step_type === 'Book' ? (task.completed ? 'Call booked.' : 'Not booked yet.') : 'No answers submitted yet.'}
            </div>
          )}
          {task.completed_at && <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>Completed {new Date(task.completed_at).toLocaleString()}</div>}
        </div>
      )}
    </div>
  );
}

// Expanded body of a journey row on the Person page: loads the real
// section/task/response breakdown for this specific client + journey.
function JourneyDetail({ clientId, journeyId, toast }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    api.getClientJourney(clientId, journeyId)
      .then(d => setDetail(d))
      .catch(e => setErr(e.message));
  };
  useEffect(() => { load(); }, [clientId, journeyId]);

  if (err) return <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--red)' }}>{err}</div>;
  if (!detail) return <div style={{ padding: '16px 0' }}><div className="spinner" style={{ margin: '16px auto' }} /></div>;

  const allTasks = detail.journey.sections.flatMap(s => s.tasks);
  return (
    <div style={{ padding: '10px 0 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {detail.journey.sections.map(s => (
        <div key={s.id}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{s.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.tasks.map(t => <StepRow key={t.id} task={t} index={allTasks.findIndex(x => x.id === t.id)} clientId={clientId} onCleared={load} toast={toast} />)}
            {s.tasks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No steps in this section.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PersonDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [client, setClient] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [journeyId, setJourneyId] = useState('');
  const [expandedJourneyId, setExpandedJourneyId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getClients(), api.getJourneys(), api.getClientProfile(id).catch(() => null)])
      .then(([clients, js, prof]) => {
        setClient(clients.find(c => String(c.id) === String(id)) || null);
        setJourneys(js);
        setProfile(prof);
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
                <div style={{ height: '100%', width: overallPct + '%', background: overallPct >= 100 ? 'linear-gradient(90deg,var(--teal-mid),var(--teal))' : 'linear-gradient(90deg,var(--purple-pale),var(--purple))', borderRadius: 8 }} />
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
              const expanded = expandedJourneyId === j.journey_id;
              return (
                <div key={j.journey_id} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => setExpandedJourneyId(expanded ? null : j.journey_id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{j.journey_name}</span>
                      <span className={`badge ${j.completed_at ? 'badge-teal' : 'badge-amber'}`}>{j.completed_at ? 'Complete' : 'In progress'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{j.completed_count}/{j.task_count}</span>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); unassign(j.journey_id, j.journey_name); }}>Remove</button>
                      <span style={{ fontSize: 11, color: 'var(--text3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>⌄</span>
                    </div>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%', background: j.completed_at ? 'linear-gradient(90deg,var(--teal-mid),var(--teal))' : undefined }} /></div>
                  {expanded && <JourneyDetail clientId={id} journeyId={j.journey_id} toast={toast} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Everything on file</div>
          {[
            ['Full name', client.name],
            ['Email', client.email],
            ['Phone', profile?.contact?.phone || '—'],
            ['City', profile?.contact?.city || '—'],
            ['State', profile?.contact?.state || '—'],
            ['Church attended', profile?.contact?.church || '—'],
          ].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{k}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}

          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 18, marginBottom: 8 }}>Uploaded documents</div>
          {(profile?.uploads || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>No documents uploaded yet.</div>
          ) : profile.uploads.map((u, i) => (
            <a key={i} href={u.data_url || undefined} download={u.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--hairline)' : 'none', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontSize: 14 }}>📎</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.journey_name} · {u.task_title}</div>
              </div>
            </a>
          ))}

          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 18, marginBottom: 8 }}>Signed / completed documents</div>
          {(profile?.signed || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Nothing signed yet.</div>
          ) : profile.signed.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
              <span style={{ fontSize: 14 }}>✍️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.task_title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.journey_name} · signed {new Date(s.completed_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
