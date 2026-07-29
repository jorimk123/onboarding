import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast, useAuth } from '../main';

export default function JourneyPage() {
  const { id } = useParams(); const nav = useNavigate();
  const toast = useToast(); const { user, logout } = useAuth();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(new Set());

  const load = useCallback(() => {
    api.getJourney(id).then(setJourney).catch(() => nav('/')).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const toggleTask = async (task) => {
    if (toggling.has(task.id)) return;
    setToggling(s => new Set([...s, task.id]));
    setJourney(j => ({ ...j, sections: j.sections.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t) })) }));
    try {
      if (task.completed) await api.uncompleteTask(task.id);
      else { await api.completeTask(task.id); toast('Task completed ✓'); }
      load();
    } catch (err) {
      setJourney(j => ({ ...j, sections: j.sections.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: task.completed } : t) })) }));
      toast(err.message, 'error');
    } finally { setToggling(s => { const n = new Set(s); n.delete(task.id); return n; }); }
  };

  if (loading) return <div className="spinner" />;
  if (!journey) return null;

  const allTasks = journey.sections.flatMap(s => s.tasks);
  const done = allTasks.filter(t => t.completed).length;
  const total = allTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = pct === 100 && total > 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => nav('/')} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, padding: 4 }}>←</button>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{journey.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{user?.name?.split(' ')[0]}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
        {isComplete && (
          <div style={{ background: 'var(--teal-light)', border: '1.5px solid var(--teal-mid)', borderRadius: 'var(--rl)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div style={{ fontSize: 32 }}>🎉</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--teal-dark)', marginBottom: 2 }}>Journey complete!</div>
              <div style={{ color: '#0F6E56', fontSize: 13 }}>You've finished every step. Your team has been notified.</div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 3 }}>{journey.name}</h1>
              {journey.description && <p style={{ color: 'var(--text2)', fontSize: 14 }}>{journey.description}</p>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{done}/{total} done</div>
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: 'var(--teal)', borderRadius: 99, transition: 'width .5s cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {journey.sections.map((section, si) => {
            const secDone = section.tasks.filter(t => t.completed).length;
            const secComplete = secDone === section.tasks.length && section.tasks.length > 0;
            return (
              <div key={section.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: secComplete ? 'var(--teal-light)' : 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: secComplete ? 'var(--teal)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0, transition: 'background .3s' }}>
                      {secComplete ? '✓' : si + 1}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 15, color: secComplete ? 'var(--teal-dark)' : 'var(--text)' }}>{section.title}</span>
                  </div>
                  <span className={`badge ${secComplete ? 'badge-teal' : 'badge-gray'}`}>{secDone}/{section.tasks.length}</span>
                </div>
                {section.tasks.map((task, ti) => (
                  <div key={task.id} onClick={() => toggleTask(task)} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: ti < section.tasks.length - 1 ? '1px solid var(--border)' : 'none', cursor: toggling.has(task.id) ? 'wait' : 'pointer', background: task.completed ? '#fafffe' : 'white', transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = task.completed ? '#f0fbf7' : '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = task.completed ? '#fafffe' : 'white'}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1, border: task.completed ? '2px solid var(--teal)' : '2px solid var(--border-dark)', background: task.completed ? 'var(--teal)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', opacity: toggling.has(task.id) ? .5 : 1 }}>
                      {task.completed && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: task.completed ? 'var(--text3)' : 'var(--text)', textDecoration: task.completed ? 'line-through' : 'none', transition: 'all .2s' }}>{task.title}</div>
                      {task.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{task.description}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {task.tag && <span className="badge badge-purple">{task.tag}</span>}
                        {task.assignee && <span style={{ fontSize: 12, color: 'var(--text3)' }}>👤 {task.assignee}</span>}
                        {task.docuseal_template_id && <span className="badge badge-teal">📄 Requires signature</span>}
                      </div>
                    </div>
                    {task.completed && <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 500, flexShrink: 0, marginTop: 2 }}>Done ✓</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
