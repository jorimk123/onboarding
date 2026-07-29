import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth, useToast } from '../main';

function CopyLink({ link }) {
  const toast = useToast();
  const copy = () => { navigator.clipboard.writeText(link); toast('Invite link copied'); };
  return <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>Copy link</button>;
}

export default function TeamPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const toast = useToast();

  const [business, setBusiness] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getBusiness(), api.getTeam(), api.getInvites('admin')])
      .then(([b, t, i]) => { setBusiness(b); setNameDraft(b.name); setTeam(t); setInvites(i); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft === business.name) return;
    try { await api.updateBusiness({ name: nameDraft }); toast('Business name updated'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (id, name) => {
    if (!confirm(`Remove ${name} from your team?`)) return;
    try { await api.removeTeamMember(id); toast('Removed'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  const revoke = async (id) => {
    try { await api.revokeInvite(id); toast('Invite revoked'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  const resend = async (id) => {
    try { const r = await api.resendInvite(id); toast(process.env.NODE_ENV === 'production' ? 'Invite resent' : 'Invite resent (see link below)'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Team</div><div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>Manage your business account and admins</div></div>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite admin</button>}
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Business account</div>
            <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
              <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} disabled={!isOwner} />
              {isOwner && <button className="btn btn-secondary" onClick={saveName}>Save</button>}
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Admins ({team.length})</div>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {team.map(t => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td style={{ color: 'var(--text2)' }}>{t.email}</td>
                    <td><span className={`badge ${t.role === 'owner' ? 'badge-purple' : 'badge-gray'}`}>{t.role}</span></td>
                    <td>{isOwner && t.role === 'admin' && <button className="btn btn-danger btn-sm" onClick={() => remove(t.id, t.name)}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isOwner && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Pending admin invites ({invites.length})</div>
              {invites.length === 0 ? (
                <div className="empty" style={{ padding: '32px 20px' }}><p>No pending invites</p></div>
              ) : (
                <table>
                  <thead><tr><th>Email</th><th>Invited</th><th>Expires</th><th></th></tr></thead>
                  <tbody>
                    {invites.map(inv => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{new Date(inv.expires_at).toLocaleDateString()}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <CopyLink link={inv.link} />
                          <button className="btn btn-ghost btn-sm" onClick={() => resend(inv.id)}>Resend</button>
                          <button className="btn btn-danger btn-sm" onClick={() => revoke(inv.id)}>Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {showInvite && <InviteAdminModal onClose={() => setShowInvite(false)} onSave={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

function InviteAdminModal({ onClose, onSave }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState('');
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const invite = await api.createInvite({ email, role: 'admin' });
      setLink(invite.link);
      toast('Invite created');
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Invite an admin</div>
        {!link ? (
          <form onSubmit={submit}>
            <div className="form-group"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="colleague@company.com" autoFocus /></div>
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
              <button className="btn btn-primary" onClick={onSave}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
