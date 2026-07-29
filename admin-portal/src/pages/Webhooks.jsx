import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../main';

const EVENT_DESCRIPTIONS = {
  'client.registered': 'A new client creates an account',
  'client.journey_assigned': 'Admin assigns a journey to a client',
  'task.completed': 'Client checks off a task',
  'section.completed': 'Client completes all tasks in a section',
  'journey.completed': 'Client finishes every task in their journey',
  'document.signed': 'A DocuSeal document is signed',
};

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([api.getWebhooks(), api.getWebhookEvents()])
      .then(([w, e]) => { setEndpoints(w); setAllEvents(e); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const del = async (id) => {
    if (!confirm('Delete this webhook endpoint?')) return;
    await api.deleteWebhook(id); toast('Deleted'); load();
  };

  const toggle = async (ep) => {
    await api.updateWebhook(ep.id, { ...ep, active: !ep.active });
    toast(ep.active ? 'Disabled' : 'Enabled'); load();
  };

  const test = async (id) => {
    await api.testWebhook(id);
    toast('Test ping sent — check your endpoint');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Webhooks</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>
            Connect to Zapier, DocuSeal callbacks, or any HTTP endpoint
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add endpoint</button>
      </div>

      {/* Event reference card */}
      <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Available events</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {allEvents.map(ev => (
            <div key={ev} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span className="code">{ev}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{EVENT_DESCRIPTIONS[ev] || ''}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="spinner" /> : endpoints.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔗</div>
          <p>No webhook endpoints yet</p>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            Paste a <strong>Zapier Catch Hook URL</strong> or any HTTPS endpoint to start receiving events.
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Add your first endpoint</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {endpoints.map(ep => (
            <div key={ep.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ep.active ? 'var(--teal)' : 'var(--border-dark)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{ep.label || 'Unnamed endpoint'}</span>
                    <span className={`badge ${ep.active ? 'badge-teal' : 'badge-gray'}`}>{ep.active ? 'Active' : 'Disabled'}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', marginBottom: 8, wordBreak: 'break-all' }}>{ep.url}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(ep.events || []).includes('*')
                      ? <span className="badge badge-purple">All events</span>
                      : ep.events.map(ev => <span key={ev} className="badge badge-gray">{ev}</span>)
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => test(ep.id)}>Send test</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDeliveryModal(ep)}>Log</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(ep)}>{ep.active ? 'Disable' : 'Enable'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(ep.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <WebhookModal allEvents={allEvents} onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); load(); }} />
      )}
      {deliveryModal && (
        <DeliveryModal endpoint={deliveryModal} onClose={() => setDeliveryModal(null)} />
      )}
    </div>
  );
}

function WebhookModal({ allEvents, onClose, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState({ url: '', label: '', secret: '', events: ['*'] });
  const [saving, setSaving] = useState(false);
  const [useAllEvents, setUseAllEvents] = useState(true);

  const toggleEvent = (ev) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev]
    }));
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createWebhook({ ...form, events: useAllEvents ? ['*'] : form.events });
      toast('Endpoint registered'); onSave();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add webhook endpoint</div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Endpoint URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required placeholder="https://hooks.zapier.com/hooks/catch/…" />
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Paste your Zapier Catch Hook URL or any HTTPS endpoint</div>
          </div>
          <div className="form-group">
            <label>Label (optional)</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Zapier — Slack notifications" />
          </div>
          <div className="form-group">
            <label>Signing secret (optional)</label>
            <input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Used to verify payloads via HMAC-SHA256" />
          </div>

          <div className="form-group">
            <label style={{ marginBottom: 8 }}>Events to send</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" className={`tag-pill ${useAllEvents ? 'selected' : ''}`} onClick={() => setUseAllEvents(true)}>All events</button>
              <button type="button" className={`tag-pill ${!useAllEvents ? 'selected' : ''}`} onClick={() => setUseAllEvents(false)}>Choose specific</button>
            </div>
            {!useAllEvents && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allEvents.map(ev => (
                  <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 400 }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                    <span className="code">{ev}</span>
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>{EVENT_DESCRIPTIONS[ev]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add endpoint'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeliveryModal({ endpoint, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getDeliveries(endpoint.id).then(setDeliveries).finally(() => setLoading(false));
  }, [endpoint.id]);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-title">Delivery log — {endpoint.label || endpoint.url.slice(0, 40)}</div>
        {loading ? <div className="spinner" style={{ margin: '20px auto' }} /> : deliveries.length === 0 ? (
          <div style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', padding: 24 }}>No deliveries yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {deliveries.map(d => (
              <div key={d.id} style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', border: `1px solid ${d.success ? 'var(--border)' : '#f7c1c1'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 14 }}>{d.success ? '✅' : '❌'}</span>
                    <span className="code">{d.event}</span>
                    {d.status_code && <span className={`badge ${d.success ? 'badge-green' : 'badge-red'}`}>{d.status_code}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{new Date(d.delivered_at).toLocaleString()}</span>
                </div>
                {!d.success && d.response_body && (
                  <div style={{ marginTop: 6, fontSize: 12, fontFamily: 'monospace', color: 'var(--red)', wordBreak: 'break-all' }}>{d.response_body.slice(0, 200)}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
