import { useState, useEffect, useMemo } from 'react';
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
  { id: 'BGCheck', label: 'Background check', chip: 'rgba(255,196,120,.32)', dot: '#a8600d', blurb: 'Order a MinistrySafe background check.' },
];

export const MINISTRYSAFE_LEVELS = [
  { level: 1, label: 'Level 1 — SSN trace + national criminal database' },
  { level: 2, label: 'Level 2 — Level 1 + county criminal search' },
  { level: 3, label: 'Level 3 — Level 2 + sex offender registry' },
  { level: 4, label: 'Level 4 — Level 3 + national criminal database (enhanced)' },
  { level: 5, label: 'Level 5 — Comprehensive (Level 4 + federal criminal search)' },
  { level: 6, label: 'Level 6 — Comprehensive + motor vehicle record' },
  { level: 7, label: 'Level 7 — Comprehensive + credit check' },
];

export const FIELD_TYPES = ['Short text', 'Long text', 'Email', 'Phone', 'Date', 'Multiple choice', 'Yes / No', 'Checkbox', 'Dropdown', 'Upload', 'Video'];

const stepMeta = id => STEP_TYPES.find(s => s.id === id) || STEP_TYPES[0];
const uid = () => 'f' + Math.random().toString(36).slice(2, 9);
const emptyField = (type = 'Short text') => ({ id: uid(), label: '', type, options: ['Option 1', 'Option 2'], url: '', required: true });

function defaultsForType(id) {
  if (id === 'Upload') return { fields: [emptyField('Upload')] };
  if (id === 'Learn') return { fields: [emptyField('Video')] };
  if (id === 'Check') return { fields: [emptyField('Multiple choice')] };
  if (id === 'Form') return { fields: [emptyField('Short text')] };
  return { fields: [] };
}

function stepSummary(task) {
  const isQuiz = task.step_type === 'Check';
  if (isQuiz) return `${(task.fields || []).filter(f => f.type === 'Multiple choice').length} questions`;
  if (task.step_type === 'Sign') return task.docuseal_template_id ? 'DocuSeal' : 'DocuSeal · not set up';
  if (task.step_type === 'Book') return task.booking_url ? 'Booking link set' : 'No booking link yet';
  if (task.step_type === 'BGCheck') return task.ministrysafe_package_code ? `MinistrySafe · ${task.ministrysafe_package_code}` : `MinistrySafe · Level ${task.ministrysafe_level || 1}`;
  if ((task.fields || []).length) return `${task.fields.length} field${task.fields.length !== 1 ? 's' : ''}`;
  return task.step_type;
}

// Subtitle shown under a collapsed step row, e.g. "DocuSeal · required".
function stepSubtitle(task) {
  return `${stepSummary(task)} · ${task.required_to_continue === false ? 'optional' : 'required'}`;
}

// Type-specific badge color, matching each step type's palette accent.
function badgeClassForType(stepType) {
  if (stepType === 'Sign') return 'flat-badge-pink';
  if (stepType === 'Check' || stepType === 'BGCheck') return 'flat-badge-amber';
  if (stepType === 'Upload' || stepType === 'Book') return 'flat-badge-teal';
  return 'flat-badge-purple';
}

export default function JourneyBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [journeys, setJourneys] = useState([]);
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingStepId, setDraggingStepId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => { api.getJourneys().then(setJourneys).catch(() => {}); }, []);

  const load = (keepSelection) => {
    setLoading(true);
    api.getJourney(id).then(j => {
      setJourney(j);
      if (!keepSelection) { setSelectedTaskId(null); setDraft(null); setDirty(false); }
    }).catch(() => nav('/journeys')).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, [id]);

  // Flatten sections into one ordered step list — this builder shows a
  // single continuous numbered list per journey (sections still exist
  // under the hood so nothing about existing data is lost).
  const steps = useMemo(() => {
    if (!journey) return [];
    return journey.sections.flatMap(s => s.tasks.map(t => ({ ...t, sectionId: s.id })));
  }, [journey]);

  const selectedTask = steps.find(t => t.id === selectedTaskId) || null;

  useEffect(() => {
    if (selectedTask) {
      setDraft({
        title: selectedTask.title, description: selectedTask.description || '',
        tag: selectedTask.tag || '', assignee: selectedTask.assignee || '',
        step_type: selectedTask.step_type,
        fields: selectedTask.fields || [],
        docuseal_template_id: selectedTask.docuseal_template_id || '',
        docuseal_trigger: selectedTask.docuseal_trigger || 'assignment',
        booking_url: selectedTask.booking_url || '',
        ministrysafe_level: selectedTask.ministrysafe_level || 1,
        ministrysafe_package_code: selectedTask.ministrysafe_package_code || '',
        required_to_continue: selectedTask.required_to_continue !== false,
        allow_skip: !!selectedTask.allow_skip,
        notify_reviewer: !!selectedTask.notify_reviewer,
        auto_advance: selectedTask.auto_advance !== false,
        reminder_cadence: selectedTask.reminder_cadence || 'off',
      });
      setDirty(false);
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

  const patch = (p) => { setDraft(d => ({ ...d, ...p })); setDirty(true); };

  const ensureSectionId = async () => {
    if (journey.sections.length) return journey.sections[0].id;
    const s = await api.createSection(id, { title: 'Steps', position: 0 });
    return s.id;
  };

  // Creates a step at a specific position, shifting anything already at or
  // after that position down by one. Used by both the palette's click-to-add
  // (which always targets the end of the list) and drag-and-drop (which can
  // target any position between existing steps).
  const insertStepAt = async (stepTypeId, atIndex) => {
    try {
      const sid = await ensureSectionId();
      const meta = stepMeta(stepTypeId);
      const toShift = steps.slice(atIndex);
      if (toShift.length) {
        await Promise.all(toShift.map(t => api.updateTask(id, t.sectionId, t.id, { ...t, position: t.position + 1 })));
      }
      const created = await api.createTask(id, sid, {
        title: `New ${meta.label.toLowerCase()}`, step_type: stepTypeId, position: atIndex,
        ...defaultsForType(stepTypeId),
      });
      toast('Step added');
      load(true);
      setSelectedTaskId(created.id);
    } catch (err) { toast(err.message, 'error'); }
  };

  const addStep = (stepTypeId) => insertStepAt(stepTypeId, steps.length);

  // Reorders an existing step to a new index via drag-and-drop, renumbering
  // every step in between so positions stay contiguous.
  const reorderStep = async (draggedTaskId, toIndex) => {
    const fromIndex = steps.findIndex(t => t.id === draggedTaskId);
    if (fromIndex === -1) return;
    const target = toIndex > fromIndex ? toIndex - 1 : toIndex;
    if (target === fromIndex) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(target, 0, moved);
    try {
      await Promise.all(
        reordered.map((t, i) => (t.position !== i ? api.updateTask(id, t.sectionId, t.id, { ...t, position: i }) : null)).filter(Boolean)
      );
      load(true);
    } catch (err) { toast(err.message, 'error'); }
  };

  const handlePaletteDragStart = (e, stepTypeId) => {
    e.dataTransfer.setData('application/x-step-type', stepTypeId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleStepDragStart = (e, task) => {
    e.dataTransfer.setData('application/x-task-id', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingStepId(task.id);
  };

  const handleStepDragEnd = () => { setDraggingStepId(null); setDragOverIndex(null); };

  const handleRowDragOver = (e, index) => {
    if (!e.dataTransfer.types.includes('application/x-step-type') && !e.dataTransfer.types.includes('application/x-task-id')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-task-id') ? 'move' : 'copy';
    setDragOverIndex(index);
  };

  const handleRowDrop = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    const stepType = e.dataTransfer.getData('application/x-step-type');
    const taskId = e.dataTransfer.getData('application/x-task-id');
    setDragOverIndex(null);
    setDraggingStepId(null);
    if (stepType) insertStepAt(stepType, index);
    else if (taskId) reorderStep(taskId, index);
  };

  const handleCanvasDrop = (e) => {
    // Fired when a drag ends over the container but not on a specific row
    // (e.g. below the last step, or on an empty journey) — always appends.
    e.preventDefault();
    setDragOverIndex(null);
    setDraggingStepId(null);
    const stepType = e.dataTransfer.getData('application/x-step-type');
    const taskId = e.dataTransfer.getData('application/x-task-id');
    if (stepType) insertStepAt(stepType, steps.length);
    else if (taskId) reorderStep(taskId, steps.length);
  };

  const publish = async () => {
    if (!selectedTask || !draft) return;
    setSaving(true);
    try {
      let outFields = draft.fields;
      if (draft.step_type === 'Check') outFields = draft.fields.filter(f => f.type === 'Multiple choice');
      else if (draft.step_type === 'Sign' || draft.step_type === 'Book' || draft.step_type === 'BGCheck') outFields = [];

      await api.updateTask(id, selectedTask.sectionId, selectedTask.id, {
        title: draft.title, description: draft.description, tag: draft.tag || null, assignee: draft.assignee || null,
        step_type: draft.step_type, fields: outFields, position: selectedTask.position,
        docuseal_template_id: draft.step_type === 'Sign' ? (draft.docuseal_template_id || null) : null,
        docuseal_trigger: draft.docuseal_trigger,
        booking_url: draft.step_type === 'Book' ? (draft.booking_url || null) : null,
        ministrysafe_level: draft.step_type === 'BGCheck' && !draft.ministrysafe_package_code ? (draft.ministrysafe_level || 1) : null,
        ministrysafe_package_code: draft.step_type === 'BGCheck' ? (draft.ministrysafe_package_code || null) : null,
        required_to_continue: draft.required_to_continue, allow_skip: draft.allow_skip,
        notify_reviewer: draft.notify_reviewer, auto_advance: draft.auto_advance,
        reminder_cadence: draft.reminder_cadence,
      });
      toast('Step published ✓'); setDirty(false); load(true);
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  const deleteStep = async (task) => {
    if (!confirm(`Delete step "${task.title}"?`)) return;
    await api.deleteTask(id, task.sectionId, task.id);
    toast('Step deleted');
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    load(true);
  };

  const moveStep = async (task, dir) => {
    const idx = steps.findIndex(t => t.id === task.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= steps.length) return;
    const other = steps[swapIdx];
    try {
      await Promise.all([
        api.updateTask(id, task.sectionId, task.id, { ...task, position: other.position }),
        api.updateTask(id, other.sectionId, other.id, { ...other, position: task.position }),
      ]);
      load(true);
    } catch (err) { toast(err.message, 'error'); }
  };

  if (loading) return <div className="spinner" />;
  if (!journey) return null;

  const totalDays = journey.avg_days_to_complete || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 340px', gap: 18, alignItems: 'start' }}>
      {/* ── Add a step palette ── */}
      <div className="flat-card" style={{ padding: 16, position: 'sticky', top: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Add a step</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STEP_TYPES.map(s => (
            <button key={s.id} type="button" onClick={() => addStep(s.id)}
              draggable onDragStart={e => handlePaletteDragStart(e, s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,.6)', cursor: 'grab', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: s.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 3, background: s.dot }} />
              </span>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'var(--flat-gray)', fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
          <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 2 }}>Drag onto the canvas</strong>
          Steps run in order. Anything marked optional can be skipped.
        </div>
      </div>

      {/* ── Canvas ── */}
      <div>
        {journeys.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {journeys.map(j => (
              <button key={j.id} onClick={() => nav(`/journeys/${j.id}`)}
                className={`flat-tab ${j.id === id ? 'selected' : ''}`}>{j.name}</button>
            ))}
          </div>
        )}

        <div className="flat-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{journey.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2 }}>
                {steps.length} step{steps.length !== 1 ? 's' : ''}{totalDays ? ` · average ${totalDays} days to complete` : ''}
              </div>
            </div>
            <span className="flat-badge flat-badge-teal">Live</span>
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}
            onDragOver={e => { if (e.dataTransfer.types.includes('application/x-step-type') || e.dataTransfer.types.includes('application/x-task-id')) e.preventDefault(); }}
            onDrop={handleCanvasDrop}>
            {steps.map((task, i) => {
              const meta = stepMeta(task.step_type);
              const selected = task.id === selectedTaskId;
              const isDragging = draggingStepId === task.id;
              const showDropLine = dragOverIndex === i;
              return (
                <div key={task.id}>
                  {showDropLine && <div style={{ height: 3, borderRadius: 3, background: '#5b4fd6', margin: '2px 14px' }} />}
                  <div
                    draggable
                    onDragStart={e => handleStepDragStart(e, task)}
                    onDragEnd={handleStepDragEnd}
                    onDragOver={e => handleRowDragOver(e, i)}
                    onDragLeave={() => setDragOverIndex(d => (d === i ? null : d))}
                    onDrop={e => handleRowDrop(e, i)}
                    onClick={() => setSelectedTaskId(selected ? null : task.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                      borderRadius: selected ? '14px 14px 0 0' : 14,
                      border: selected ? '1.5px solid var(--purple-mid, #5b4fd6)' : '1.5px solid transparent',
                      borderBottom: selected ? 'none' : undefined,
                      background: selected ? 'var(--purple-light)' : 'transparent', opacity: isDragging ? 0.4 : 1,
                    }}>
                    <span style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 13, lineHeight: 1, flexShrink: 0, padding: '0 2px' }} title="Drag to reorder">⠿</span>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: selected ? '#5b4fd6' : 'var(--flat-gray)', color: selected ? 'white' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{stepSubtitle(task)}</div>
                    </div>
                    <span className={`flat-badge ${badgeClassForType(task.step_type)}`}>{meta.label === 'Quiz' ? 'QUIZ' : task.step_type.toUpperCase()}</span>
                    <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => moveStep(task, -1)} title="Move up">↑</button>
                      <button className="btn btn-ghost btn-sm" disabled={i === steps.length - 1} onClick={() => moveStep(task, 1)} title="Move down">↓</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteStep(task)} title="Delete">✕</button>
                    </div>
                  </div>
                  {selected && draft && (
                    <div style={{ border: '1.5px solid var(--purple-mid, #5b4fd6)', borderTop: '1px solid var(--hairline)', borderRadius: '0 0 14px 14px', padding: '14px 14px 16px 50px', background: 'rgba(91,79,214,.03)' }}>
                      <StepFieldsEditor draft={draft} patch={patch} dirty={dirty} saving={saving} onPublish={publish} />
                    </div>
                  )}
                </div>
              );
            })}
            {steps.length > 0 && (
              <div
                onDragOver={e => { if (e.dataTransfer.types.includes('application/x-step-type') || e.dataTransfer.types.includes('application/x-task-id')) { e.preventDefault(); e.stopPropagation(); setDragOverIndex(steps.length); } }}
                onDrop={e => handleRowDrop(e, steps.length)}
                style={{ minHeight: 16 }}>
                {dragOverIndex === steps.length && <div style={{ height: 3, borderRadius: 3, background: '#5b4fd6', margin: '2px 14px' }} />}
              </div>
            )}
            {steps.length === 0 && (
              <div
                onDragOver={e => { if (e.dataTransfer.types.includes('application/x-step-type')) { e.preventDefault(); setDragOverIndex(0); } }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={e => handleRowDrop(e, 0)}
                style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13, border: dragOverIndex === 0 ? '1.5px dashed #5b4fd6' : '1.5px dashed transparent', borderRadius: 12 }}>
                No steps yet — drag one from the left, or click to add.
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={steps.length === 0} onClick={() => nav(`/portal?journey=${id}`)}>
              Preview as a client →
            </button>
          </div>
        </div>
      </div>

      {/* ── Step settings panel ── */}
      <div className="flat-card" style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
        {!selectedTask || !draft ? (
          <div style={{ padding: '20px 4px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Click a step to expand it and edit its settings here.</div>
        ) : (
          <StepSettingsPanel
            key={selectedTask.id}
            stepNumber={steps.findIndex(t => t.id === selectedTask.id) + 1}
            draft={draft} patch={patch} dirty={dirty} saving={saving} onPublish={publish}
          />
        )}
      </div>
    </div>
  );
}

function FieldList({ fields, setFields, allowedTypes, addLabel }) {
  const update = (i, patch) => setFields(fields.map((f, fi) => fi === i ? { ...f, ...patch } : f));
  const remove = i => setFields(fields.filter((_, fi) => fi !== i));
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return;
    const next = [...fields]; [next[i], next[j]] = [next[j], next[i]]; setFields(next);
  };
  const add = () => setFields([...fields, emptyField(allowedTypes[0])]);

  return (
    <div>
      {fields.map((f, i) => (
        <div key={f.id} style={{ border: '1px solid var(--hairline)', borderRadius: 12, padding: 10, marginBottom: 8, background: 'rgba(255,255,255,.6)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input value={f.label} onChange={e => update(i, { label: e.target.value })} placeholder={`Question ${i + 1}`} style={{ flex: 1, fontSize: 12.5 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>↓</button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(i)}>✕</button>
          </div>
          {allowedTypes.length > 1 && (
            <select value={f.type} onChange={e => update(i, { type: e.target.value })} style={{ width: '100%', fontSize: 12.5, marginBottom: 6 }}>
              {allowedTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {f.type === 'Multiple choice' && (
            <OptionsEditor options={f.options && f.options.length ? f.options : ['Option 1']} setOptions={opts => update(i, { options: opts })} />
          )}
          {f.type === 'Dropdown' && (
            <textarea rows={2} value={(f.options || []).join('\n')} onChange={e => update(i, { options: e.target.value.split('\n') })} placeholder={'Option A\nOption B'} style={{ fontSize: 12.5 }} />
          )}
          {f.type === 'Video' && (
            <input value={f.url || ''} onChange={e => update(i, { url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" style={{ fontSize: 12.5 }} />
          )}
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={add} style={{ width: '100%', justifyContent: 'center' }}>{addLabel || '+ Add field'}</button>
    </div>
  );
}

// Explicit answer editor for quiz (Multiple choice) questions — the admin
// types out each possible answer as its own field, 1 to 5 of them, and the
// client picks exactly one when they take the quiz.
function OptionsEditor({ options, setOptions }) {
  const opts = options && options.length ? options : ['Option 1'];
  const update = (i, val) => setOptions(opts.map((o, oi) => (oi === i ? val : o)));
  const remove = i => setOptions(opts.filter((_, oi) => oi !== i));
  const add = () => setOptions([...opts, '']);

  return (
    <div>
      {opts.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-dark)', flexShrink: 0 }} />
          <input value={o} onChange={e => update(i, e.target.value)} placeholder={`Answer ${i + 1}`} style={{ flex: 1, fontSize: 12.5 }} />
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(i)} disabled={opts.length <= 1} title="Remove answer">✕</button>
        </div>
      ))}
      {opts.length < 5 ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={add} style={{ width: '100%', justifyContent: 'center' }}>+ Add answer</button>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>Maximum of 5 answers</div>
      )}
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--hairline)', cursor: 'pointer' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span onClick={() => onChange(!checked)} style={{ width: 38, height: 22, borderRadius: 99, background: checked ? '#5b4fd6' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
      </span>
    </label>
  );
}

// Inline "in-canvas" editor rendered directly under an expanded step row:
// title, description, type-specific config, and the field list. Behavior
// settings (required/skip/notify/reminders) live in StepSettingsPanel on
// the right instead, so they're always visible without scrolling.
function StepFieldsEditor({ draft, patch, dirty, saving, onPublish }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 4 }}>Step title</label>
      <input value={draft.title} onChange={e => patch({ title: e.target.value })}
        placeholder="Untitled step" style={{ fontSize: 15, fontWeight: 800, width: '100%', marginBottom: 10 }} />
      <textarea value={draft.description} onChange={e => patch({ description: e.target.value })} rows={2}
        placeholder="What this step is for…" style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12 }} />

      {draft.step_type === 'Sign' && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>DocuSeal</div>
          <input value={draft.docuseal_template_id} onChange={e => patch({ docuseal_template_id: e.target.value })} placeholder="Template ID" style={{ fontSize: 12.5, marginBottom: 8 }} />
          <select value={draft.docuseal_trigger} onChange={e => patch({ docuseal_trigger: e.target.value })} style={{ fontSize: 12.5 }}>
            <option value="assignment">Send on journey assignment</option>
            <option value="completion">Send when step is checked off</option>
          </select>
        </div>
      )}

      {draft.step_type === 'Book' && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Booking link</div>
          <input value={draft.booking_url} onChange={e => patch({ booking_url: e.target.value })} placeholder="https://calendly.com/…" style={{ fontSize: 12.5 }} />
        </div>
      )}

      {draft.step_type === 'BGCheck' && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>MinistrySafe</div>
          <select value={draft.ministrysafe_level} onChange={e => patch({ ministrysafe_level: Number(e.target.value) })} style={{ fontSize: 12.5, marginBottom: 8 }}>
            {MINISTRYSAFE_LEVELS.map(l => <option key={l.level} value={l.level}>{l.label}</option>)}
          </select>
          <input value={draft.ministrysafe_package_code} onChange={e => patch({ ministrysafe_package_code: e.target.value })} placeholder="Or a custom package code (overrides level)" style={{ fontSize: 12.5 }} />
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
            The client submits their info directly to MinistrySafe — no sensitive details (SSN, DOB, etc.) ever pass through this app. You'll review results and mark the step cleared from their Person page.
          </div>
        </div>
      )}

      {(draft.step_type === 'Form' || draft.step_type === 'Upload' || draft.step_type === 'Learn' || draft.step_type === 'Check') && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>In this step</div>
          <FieldList fields={draft.fields} setFields={fs => patch({ fields: fs })}
            allowedTypes={draft.step_type === 'Upload' ? ['Upload'] : draft.step_type === 'Learn' ? ['Video', 'Yes / No', 'Checkbox'] : draft.step_type === 'Check' ? ['Multiple choice'] : FIELD_TYPES.filter(t => t !== 'Upload')}
            addLabel={draft.step_type === 'Upload' ? '+ Add file to request' : draft.step_type === 'Learn' ? '+ Add video' : draft.step_type === 'Check' ? '+ Add question' : '+ Add field'} />
        </div>
      )}

      <button className="btn btn-primary" disabled={!dirty || saving} onClick={onPublish} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
        {saving ? 'Publishing…' : dirty ? 'Publish changes' : 'Published ✓'}
      </button>
    </div>
  );
}

// Right-hand panel: behavior toggles, reminder cadence, and the publish
// button for whichever step is currently expanded in the canvas.
function StepSettingsPanel({ stepNumber, draft, patch, dirty, saving, onPublish }) {
  const meta = stepMeta(draft.step_type);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>Step settings</div>
        <span className="flat-badge flat-badge-purple">Step {stepNumber}</span>
      </div>

      <div>
        <Toggle label="Required to continue" sub="Blocks later steps until done" checked={draft.required_to_continue} onChange={v => patch({ required_to_continue: v })} />
        <Toggle label="Allow skip for now" sub="They can come back to it" checked={draft.allow_skip} onChange={v => patch({ allow_skip: v })} />
        <Toggle label="Notify a staff reviewer" sub="Sends to the intake inbox" checked={draft.notify_reviewer} onChange={v => patch({ notify_reviewer: v })} />
        <Toggle label="Auto-advance on pass" sub="No manual approval needed" checked={draft.auto_advance} onChange={v => patch({ auto_advance: v })} />
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 8 }}>Reminder cadence</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['off', 'Off'], ['3days', 'Every 3 days'], ['weekly', 'Weekly']].map(([v, l]) => (
            <button key={v} type="button" className={`flat-tab ${draft.reminder_cadence === v ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => patch({ reminder_cadence: v })}>{l}</button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" disabled={!dirty || saving} onClick={onPublish} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
        {saving ? 'Publishing…' : dirty ? 'Publish changes' : 'Published ✓'}
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>{meta.blurb}</div>
    </div>
  );
}
