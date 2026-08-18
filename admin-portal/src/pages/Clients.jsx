import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../main';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const toast = useToast();
  const nav = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([api.getClients(), api.getJourneys(), api.getInvites('client')])
      .then(([c, j, i]) => { setClients(c); setJourneys(j); setInvites(i); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const unassign = async (cid, jid, jname) => {
    if (!confirm(`Remove "${jname}"?`)) return;
    await api.unassignJourney(cid, jid); toast('Unassigned'); load();
  };

  const revokeInvite = async (id) => {
    try { await api.revokeInvite(id); toast('Invite revoked'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  const filtered = clients.filter(c =>
    [c.name, c.email, c.company || ''].some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="page-header">
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>{clients.length} registered</div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite client</button>
      </div>
      <input placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 340, marginBottom: 16 }} />

      {invites.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: 13 }}>Pending invites ({invites.length})</div>
          <table>
            <tbody>
              {invites.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{inv.journey_name ? `Will get: ${inv.journey_name}` : 'No journey pre-assigned'}</td>
                  <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(inv.link); toast('Link copied'); }}>Copy link</button>
                    <button className="btn btn-danger btn-sm" onClick={() => revokeInvite(inv.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? <div className="spinner" /> : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">👥</div><p>{search ? 'No matches' : 'No clients yet'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(client => (
            <div key={client.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', gap: 14, cursor: 'pointer' }} onClick={() => nav(`/clients/${client.id}`)}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                    {client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{client.name}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 13 }}>{client.email}</div>
                    {client.company && <div style={{ color: 'var(--text3)', fontSize: 12 }}>{client.company}</div>}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setAssignModal(client); }}>+ Assign journey</button>
              </div>

              {client.journeys?.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {client.journeys.map(j => {
                    const pct = j.task_count > 0 ? Math.round((j.completed_count / j.task_count) * 100) : 0;
                    return (
                      <div key={j.id} style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{j.journey_name}</span>
                            <span className={`badge ${j.completed_at ? 'badge-green' : 'badge-amber'}`}>{j.completed_at ? 'Complete' : 'In progress'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{j.completed_count}/{j.task_count}</span>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', fontSize: 12 }} onClick={() => unassign(client.id, j.journey_id, j.journey_name)}>Remove</button>
                          </div>
                        </div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%' }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
              {(!client.journeys || client.journeys.length === 0) && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--text3)' }}>No journey assigned</div>
              )}
            </div>
          ))}
        </div>
      )}

      {assignModal && <AssignModal client={assignModal} journeys={journeys} onClose={() => setAssignModal(null)} onSave={() => { setAssignModal(null); load(); }} />}
      {showInvite && <InviteClientModal journeys={journeys} onClose={() => setShowInvite(false)} onSave={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

function InviteClientModal({ journeys, onClose, onSave }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [journeyId, setJourneyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const invite = await api.createInvite({ email, role: 'client', journey_id: journeyId || undefined });
      setLink(invite.link);
      toast('Invite created');
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Invite a client</div>
        {!link ? (
          <form onSubmit={submit}>
            <div className="form-group"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="client@company.com" autoFocus /></div>
            <div className="form-group">
              <label>Pre-assign a journey (optional)</label>
              <select value={journeyId} onChange={e => setJourneyId(e.target.value)}>
                <option value="">None — assign later</option>
                {journeys.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
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

function AssignModal({ client, journeys, onClose, onSave }) {
  const toast = useToast();
  const [journeyId, setJourneyId] = useState('');
  const [saving, setSaving] = useState(false);
  const assignedIds = (client.journeys || []).map(j => j.journey_id);
  const available = journeys.filter(j => !assignedIds.includes(j.id));

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.assignJourney(client.id, journeyId); toast(`Assigned — welcome email sent!`); onSave(); }
    catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Assign journey to {client.name}</div>
        {available.length === 0 ? <p style={{ color: 'var(--text2)' }}>All journeys already assigned.</p> : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Select journey</label>
              <select value={journeyId} onChange={e => setJourneyId(e.target.value)} required>
                <option value="">Choose…</option>
                {available.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>A welcome email will be sent to {client.email}. Any DocuSeal documents set to "on assignment" will be sent automatically.</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !journeyId}>{saving ? 'Assigning…' : 'Assign & notify'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
