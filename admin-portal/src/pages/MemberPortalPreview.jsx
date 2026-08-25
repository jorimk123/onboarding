import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

const NOTES = [
  { t: 'Resumable progress', d: 'A client can sign out and come back later — the portal always shows exactly where they left off.' },
  { t: 'Progress is always visible', d: 'Percentage complete and task count shown at the top of every screen.' },
  { t: 'One invite, one account', d: 'They set a password from your invite link, then sign back in anytime with it.' },
  { t: 'Assigned automatically', d: 'Assigning a journey to a client immediately sends their welcome email.' },
];

export default function MemberPortalPreviewPage() {
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('journey');
  const [journeys, setJourneys] = useState([]);
  const [journeyId, setJourneyId] = useState(presetId || '');
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getJourneys().then(js => {
      setJourneys(js);
      const preset = presetId && js.find(j => String(j.id) === String(presetId));
      if (preset) setJourneyId(String(preset.id));
      else if (js[0]) setJourneyId(String(js[0].id));
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (journeyId) api.getJourney(journeyId).then(setJourney); }, [journeyId]);

  const allTasks = journey ? journey.sections.flatMap(s => s.tasks) : [];

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>What a client sees</div>
            <div style={{ flex: 1 }} />
            <select value={journeyId} onChange={e => setJourneyId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
              {journeys.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text2)', maxWidth: '54ch' }}>
            This is a preview of the journey structure, not a specific client's live progress — every task shows as not-yet-done here.
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
          <div style={{ borderRadius: 30, overflow: 'hidden', background: 'linear-gradient(170deg,#eef0fb,#e2e6f8 55%,#e9e4f6)', padding: '22px 16px 24px', minHeight: 560, position: 'relative' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                  {allTasks.slice(0, 6).map((t, i) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.85)' }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(30,40,80,.12)', color: 'rgba(30,40,80,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2038', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      </div>
                    </div>
                  ))}
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
