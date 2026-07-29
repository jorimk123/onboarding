import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../main';

export default function JourneyBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [taskModal, setTaskModal] = useState(null);

  const load = () => { setLoading(true); api.getJourney(id).then(setJourney).catch(() => nav('/journeys')).finally(() => setLoading(false)); };
  useEffect(load, [id]);

  const addSection = async (e) => {
    e.preventDefault();
    if (!sectionTitle.trim()) return;
    await api.createSection(id, { title: sectionTitle, position: journey.sections.length });
    toast('Section added'); setSectionTitle(''); setAddingSection(false); load();
  };

  const delSection = async (sid, title) => {
    if (!confirm(`Delete section "${title}" and all its tasks?`)) return;
    await api.deleteSection(id, sid); toast('Section deleted'); load();
  };

  const delTask = async (sid, tid, title) => {
    if (!confirm(`Delete task "${title}"?`)) return;
    await api.deleteTask(id, sid, tid); toast('Task deleted'); load();
  };

  if (loading) return <div className="spinner" />;
  if (!journey) return null;

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/journeys')} style={{ marginBottom: 12 }}>← Back</button>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{journey.name}</div>
          {journey.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{journey.description}</div>}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span className="badge badge-purple">{journey.sections.length} sections</span>
            <span className="badge badge-gray">{journey.sections.reduce((a, s) => a + s.tasks.length, 0)} tasks</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddingSection(true)}>+ Add section</button>
      </div>

      {journey.sections.length === 0 && !addingSection ? (
        <div className="empty"><div className="empty-icon">📋</div><p>No sections yet</p><button className="btn btn-primary" onClick={() => setAddingSection(true)}>Add first section</button></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {journey.sections.map(section => (
            <div key={section.id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: section.tasks.length ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{section.title}</span>
                  <span className="badge badge-gray">{section.tasks.length} tasks</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTaskModal({ sectionId: section.id })}>+ Add task</button>
                  <button className="btn btn-danger btn-sm" onClick={() => delSection(section.id, section.title)}>Delete</button>
                </div>
              </div>
              {section.tasks.map((task, i) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderBottom: i < section.tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--border-dark)', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{task.title}</div>
                    {task.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{task.description}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {task.tag && <span className="badge badge-purple">{task.tag}</span>}
                      {task.assignee && <span style={{ fontSize: 12, color: 'var(--text2)' }}>👤 {task.assignee}</span>}
                      {task.docuseal_template_id && (
                        <span className="badge badge-teal" title={`DocuSeal template: ${task.docuseal_template_id}`}>
                          📄 DocuSeal ({task.docuseal_trigger})
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTaskModal({ sectionId: section.id, task })}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => delTask(section.id, task.id, task.title)}>✕</button>
                  </div>
                </div>
              ))}
              {section.tasks.length === 0 && (
                <div style={{ padding: '14px 20px', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
                  No tasks — <button className="btn btn-ghost btn-sm" style={{ display: 'inline' }} onClick={() => setTaskModal({ sectionId: section.id })}>add one</button>
                </div>
              )}
            </div>
          ))}

          {addingSection && (
            <div className="card">
              <form onSubmit={addSection} style={{ display: 'flex', gap: 8 }}>
                <input autoFocus value={sectionTitle} onChange={e => setSectionTitle(e.target.value)} placeholder="Section title, e.g. Week 1" />
                <button className="btn btn-primary" type="submit">Add</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setAddingSection(false); setSectionTitle(''); }}>Cancel</button>
              </form>
            </div>
          )}
        </div>
      )}

      {taskModal && (
        <TaskModal journeyId={id} sectionId={taskModal.sectionId} task={taskModal.task}
          onClose={() => setTaskModal(null)} onSave={() => { setTaskModal(null); load(); }} />
      )}
    </div>
  );
}

function TaskModal({ journeyId, sectionId, task, onClose, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: task?.title || '', description: task?.description || '',
    tag: task?.tag || '', assignee: task?.assignee || '',
    docuseal_template_id: task?.docuseal_template_id || '',
    docuseal_trigger: task?.docuseal_trigger || 'assignment',
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (task) await api.updateTask(journeyId, sectionId, task.id, form);
      else await api.createTask(journeyId, sectionId, form);
      toast(task ? 'Task updated' : 'Task added'); onSave();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{task ? 'Edit task' : 'Add task'}</div>
        <form onSubmit={submit}>
          <div className="form-group"><label>Task name</label><input autoFocus value={form.title} onChange={set('title')} required placeholder="e.g. Sign NDA" /></div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={set('description')} rows={3} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Tag</label><input value={form.tag} onChange={set('tag')} placeholder="HR, IT…" /></div>
            <div className="form-group"><label>Assignee</label><input value={form.assignee} onChange={set('assignee')} placeholder="Sarah…" /></div>
          </div>

          {/* DocuSeal section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              📄 DocuSeal <span style={{ fontWeight: 400, color: 'var(--text2)' }}>(optional)</span>
            </div>
            <div className="form-group">
              <label>DocuSeal Template ID</label>
              <input value={form.docuseal_template_id} onChange={set('docuseal_template_id')} placeholder="e.g. 12345 — leave blank if not needed" />
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Found in DocuSeal → Templates → your template URL</div>
            </div>
            {form.docuseal_template_id && (
              <div className="form-group">
                <label>When to send the document</label>
                <select value={form.docuseal_trigger} onChange={set('docuseal_trigger')}>
                  <option value="assignment">On journey assignment (send immediately)</option>
                  <option value="completion">When this task is checked off</option>
                </select>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
