import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

const NOTES = [
  { t: 'Resumable progress', d: 'A client can sign out and come back later — the portal always shows exactly where they left off.' },
  { t: 'Progress is always visible', d: 'Percentage complete and task count shown at the top of every screen.' },
  { t: 'One invite, one account', d: 'They set a password from your invite link, then sign back in anytime with it.' },
  { t: 'Assigned automatically', d: 'Assigning a journey to a client immediately sends their welcome email.' },
];

// Converts a YouTube watch/share URL into an embeddable URL. Falls back to
// the raw URL for anything else (Vimeo, direct mp4 links, etc.) — <iframe>
// still renders those fine in most cases.
function toEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : url;
}

// One typed field, rendered as a real, interactive (but not persisted)
// input so you can click through and test what a client would see —
// answers just live in local state and reset on refresh.
function FieldPreview({ f }) {
  const [val, setVal] = useState('');
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState('');
  const inputStyle = { fontSize: 12.5 };

  // Text-style fields carry their question as placeholder text inside the
  // box itself; everything else still needs a label above since there's
  // nowhere else to show the question.
  const TEXT_TYPES = ['Short text', 'Long text', 'Email', 'Phone'];
  const showLabel = !TEXT_TYPES.includes(f.type);

  return (
    <div style={{ marginBottom: 12 }}>
      {showLabel && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a2038', marginBottom: 5 }}>{f.label || 'Untitled question'}</div>}
      {f.type === 'Short text' && <input value={val} onChange={e => setVal(e.target.value)} placeholder={f.label || 'Type an answer…'} style={inputStyle} />}
      {f.type === 'Long text' && <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} placeholder={f.label || 'Type an answer…'} style={inputStyle} />}
      {f.type === 'Email' && <input type="email" value={val} onChange={e => setVal(e.target.value)} placeholder={f.label || 'name@email.com'} style={inputStyle} />}
      {f.type === 'Phone' && <input type="tel" value={val} onChange={e => setVal(e.target.value)} placeholder={f.label || '(555) 555-5555'} style={inputStyle} />}
      {f.type === 'Date' && <input type="date" value={val} onChange={e => setVal(e.target.value)} style={inputStyle} />}
      {f.type === 'Dropdown' && (
        <select value={val} onChange={e => setVal(e.target.value)} style={inputStyle}>
          <option value="">{f.label || 'Choose…'}</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === 'Multiple choice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(f.options || []).map(o => (
            <label key={o} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: 12.5, color: '#1a2038', cursor: 'pointer' }}>
              <input type="radio" checked={choice === o} onChange={() => setChoice(o)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, margin: 0 }} />
              <span style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', border: choice === o ? '4.5px solid #5b4fd6' : '1.5px solid rgba(30,40,80,.3)', background: 'white', transition: 'border .12s' }} />
              {o}
            </label>
          ))}
        </div>
      )}
      {f.type === 'Yes / No' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['Yes', 'No'].map(o => (
            <button key={o} type="button" className={`flat-tab ${choice === o ? 'selected' : ''}`} onClick={() => setChoice(o)}>{o}</button>
          ))}
        </div>
      )}
      {f.type === 'Checkbox' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: 12.5, color: '#1a2038', cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={checked} onChange={() => setChecked(c => !c)} /> I agree
        </label>
      )}
      {f.type === 'Upload' && <button type="button" className="btn btn-secondary btn-sm">Choose file…</button>}
      {f.type === 'Video' && (
        f.url ? (
          <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
            <iframe src={toEmbedUrl(f.url)} title={f.label} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
          </div>
        ) : <div style={{ fontSize: 12, color: 'rgba(30,40,80,.5)', fontStyle: 'italic' }}>No video link added yet — add one in the Journey Builder.</div>
      )}
    </div>
  );
}

// The expanded body of a step: DocuSeal / booking get a dedicated card,
// everything else (Form, Upload, Learn, Check) renders its field list.
function StepPreviewBody({ task }) {
  if (task.step_type === 'Sign') {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.9)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a2038', marginBottom: 4 }}>DocuSeal signature</div>
        <div style={{ fontSize: 12, color: 'rgba(30,40,80,.6)', marginBottom: 8 }}>
          {task.docuseal_template_id ? `Document ready to sign (template ${task.docuseal_template_id}).` : 'No DocuSeal template set up yet — add one in the Journey Builder.'}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!task.docuseal_template_id}>Open document to sign</button>
      </div>
    );
  }
  if (task.step_type === 'Book') {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.9)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a2038', marginBottom: 6 }}>Schedule a call</div>
        {task.booking_url
          ? <a href={task.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Open booking page →</a>
          : <div style={{ fontSize: 12, color: 'rgba(30,40,80,.5)' }}>No booking link added yet — add one in the Journey Builder.</div>}
      </div>
    );
  }
  if (task.step_type === 'Link') {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.9)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a2038', marginBottom: 6 }}>Complete this task</div>
        {task.booking_url
          ? <a href={task.booking_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Open link →</a>
          : <div style={{ fontSize: 12, color: 'rgba(30,40,80,.5)' }}>No link added yet — add one in the Journey Builder.</div>}
      </div>
    );
  }
  if (task.step_type === 'BGCheck') {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.9)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a2038', marginBottom: 6 }}>MinistrySafe background check</div>
        <div style={{ fontSize: 12, color: 'rgba(30,40,80,.6)', marginBottom: 8 }}>
          {task.ministrysafe_package_code ? `Package: ${task.ministrysafe_package_code}` : `Level ${task.ministrysafe_level || 1}`} — the client fills out all sensitive info directly with MinistrySafe.
        </div>
        <button type="button" className="btn btn-secondary btn-sm">Start background check</button>
      </div>
    );
  }
  const fields = task.fields || [];
  if (fields.length === 0) return <div style={{ fontSize: 12, color: 'rgba(30,40,80,.5)' }}>Nothing configured on this step yet.</div>;
  return <div>{fields.map(f => <FieldPreview key={f.id} f={f} />)}</div>;
}

export default function MemberPortalPreviewPage() {
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('journey');
  const [journeys, setJourneys] = useState([]);
  const [journeyId, setJourneyId] = useState(presetId || '');
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedStepId, setExpandedStepId] = useState(null);

  useEffect(() => {
    api.getJourneys().then(js => {
      setJourneys(js);
      const preset = presetId && js.find(j => String(j.id) === String(presetId));
      if (preset) setJourneyId(String(preset.id));
      else if (js[0]) setJourneyId(String(js[0].id));
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (journeyId) { api.getJourney(journeyId).then(setJourney); setExpandedStepId(null); } }, [journeyId]);

  const allTasks = journey ? journey.sections.flatMap(s => s.tasks) : [];

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>What a client sees</div>
            <div style={{ flex: 1 }} />
            <select value={journeyId} onChange={e => setJourneyId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
              {journeys.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text2)', maxWidth: '54ch' }}>
            Click a step on the right to try it — answer questions, watch training videos, and see the DocuSeal / booking steps. Nothing here is saved.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
            {NOTES.map(n => (
              <div key={n.t} style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.9)' }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>{n.t}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text2)', marginTop: 4 }}>{n.d}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 18, background: 'var(--card-bg-tint)', border: '1px solid rgba(255,255,255,.9)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>Invite a client to this journey</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>Head to People to send an invite pre-assigned to "{journey?.name || '…'}"</div>
            </div>
            <a href="/clients" className="btn btn-primary btn-sm">Go to People</a>
          </div>
        </div>

        <div style={{ padding: 13, borderRadius: 40, background: 'linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.5))', border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 30px 60px -32px rgba(28,38,80,.45)' }}>
          <div style={{ borderRadius: 30, overflowY: 'auto', maxHeight: 720, background: 'linear-gradient(170deg,#eef0fb,#e2e6f8 55%,#e9e4f6)', padding: '22px 16px 24px', minHeight: 560, position: 'relative' }}>
            {loading || !journey ? <div className="spinner" /> : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(30,40,80,.5)' }}>Welcome</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#131829', marginTop: 3 }}>{journey.name}</div>
                {journey.description && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(30,40,80,.6)', marginTop: 6 }}>{journey.description}</div>}

                <div style={{ marginTop: 18, padding: 16, borderRadius: 22, background: 'rgba(255,255,255,.62)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.95)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: 'rgba(30,40,80,.6)' }}>
                    <span>Your progress</span><span style={{ fontSize: 15, color: '#131829' }}>0%</span>
                  </div>
                  <div style={{ marginTop: 8, height: 7, borderRadius: 7, background: 'rgba(30,40,80,.1)' }} />
                  <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 600, color: 'rgba(30,40,80,.5)' }}>0 of {allTasks.length} steps complete</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {allTasks.map((t, i) => {
                    const expanded = expandedStepId === t.id;
                    return (
                      <div key={t.id} style={{ borderRadius: 16, background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.85)', overflow: 'hidden' }}>
                        <div onClick={() => setExpandedStepId(expanded ? null : t.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: expanded ? '#5b4fd6' : 'rgba(30,40,80,.12)', color: expanded ? '#fff' : 'rgba(30,40,80,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2038', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                          </div>
                          <span style={{ fontSize: 12, color: 'rgba(30,40,80,.45)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>⌄</span>
                        </div>
                        {expanded && (
                          <div style={{ padding: '4px 12px 14px' }}>
                            <StepPreviewBody task={t} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {allTasks.length === 0 && <div style={{ fontSize: 12, color: 'rgba(30,40,80,.5)' }}>No steps in this journey yet.</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
