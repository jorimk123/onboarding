import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, useToast } from '../main';

const ROADMAP = [
  { t: 'Integrations', d: 'Connect Checkr background checks, Google Calendar, Mailchimp, QuickBooks. (DocuSeal and email are already built — just need API keys added in Railway.)' },
  { t: 'Two-factor authentication', d: 'Requires a full login-flow change (TOTP + backup codes) — not yet built.' },
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const isOwner = user?.role === 'owner';
  const toast = useToast();
  const nav = useNavigate();
  const [business, setBusiness] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [logoDraft, setLogoDraft] = useState('');
  const [colorDraft, setColorDraft] = useState('#5b4fd6');
  const [archiveDraft, setArchiveDraft] = useState('');
  const [digestDraft, setDigestDraft] = useState(false);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getBusiness(), api.getTeam()])
      .then(([b, t]) => {
        setBusiness(b);
        setNameDraft(b.name);
        setLogoDraft(b.logo_url || '');
        setColorDraft(b.accent_color || '#5b4fd6');
        setArchiveDraft(b.auto_archive_days ?? '');
        setDigestDraft(!!b.weekly_digest_enabled);
        setTeam(t);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async (fields, successMsg) => {
    setSaving(true);
    try {
      await api.updateBusiness(fields);
      toast(successMsg);
      load();
      refreshUser();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="page" style={{ paddingTop: 0 }}><div className="spinner" /></div>;

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Organization</div>
            <label>Organization name</label>
            <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginBottom: 16 }}>
              <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} disabled={!isOwner} />
              {isOwner && <button className="btn btn-secondary" disabled={saving || nameDraft === business.name} onClick={() => save({ name: nameDraft }, 'Organization name updated')}>Save</button>}
            </div>

            <label>Logo URL</label>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>Paste a link to a hosted image — shown in the sidebar and client portal.</div>
            <div style={{ display: 'flex', gap: 8, maxWidth: 420, alignItems: 'center', marginBottom: 16 }}>
              {logoDraft && <img src={logoDraft} alt="" style={{ maxWidth: 40, maxHeight: 40, width: 'auto', height: 'auto', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
              <input value={logoDraft} onChange={e => setLogoDraft(e.target.value)} disabled={!isOwner} placeholder="https://example.com/logo.png" />
              {isOwner && <button className="btn btn-secondary" disabled={saving || logoDraft === (business.logo_url || '')} onClick={() => save({ logo_url: logoDraft || null }, 'Logo updated')}>Save</button>}
            </div>

            <label>Accent color</label>
            <div style={{ display: 'flex', gap: 8, maxWidth: 420, alignItems: 'center' }}>
              <input type="color" value={colorDraft} onChange={e => setColorDraft(e.target.value)} disabled={!isOwner} style={{ width: 44, padding: 3, height: 38 }} />
              <input value={colorDraft} onChange={e => setColorDraft(e.target.value)} disabled={!isOwner} placeholder="#5b4fd6" />
              {isOwner && <button className="btn btn-secondary" disabled={saving || colorDraft === (business.accent_color || '#5b4fd6')} onClick={() => save({ accent_color: colorDraft }, 'Accent color updated — refresh to see it everywhere')}>Save</button>}
            </div>
            {!isOwner && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>Only the owner can edit organization details.</div>}
          </div>

          <div className="card">
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Policies</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 16 }}>Real, persisted settings enforced by scheduled jobs on the backend.</div>

            <div style={{ marginBottom: 18 }}>
              <label>Auto-archive completed journeys after</label>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>Runs hourly. Leave blank to never auto-archive.</div>
              <div style={{ display: 'flex', gap: 8, maxWidth: 300, alignItems: 'center' }}>
                <input type="number" min="1" value={archiveDraft} onChange={e => setArchiveDraft(e.target.value)} disabled={!isOwner} placeholder="e.g. 30" style={{ width: 100 }} />
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>days</span>
                {isOwner && (
                  <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => save({ auto_archive_days: archiveDraft === '' ? null : parseInt(archiveDraft, 10) }, 'Auto-archive setting saved')}>
                    Save
                  </button>
                )}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={`toggle-track ${digestDraft ? 'on' : 'off'}`} onClick={() => isOwner && setDigestDraft(d => !d)} style={{ opacity: isOwner ? 1 : 0.5, cursor: isOwner ? 'pointer' : 'default' }}>
                  <div className="toggle-knob" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Weekly digest email</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '6px 0 10px' }}>
                Sends every Monday-ish to all owners/admins: people in progress, completions this week, and anyone stalled 7+ days.
                Requires RESEND_API_KEY to be set in Railway — without it, this toggle saves your preference but no email goes out.
              </div>
              {isOwner && (
                <button className="btn btn-secondary btn-sm" disabled={saving || digestDraft === !!business.weekly_digest_enabled} onClick={() => save({ weekly_digest_enabled: digestDraft }, digestDraft ? 'Weekly digest enabled' : 'Weekly digest disabled')}>
                  Save
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Team and roles</div>
              <span className="badge badge-purple">{team.length}</span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => nav('/team')}>Manage team →</button>
            </div>
            {team.slice(0, 5).map((t, i) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t.email}</div>
                </div>
                <span className={`badge ${t.role === 'owner' ? 'badge-purple' : 'badge-gray'}`}>{t.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Coming soon</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, marginBottom: 14 }}>Not wired up yet — shown here so you know what's next.</div>
          {ROADMAP.map((r, i) => (
            <div key={r.t} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{r.t}</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text2)', marginTop: 3 }}>{r.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
