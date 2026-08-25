// One-time, idempotent seed for a "Mentor Onboarding" journey, built from
// the user's existing mentor application flow (general info, reference
// checks, training videos, quiz, terms & conditions). Safe to run on every
// deploy: it no-ops if a journey with this name already exists for the
// target business, or if the business can't be determined unambiguously.
//
// Called from migrate.js after schema.sql is applied. Exported as a
// function so it can also be invoked directly: `node scripts/seed-mentor-journey.js`.

const uid = (n) => `f${n}_${Math.random().toString(36).slice(2, 8)}`;
const field = (n, label, type, extra = {}) => ({ id: uid(n), label, type, required: true, ...extra });
const mc = (n, label, options) => field(n, label, 'Multiple choice', { options });

async function seedMentorJourney(pool) {
  const { rows: businesses } = await pool.query('SELECT id, name FROM businesses ORDER BY created_at ASC');
  if (businesses.length === 0) {
    console.log('[seed-mentor-journey] no businesses exist yet — skipping');
    return;
  }
  if (businesses.length > 1) {
    console.log(`[seed-mentor-journey] ${businesses.length} businesses exist — skipping auto-seed to avoid guessing which one. ` +
      `Businesses: ${businesses.map(b => `${b.name} (${b.id})`).join(', ')}. Run manually with a specific business_id if needed.`);
    return;
  }
  const business = businesses[0];

  const { rows: existing } = await pool.query(
    `SELECT id FROM journeys WHERE business_id=$1 AND name=$2`,
    [business.id, 'Mentor Onboarding']
  );
  if (existing.length) {
    console.log(`[seed-mentor-journey] "Mentor Onboarding" already exists for ${business.name} — skipping`);
    return;
  }

  console.log(`[seed-mentor-journey] creating "Mentor Onboarding" journey for ${business.name}...`);

  const { rows: [journey] } = await pool.query(
    `INSERT INTO journeys (business_id, name, description, category) VALUES ($1,$2,$3,$4) RETURNING id`,
    [business.id, 'Mentor Onboarding', 'Application, reference checks, training and quiz for new campus club mentors.', 'Mentors']
  );

  const { rows: [section] } = await pool.query(
    `INSERT INTO sections (journey_id, title, position) VALUES ($1,$2,$3) RETURNING id`,
    [journey.id, 'Steps', 0]
  );

  const insertTask = async (position, opts) => {
    await pool.query(
      `INSERT INTO tasks (section_id, title, description, position, step_type, fields, docuseal_trigger,
                           required_to_continue, allow_skip, notify_reviewer, auto_advance, reminder_cadence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        section.id, opts.title, opts.description || null, position, opts.step_type,
        JSON.stringify(opts.fields || []), opts.docuseal_trigger || 'assignment',
        opts.required_to_continue !== false, !!opts.allow_skip, !!opts.notify_reviewer,
        opts.auto_advance !== false, opts.reminder_cadence || 'off',
      ]
    );
  };

  // Step 1 — General Info
  await insertTask(0, {
    title: 'General Info',
    step_type: 'Form',
    fields: [
      field(1, 'First Name', 'Short text'),
      field(2, 'Last Name', 'Short text'),
      field(3, 'Email', 'Email'),
      field(4, 'Phone', 'Phone'),
      field(5, 'City, State', 'Short text'),
      field(6, 'Interested School', 'Short text'),
      field(7, 'Church You Attend', 'Short text'),
    ],
  });

  // Step 2 — Reference Checks
  await insertTask(1, {
    title: 'Reference Checks',
    description: 'Please provide the following information. We will send a reference check form to be completed on your behalf.',
    step_type: 'Form',
    notify_reviewer: true,
    fields: [
      field(10, "Pastoral Reference — Church", 'Short text'),
      field(11, "Pastoral Reference — Pastor's Name", 'Short text'),
      field(12, "Pastoral Reference — Pastor's Contact Number", 'Phone'),
      field(13, "Pastoral Reference — Pastor's Email", 'Email'),
      field(14, 'Professional Reference — Company / Organization', 'Short text'),
      field(15, 'Professional Reference — Leader Full Name', 'Short text'),
      field(16, 'Professional Reference — Contact Number', 'Phone'),
      field(17, 'Professional Reference — Email', 'Email'),
      field(18, "Family Reference — Family Member's Full Name", 'Short text'),
      field(19, 'Family Reference — Contact Number', 'Phone'),
      field(20, 'Family Reference — Email', 'Email'),
      field(21, 'Family Reference — Relationship To Reference', 'Short text'),
    ],
  });

  // Step 3 — Mentor Training (videos)
  await insertTask(2, {
    title: 'Mentor Training',
    step_type: 'Learn',
    reminder_cadence: '3days',
    fields: [
      field(30, 'Mentor Training: Part One', 'Video', { url: '' }),
      field(31, 'Mentor Training: Part Two', 'Video', { url: '' }),
      field(32, 'Mentor Training: Part Three', 'Video', { url: '' }),
      field(33, 'Mentor Training: Part Four', 'Video', { url: '' }),
    ],
  });

  // Step 4 — Mentor Quiz
  await insertTask(3, {
    title: 'Mentor Quiz',
    step_type: 'Check',
    reminder_cadence: '3days',
    fields: [
      mc(40, 'Our motto is "Change the ______, Change the Culture".', ['Student', 'Campus', 'Club', 'World']),
      mc(41, 'Statistically, over ______ of young people make a commitment to Christ by the age of 14.', ['10%', '50%', '90%', '80%']),
      mc(42, 'Next Gen Clubs are student-led, ______-supported gatherings on junior and senior high school campuses.', ['Mentor', 'Teacher', 'School', 'Church']),
      mc(43, 'To start a Next Gen Club, it needs ______ to lead it.', ['Students', 'Parents', 'Mentors', 'Pastors']),
      mc(44, 'One of the most important parts of a Next Gen Club is the ______.', ['Food', 'Games', 'Lesson', 'Music']),
      mc(45, 'If students eat our food or snacks, they must ______.', ['Pay For It', 'Throw It Away', 'Stay For The Club', 'Clean Up The Room']),
      mc(46, 'Mentors cannot set foot on campus without a ______.', ['Background Check', 'Bible', "Driver's License", 'Phone']),
      mc(47, 'Mentors cannot bring ______ on campus.', ['Drugs', 'Guns', 'Bibles', 'All of the above']),
      mc(48, 'If a student shares sensitive/alarming information, always share it with the ______.', ['Principal', 'Students', 'Guidance Counselor', 'Mentor Team']),
      mc(49, 'Next Gen exists to empower ______ to impact their schools through campus clubs to reach their generation for Jesus Christ.', ['Parents', 'Students', 'Teachers', 'Churches']),
    ],
  });

  // Step 5 — Terms & Conditions
  await insertTask(4, {
    title: 'Terms & Conditions',
    description: 'Review and sign the mentor terms and conditions document.',
    step_type: 'Sign',
    docuseal_trigger: 'completion',
    notify_reviewer: true,
  });

  console.log(`[seed-mentor-journey] done — journey ${journey.id} created with 5 steps for ${business.name}`);
}

module.exports = { seedMentorJourney };

if (require.main === module) {
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  seedMentorJourney(pool).catch(err => { console.error('[seed-mentor-journey] failed:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
