const { Resend } = require('resend');
// Only instantiate the client when a key is configured — the constructor
// throws otherwise, which would crash the whole server at require-time for
// anyone running locally without email set up.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'onboarding@yourdomain.com';
const CLIENT_URL = process.env.CLIENT_PORTAL_URL || 'http://localhost:5174';
const ADMIN_URL = process.env.ADMIN_PORTAL_URL || 'http://localhost:5173';

async function sendWelcomeEmail({ to, name, journeyName }) {
  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({
    from: FROM, to,
    subject: `Your onboarding journey is ready`,
    html: `<p>Hi ${name},</p><p>Your onboarding journey <strong>${journeyName}</strong> is ready.</p><p><a href="${CLIENT_URL}/login">Log in to get started →</a></p>`,
  });
}

async function sendCompletionEmail({ to, name, journeyName }) {
  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({
    from: FROM, to,
    subject: `You've completed your onboarding! 🎉`,
    html: `<p>Hi ${name},</p><p>Congratulations — you've completed <strong>${journeyName}</strong>! Your team will be in touch shortly.</p>`,
  });
}

// Invite emails degrade gracefully: if RESEND_API_KEY isn't set (e.g. running
// the prototype locally without email configured), the send is skipped and
// the caller still has the invite link to share directly — the admin portal
// always displays/copies the link regardless of whether email went out.
async function sendAdminInviteEmail({ to, businessName, invitedByName, link }) {
  if (!process.env.RESEND_API_KEY) { console.log(`[email] (dev) admin invite link for ${to}: ${link}`); return; }
  await resend.emails.send({
    from: FROM, to,
    subject: `${invitedByName} invited you to join ${businessName} on Onboarding CRM`,
    html: `<p>Hi,</p><p><strong>${invitedByName}</strong> invited you to join <strong>${businessName}</strong> as an admin.</p><p><a href="${link}">Accept invite →</a></p><p>This link expires in 7 days.</p>`,
  });
}

async function sendClientInviteEmail({ to, businessName, link }) {
  if (!process.env.RESEND_API_KEY) { console.log(`[email] (dev) client invite link for ${to}: ${link}`); return; }
  await resend.emails.send({
    from: FROM, to,
    subject: `You've been invited to onboard with ${businessName}`,
    html: `<p>Hi,</p><p><strong>${businessName}</strong> has invited you to get started.</p><p><a href="${link}">Set up your account →</a></p><p>This link expires in 7 days.</p>`,
  });
}

async function sendWeeklyDigestEmail({ to, businessName, inProgressCount, completedThisWeek, stalledNames }) {
  if (!process.env.RESEND_API_KEY) { console.log(`[email] (dev) weekly digest for ${to} skipped — RESEND_API_KEY not set`); return; }
  const stalledHtml = stalledNames.length
    ? `<p><strong>No activity in 7+ days:</strong> ${stalledNames.join(', ')}</p>`
    : '';
  await resend.emails.send({
    from: FROM, to,
    subject: `Your weekly onboarding digest — ${businessName}`,
    html: `<p>Hi,</p><p>Here's what happened this week at <strong>${businessName}</strong>:</p>
      <ul>
        <li>${inProgressCount} people currently in progress</li>
        <li>${completedThisWeek} completed a journey this week</li>
      </ul>
      ${stalledHtml}`,
  });
}

async function sendReviewerNotification({ to, clientName, taskTitle, journeyName }) {
  if (!process.env.RESEND_API_KEY) { console.log(`[email] (dev) reviewer notification for ${to} skipped — RESEND_API_KEY not set`); return; }
  await resend.emails.send({
    from: FROM, to,
    subject: `${clientName} completed "${taskTitle}"`,
    html: `<p><strong>${clientName}</strong> just completed <strong>${taskTitle}</strong> in <strong>${journeyName}</strong> and flagged it for review.</p>`,
  });
}

async function sendPasswordResetEmail({ to, name, token, role }) {
  const portalUrl = role === 'client' ? CLIENT_URL : ADMIN_URL;
  const link = `${portalUrl}/reset-password?token=${token}`;
  if (!process.env.RESEND_API_KEY) { console.log(`[email] (dev) password reset link for ${to}: ${link}`); return; }
  await resend.emails.send({
    from: FROM, to,
    subject: `Reset your password`,
    html: `<p>Hi ${name || ''},</p><p>We received a request to reset your password. This link expires in 1 hour.</p><p><a href="${link}">Reset your password →</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}

module.exports = { sendWelcomeEmail, sendCompletionEmail, sendAdminInviteEmail, sendClientInviteEmail, sendWeeklyDigestEmail, sendReviewerNotification, sendPasswordResetEmail };
