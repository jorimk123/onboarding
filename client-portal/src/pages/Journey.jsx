import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast, useAuth } from '../main';

// ── helpers ──────────────────────────────────────────────────────
function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}

function isQuizStep(task) {
  return task.step_type === 'Check';
}

// ── signature pad ────────────────────────────────────────────────
function SignaturePad({ value, onSave, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#1a2333'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = value; }
  }, []);
  const pos = e => {
    const r = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [p.clientX - r.left, p.clientY - r.top];
  };
  const start = e => { if (disabled) return; drawing.current = true; const [x, y] = pos(e); canvasRef.current.getContext('2d').beginPath(); canvasRef.current.getContext('2d').moveTo(x, y); };
  const move = e => { if (disabled || !drawing.current) return; e.preventDefault(); const [x, y] = pos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(x, y); ctx.stroke(); };
  const end = () => { if (!drawing.current) return; drawing.current = false; onSave(canvasRef.current.toDataURL('image/png')); };
  const clear = () => { const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onSave(''); };
  return (
    <div>
      <canvas ref={canvasRef} width={420} height={130} style={{ width: '100%', maxWidth: 420, height: 130, border: '1.5px dashed var(--border-dark)', borderRadius: 10, background: 'white', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      {!disabled && <button type="button" onClick={clear} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Clear signature</button>}
    </div>
  );
}

// ── YouTube embed w/ watched detection ──────────────────────────
const VIDEO_UNLOCK_SECONDS = 15;

function YouTubeField({ url, watched, onWatched }) {
  const vid = youtubeId(url);
  const containerId = useRef(`yt-${Math.random().toString(36).slice(2)}`).current;
  const playerRef = useRef(null);
  const watchedSecondsRef = useRef(0);
  const tickRef = useRef(null);
  const watchedRef = useRef(watched);
  useEffect(() => { watchedRef.current = watched; }, [watched]);

  useEffect(() => {
    if (!vid) return;
    let cancelled = false;
    const clearTick = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
    const startTick = () => {
      clearTick();
      tickRef.current = setInterval(() => {
        watchedSecondsRef.current += 1;
        if (!watchedRef.current && watchedSecondsRef.current >= VIDEO_UNLOCK_SECONDS) onWatched();
      }, 1000);
    };
    function makePlayer() {
      if (cancelled || !window.YT || !window.YT.Player) return;
      playerRef.current = new window.YT.Player(containerId, {
        videoId: vid,
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.PLAYING) startTick();
            else clearTick();
            if (e.data === window.YT.PlayerState.ENDED) onWatched();
          },
        },
      });
    }
    if (window.YT && window.YT.Player) makePlayer();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); makePlayer(); };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
    return () => { cancelled = true; clearTick(); };
  }, [vid]);

  if (!vid) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>No video URL set for this step.</div>;
  return (
    <div>
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <div id={containerId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: watched ? 'var(--teal)' : 'var(--text3)' }}>
        {watched ? '✓ Watched' : `Watch at least ${VIDEO_UNLOCK_SECONDS} seconds to mark this step complete`}
      </div>
    </div>
  );
}

// ── generic field input by type ─────────────────────────────────
function FieldInput({ field, value, onChange, disabled }) {
  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'inherit', background: disabled ? '#f7f8fa' : 'white' };
  switch (field.type) {
    case 'Long text':
      return <textarea rows={3} disabled={disabled} placeholder={field.label} value={value || ''} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />;
    case 'Email':
      return <input type="email" disabled={disabled} placeholder={field.label} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    case 'Phone':
      return <input type="tel" disabled={disabled} placeholder={field.label} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    case 'Date':
      return <input type="date" disabled={disabled} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    case 'Dropdown':
      return (
        <select disabled={disabled} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">{field.label || 'Select…'}</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'Multiple choice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(field.options || []).map(o => (
            <label key={o} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: value === o ? '1.5px solid var(--teal)' : '1.5px solid var(--border)', background: value === o ? 'var(--teal-light)' : 'white', cursor: disabled ? 'default' : 'pointer', fontSize: 14 }}>
              <input type="radio" name={field.id} disabled={disabled} checked={value === o} onChange={() => onChange(o)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, margin: 0 }} />
              <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', border: value === o ? '5px solid var(--teal)' : '1.5px solid var(--border-dark)', background: 'white', transition: 'border .12s' }} />
              {o}
            </label>
          ))}
        </div>
      );
    case 'Yes/No':
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['Yes', 'No'].map(o => (
            <button key={o} type="button" disabled={disabled} onClick={() => onChange(o)}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: value === o ? '1.5px solid var(--teal)' : '1.5px solid var(--border)', background: value === o ? 'var(--teal-light)' : 'white', color: value === o ? 'var(--teal-dark)' : 'var(--text)', fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}>
              {o}
            </button>
          ))}
        </div>
      );
    case 'Checkbox':
      return (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer', fontSize: 13.5, color: 'var(--text2)' }}>
          <input type="checkbox" disabled={disabled} checked={!!value} onChange={e => onChange(e.target.checked)} style={{ marginTop: 2 }} />
          <span>{field.label}</span>
        </label>
      );
    case 'Upload': {
      const onFile = e => {
        const f = e.target.files?.[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { onChange({ error: 'File must be under 5MB' }); return; }
        const reader = new FileReader();
        reader.onload = () => onChange({ name: f.name, size: f.size, dataUrl: reader.result });
        reader.readAsDataURL(f);
      };
      return (
        <div>
          <input type="file" disabled={disabled} onChange={onFile} style={{ fontSize: 13 }} />
          {value?.name && <div style={{ fontSize: 12.5, color: 'var(--teal-dark)', marginTop: 6 }}>📎 {value.name}</div>}
          {value?.error && <div style={{ fontSize: 12.5, color: '#c0392b', marginTop: 6 }}>{value.error}</div>}
        </div>
      );
    }
    case 'Signature':
      return <SignaturePad value={value} disabled={disabled} onSave={onChange} />;
    case 'Video':
      return <YouTubeField url={field.url} watched={!!value?.watched} onWatched={() => onChange({ watched: true })} />;
    default: // Short text
      return <input type="text" disabled={disabled} placeholder={field.label} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
  }
}

// ── quiz runner (one question per screen) ───────────────────────
function QuizRunner({ task, answers, onAnswer, onFinish }) {
  const questions = (task.fields || []).filter(f => f.type === 'Multiple choice');
  const [qi, setQi] = useState(0);
  const q = questions[qi];
  if (!q) return null;
  const answered = answers[q.id] != null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>Question {qi + 1} of {questions.length}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{q.label}</div>
      <FieldInput field={q} value={answers[q.id]} onChange={v => onAnswer(q.id, v)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary btn-sm" disabled={qi === 0} onClick={() => setQi(i => i - 1)}>← Back</button>
        {qi < questions.length - 1
          ? <button className="btn btn-primary btn-sm" disabled={!answered} onClick={() => setQi(i => i + 1)}>Next →</button>
          : <button className="btn btn-primary btn-sm" disabled={!answered} onClick={onFinish}>Finish quiz ✓</button>}
      </div>
    </div>
  );
}

// ── one task's expandable body ──────────────────────────────────
function SkipLink({ task, onSkip, toast }) {
  if (!task.allow_skip || task.completed) return null;
  return (
    <button type="button" onClick={async () => { try { await onSkip(task.id); toast('Step skipped for now'); } catch (err) { toast(err.message, 'error'); } }}
      style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>
      Skip for now
    </button>
  );
}

function TaskBody({ task, onSaveField, onComplete, onUncomplete, onSkip, toast }) {
  const [answers, setAnswers] = useState(task.responses || {});
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const save = async (fieldId, value) => {
    setAnswers(a => ({ ...a, [fieldId]: value }));
    try { await onSaveField(task.id, fieldId, value); }
    catch (err) { toast(err.message, 'error'); }
  };

  const requiredFields = (task.fields || []).filter(f => f.required !== false);
  const allRequiredFilled = requiredFields.every(f => {
    const v = answers[f.id];
    return f.type === 'Checkbox' ? true : v !== undefined && v !== null && v !== '';
  });

  if (isQuizStep(task)) {
    return (
      <QuizRunner task={task} answers={answers} onAnswer={save} onFinish={async () => {
        setBusy(true);
        try { await onComplete(task.id); toast('Quiz submitted ✓'); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
      }} />
    );
  }

  if (task.step_type === 'Book') {
    return (
      <div>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 12 }}>{task.description}</p>
        {task.booking_url
          ? <a href={task.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', display: 'inline-flex' }}>Schedule a time →</a>
          : <div style={{ fontSize: 13, color: 'var(--text3)' }}>No booking link has been set up yet.</div>}
        {!task.completed && (
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 10 }} onClick={() => onComplete(task.id)}>I've scheduled it</button>
        )}
        <SkipLink task={task} onSkip={onSkip} toast={toast} />
      </div>
    );
  }

  if (task.step_type === 'BGCheck') {
    const bc = task.background_check;
    const start = async () => {
      setStarting(true);
      try {
        const res = await api.startBackgroundCheck(task.id);
        toast('Background check started');
        if (res?.applicant_interface_url) window.open(res.applicant_interface_url, '_blank', 'noopener');
      } catch (err) { toast(err.message, 'error'); }
      finally { setStarting(false); }
    };
    return (
      <div>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 12 }}>{task.description}</p>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
          🛡️ You’ll fill out your background check details directly with MinistrySafe — we never see or store your SSN, date of birth, or address.
        </div>
        {task.completed ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal-dark)' }}>✓ Cleared</div>
        ) : !bc ? (
          <button className="btn btn-primary btn-sm" disabled={starting} onClick={start}>{starting ? 'Starting…' : 'Start background check →'}</button>
        ) : bc.status === 'pending' ? (
          <a href={bc.applicant_interface_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', display: 'inline-flex' }}>Continue background check →</a>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Submitted — your team will review it shortly.</div>
        )}
        <SkipLink task={task} onSkip={onSkip} toast={toast} />
      </div>
    );
  }

  if (task.step_type === 'Sign') {
    return (
      <div>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 12 }}>{task.description}</p>
        {task.docuseal_template_id
          ? <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>📄 A document was sent to your email to sign. Once you've signed it, mark this step complete.</div>
          : null}
        {!task.completed
          ? <button className="btn btn-primary btn-sm" onClick={() => onComplete(task.id)}>Mark as signed ✓</button>
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal-dark)' }}>✓ Signed</div>
              <button className="btn btn-secondary btn-sm" onClick={() => onUncomplete(task.id)}>Mark as not done</button>
            </div>
          )}
        <SkipLink task={task} onSkip={onSkip} toast={toast} />
      </div>
    );
  }

  // Form / Upload / Learn — render each field, manual complete when required ones are filled
  return (
    <div>
      {task.description && <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 14 }}>{task.description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(task.fields || []).map(f => {
          // Text-style fields show their question as placeholder text inside
          // the box itself (no separate label line). Choice-based and
          // non-typing fields (dates, uploads, signatures, etc.) still need
          // a label above them since there's nowhere else to put the question.
          const NEEDS_LABEL = ['Date', 'Multiple choice', 'Yes/No', 'Upload', 'Signature', 'Video'];
          const showLabel = NEEDS_LABEL.includes(f.type);
          return (
            <div key={f.id}>
              {showLabel && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.label}{f.required !== false && <span style={{ color: '#c0392b' }}> *</span>}</label>}
              <FieldInput field={f} value={answers[f.id]} disabled={task.completed} onChange={v => save(f.id, v)} />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        {task.completed
          ? <button className="btn btn-secondary btn-sm" onClick={() => onUncomplete(task.id)}>Mark as not done</button>
          : <button className="btn btn-primary btn-sm" disabled={!allRequiredFilled} onClick={() => onComplete(task.id)}>Mark complete ✓</button>}
        <SkipLink task={task} onSkip={onSkip} toast={toast} />
      </div>
    </div>
  );
}

const STEP_ICON = { Form: '📝', Upload: '📎', Sign: '✍️', Check: '🧠', Learn: '▶️', Book: '📅', BGCheck: '🛡️' };

export default function JourneyPage() {
  const { id } = useParams(); const nav = useNavigate();
  const toast = useToast(); const { user, logout } = useAuth();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  const load = useCallback(() => {
    api.getJourney(id).then(setJourney).catch(() => nav('/')).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const toggleExpanded = (taskId) => setExpanded(s => { const n = new Set(s); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n; });

  const complete = async (taskId) => {
    try { await api.completeTask(taskId); toast('Task completed ✓'); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const uncomplete = async (taskId) => {
    try { await api.uncompleteTask(taskId); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const saveField = (taskId, fieldId, value) => api.saveField(taskId, fieldId, value);
  const skip = async (taskId) => { await api.skipTask(taskId); load(); };

  if (loading) return <div className="spinner" />;
  if (!journey) return null;

  const allTasks = journey.sections.flatMap(s => s.tasks);
  const done = allTasks.filter(t => t.completed).length;
  const total = allTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = pct === 100 && total > 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,255,255,.6))', backdropFilter: 'var(--blur-sm)', WebkitBackdropFilter: 'var(--blur-sm)', border: '1px solid rgba(255,255,255,.55)', borderRadius: 22, margin: '16px 16px 0', padding: '0 22px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 16, zIndex: 10, boxShadow: 'var(--shadow-glass-sm)' }}>
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
          <div style={{ height: 8, background: 'rgba(15,26,23,.1)', borderRadius: 99, overflow: 'hidden' }}>
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
                {section.tasks.map((task, ti) => {
                  const isOpen = expanded.has(task.id);
                  return (
                    <div key={task.id} style={{ borderBottom: ti < section.tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div onClick={() => toggleExpanded(task.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', cursor: 'pointer', background: task.completed ? '#fafffe' : 'white', transition: 'background .12s' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1, border: task.completed ? '2px solid var(--teal)' : '2px solid var(--border-dark)', background: task.completed ? 'var(--teal)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {task.completed && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: task.completed ? 'var(--text3)' : 'var(--text)', textDecoration: task.completed ? 'line-through' : 'none' }}>{STEP_ICON[task.step_type] || ''} {task.title}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {task.tag && <span className="badge badge-purple">{task.tag}</span>}
                            {task.assignee && <span style={{ fontSize: 12, color: 'var(--text3)' }}>👤 {task.assignee}</span>}
                            {isQuizStep(task) && <span className="badge badge-teal">Quiz</span>}
                          </div>
                        </div>
                        {task.completed && <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 500, flexShrink: 0, marginTop: 2 }}>Done ✓</div>}
                        <span style={{ color: 'var(--text3)', fontSize: 12, marginTop: 3 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '4px 20px 20px 54px' }} onClick={e => e.stopPropagation()}>
                          <TaskBody task={task} onSaveField={saveField} onComplete={complete} onUncomplete={uncomplete} onSkip={skip} toast={toast} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
