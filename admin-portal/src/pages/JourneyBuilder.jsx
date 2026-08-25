import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../main';

export const STEP_TYPES = [
  { id: 'Form', label: 'Form', chip: 'rgba(91,79,214,.14)', dot: '#5b4fd6', blurb: 'Ask questions and collect answers.' },
  { id: 'Upload', label: 'File upload', chip: 'rgba(130,225,225,.3)', dot: '#12706f', blurb: 'Ask them to attach a document or photo.' },
  { id: 'Sign', label: 'E-signature', chip: 'rgba(255,168,200,.26)', dot: '#d1508a', blurb: 'Send a document out to be signed via DocuSeal.' },
  { id: 'Check', label: 'Quiz', chip: 'rgba(255,196,120,.32)', dot: '#c07a1c', blurb: 'A multiple-choice quiz they answer one question at a time.' },
  { id: 'Learn', label: 'Training module', chip: 'rgba(107,79,213,.14)', dot: '#6b4fd5', blurb: 'Videos they watch before Next unlocks.' },
  { id: 'Book', label: 'Schedule a call', chip: 'rgba(34,169,140,.16)', dot: '#177a66', blurb: 'Link out to a booking page (Calendly, Cal.com, etc).' },
];

export const FIELD_TYPES = ['Short text', 'Long text', 'Email', 'Phone', 'Date', 'Multiple choice', 'Yes / No', 'Checkbox', 'Dropdown', 'Upload', 'Video'];

const stepMeta = id => STEP_TYPES.find(s => s.id === id) || STEP_TYPES[0];
const uid = () => 'f' + Math.random().toString(36).slice(2, 9);

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
    <div className="page" style={{ paddingTop: 0 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/journeys')} style={{ marginBottom: 12 }}>← Back</button>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{journey.name}</div>
          {journey.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{journey.description}</div>}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span className="badge badge-purple">{journey.sections.length} sections</span>
            <span className="badge badge-gray">{journey.sections.reduce((a, s) => a + s.tasks.length, 0)} steps</span>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: section.tasks.length ? '1px solid var(--hairline)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{section.title}</span>
                  <span className="badge badge-gray">{section.tasks.length} steps</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTaskModal({ sectionId: section.id })}>+ Add step</button>
                  <button className="btn btn-danger btn-sm" onClick={() => delSection(section.id, section.title)}>Delete</button>
                </div>
              </div>
              {section.tasks.map((task, i) => {
                const meta = stepMeta(task.step_type);
                const isQuiz = task.step_type === 'Check';
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderBottom: i < section.tasks.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: meta.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: meta.dot }} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{task.title}</div>
                      {task.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{task.description}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge badge-purple">{isQuiz ? 'Quiz' : meta.label}</span>
                        {task.tag && <span className="badge badge-gray">{task.tag}</span>}
                        {task.assignee && <span style={{ fontSize: 12, color: 'var(--text2)' }}>👤 {task.assignee}</span>}
                        {task.step_type === 'Sign' && task.docuseal_template_id && (
                          <span className="badge badge-teal" title={`DocuSeal template: ${task.docuseal_template_id}`}>📄 DocuSeal ({task.docuseal_trigger})</span>
                        )}
                        {isQuiz && <span className="badge badge-amber">{(task.fields || []).filter(f => f.type === 'Multiple choice').length} questions</span>}
                        {task.step_type === 'Book' && task.booking_url && <span className="badge badge-teal">🗓️ Booking link set</span>}
                        {(task.fields || []).length > 0 && task.step_type !== 'Check' && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{task.fields.length} field{task.fields.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setTaskModal({ sectionId: section.id, task })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => delTask(section.id, task.id, task.title)}>✕</button>
                    </div>
                  </div>
                );
              })}
              {section.tasks.length === 0 && (
                <div style={{ padding: '14px 20px', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
                  No steps — <button className="btn btn-ghost btn-sm" style={{ display: 'inline' }} onClick={() => setTaskModal({ sectionId: section.id })}>add one</button>
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

function emptyField(type = 'Short text') {
  return { id: uid(), label: '', type, options: ['Option 1', 'Option 2'], url: '', required: true };
}

function FieldEditor({ fields, setFields, allowedTypes, addLabel }) {
  const update = (i, patch) => setFields(fields.map((f, fi) => fi === i ? { ...f, ...patch } : f));
  const remove = i => setFields(fields.filter((_, fi) => fi !== i));
  const add = () => setFields([...fields, emptyField(allowedTypes[0])]);

  return (
    <div>
      {fields.map((f, i) => (
        <div key={f.id} style={{ border: '1px solid var(--hairline)', borderRadius: 14, padding: 12, marginBottom: 10, background: 'rgba(255,255,255,.5)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={f.label} onChange={e => update(i, { label: e.target.value })} placeholder={`Question ${i + 1}`} style={{ flex: 1 }} />
            <select value={f.type} onChange={e => update(i, { type: e.target.value })} style={{ width: 150 }}>
              {allowedTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(i)}>✕</button>
          </div>
          {(f.type === 'Multiple choice' || f.type === 'Dropdown') && (
            <div>
              <label style={{ fontSize: 11.5 }}>Options (one per line)</label>
              <textarea rows={3} value={(f.options || []).join('\n')} onChange={e => update(i, { options: e.target.value.split('\n') })} placeholder={'Option A\nOption B'} />
            </div>
          )}
          {f.type === 'Video' && (
            <div>
              <label style={{ fontSize: 11.5 }}>YouTube URL</label>
              <input value={f.url || ''} onChange={e => update(i, { url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontWeight: 400, fontSize: 12.5 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.required !== false} onChange={e => update(i, { required: e.target.checked })} /> Required
          </label>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={add}>{addLabel || '+ Add question'}</button>
    </div>
  );
}

function TaskModal({ journeyId, sectionId, task, onClose, onSave }) {
  const toast = useToast();
  const [stepType, setStepType] = useState(task?.step_type || 'Form');
  const [form, setForm] = useState({
    title: task?.title || '', description: task?.description || '',
    tag: task?.tag || '', assignee: task?.assignee || '',
    docuseal_template_id: task?.docuseal_template_id || '',
    docuseal_trigger: task?.docuseal_trigger || 'assignment',
    booking_url: task?.booking_url || '',
  });
  const [fields, setFields] = useState(task?.fields?.length ? task.fields : []);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const changeStepType = (id) => {
    setStepType(id);
    if (id === 'Upload' && fields.length === 0) setFields([emptyField('Upload')]);
    if (id === 'Learn' && fields.length === 0) setFields([emptyField('Video')]);
    if (id === 'Form' && fields.length === 0) setFields([emptyField('Short text')]);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      let outFields = fields;
      if (stepType === 'Check') {
        outFields = fields.filter(f => f.type === 'Multiple choice');
      } else if (stepType === 'Sign' || stepType === 'Book') {
        outFields = [];
      }

      const payload = {
        title: form.title, description: form.description, tag: form.tag || null, assignee: form.assignee || null,
        step_type: stepType,
        fields: outFields,
        docuseal_template_id: stepType === 'Sign' ? (form.docuseal_template_id || null) : null,
        docuseal_trigger: form.docuseal_trigger,
        booking_url: stepType === 'Book' ? (form.booking_url || null) : null,
      };

      if (task) await api.updateTask(journeyId, sectionId, task.id, payload);
      else await api.createTask(journeyId, sectionId, payload);
      toast(task ? 'Step updated' : 'Step added'); onSave();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-title">{task ? 'Edit step' : 'Add step'}</div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Step type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {STEP_TYPES.map(s => (
                <button type="button" key={s.id} onClick={() => changeStepType(s.id)}
                  className={`tag-pill ${stepType === s.id ? 'selected' : ''}`} style={{ justifyContent: 'center' }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 6 }}>{stepMeta(stepType).blurb}</div>
          </div>

          <div className="form-group"><label>Step name</label><input autoFocus value={form.title} onChange={set('title')} required placeholder="e.g. Sign NDA" /></div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={set('description')} rows={2} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Tag</label><input value={form.tag} onChange={set('tag')} placeholder="HR, IT…" /></div>
            <div className="form-group"><label>Assignee</label><input value={form.assignee} onChange={set('assignee')} placeholder="Sarah…" /></div>
          </div>

          {stepType === 'Sign' && (
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📄 DocuSeal</div>
              <div className="form-group">
                <label>DocuSeal Template ID</label>
                <input value={form.docuseal_template_id} onChange={set('docuseal_template_id')} placeholder="e.g. 12345" />
              </div>
              <div className="form-group">
                <label>When to send the document</label>
                <select value={form.docuseal_trigger} onChange={set('docuseal_trigger')}>
                  <option value="assignment">On journey assignment (send immediately)</option>
                  <option value="completion">When this step is checked off</option>
                </select>
              </div>
            </div>
          )}

          {stepType === 'Book' && (
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, marginTop: 4 }}>
              <div className="form-group">
                <label>Booking link</label>
                <input value={form.booking_url} onChange={set('booking_url')} placeholder="https://calendly.com/your-team/intro" />
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>We link out to your existing Calendly/Cal.com page — no calendar API needed. The client confirms themselves once booked.</div>
              </div>
            </div>
          )}

          {stepType === 'Check' && (
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quiz questions</div>
              <FieldEditor fields={fields.filter(f => f.type === 'Multiple choice').length ? fields : [emptyField('Multiple choice')]}
                setFields={fs => setFields(fs)} allowedTypes={['Multiple choice']} addLabel="+ Add question" />
            </div>
          )}

          {(stepType === 'Form' || stepType === 'Upload' || stepType === 'Learn') && (
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Fields</div>
              <FieldEditor fields={fields} setFields={setFields}
                allowedTypes={stepType === 'Upload' ? ['Upload'] : stepType === 'Learn' ? ['Video', 'Yes / No', 'Checkbox'] : FIELD_TYPES.filter(t => t !== 'Upload')}
                addLabel={stepType === 'Upload' ? '+ Add file to request' : stepType === 'Learn' ? '+ Add video' : '+ Add question'} />
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save step'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
