const BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.easyonboardings.com' : 'http://localhost:4000');
const token = () => localStorage.getItem('crm_token');

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  forgotPassword: (email) => req('POST', '/auth/forgot-password', { email }),
  resetPassword: (token, password) => req('POST', '/auth/reset-password', { token, password }),
  me: () => req('GET', '/auth/me'),
  registerBusiness: (b) => req('POST', '/auth/register-business', b),
  getInvite: (token) => req('GET', `/auth/invites/${token}`),
  acceptInvite: (b) => req('POST', '/auth/accept-invite', b),
  getBusiness: () => req('GET', '/businesses/me'),
  updateBusiness: (b) => req('PUT', '/businesses/me', b),
  getTeam: () => req('GET', '/businesses/team'),
  removeTeamMember: (id) => req('DELETE', `/businesses/team/${id}`),
  getInvites: (role) => req('GET', `/businesses/invites${role ? `?role=${role}` : ''}`),
  createInvite: (b) => req('POST', '/businesses/invites', b),
  resendInvite: (id) => req('POST', `/businesses/invites/${id}/resend`),
  revokeInvite: (id) => req('DELETE', `/businesses/invites/${id}`),
  getJourneys: () => req('GET', '/journeys'),
  getJourney: (id) => req('GET', `/journeys/${id}`),
  createJourney: (b) => req('POST', '/journeys', b),
  updateJourney: (id, b) => req('PUT', `/journeys/${id}`, b),
  deleteJourney: (id) => req('DELETE', `/journeys/${id}`),
  createSection: (jid, b) => req('POST', `/journeys/${jid}/sections`, b),
  updateSection: (jid, sid, b) => req('PUT', `/journeys/${jid}/sections/${sid}`, b),
  deleteSection: (jid, sid) => req('DELETE', `/journeys/${jid}/sections/${sid}`),
  createTask: (jid, sid, b) => req('POST', `/journeys/${jid}/sections/${sid}/tasks`, b),
  updateTask: (jid, sid, tid, b) => req('PUT', `/journeys/${jid}/sections/${sid}/tasks/${tid}`, b),
  deleteTask: (jid, sid, tid) => req('DELETE', `/journeys/${jid}/sections/${sid}/tasks/${tid}`),
  getClients: () => req('GET', '/clients'),
  getClientJourney: (clientId, journeyId) => req('GET', `/clients/${clientId}/journeys/${journeyId}`),
  getClientProfile: (clientId) => req('GET', `/clients/${clientId}/profile`),
  markBackgroundCheckCleared: (clientId, taskId) => req('POST', `/clients/${clientId}/tasks/${taskId}/mark-cleared`),
  getAnalyticsOverview: () => req('GET', '/clients/analytics/overview'),
  assignJourney: (cid, jid) => req('POST', `/clients/${cid}/assign`, { journey_id: jid }),
  unassignJourney: (cid, jid) => req('DELETE', `/clients/${cid}/assign/${jid}`),
  getWebhooks: () => req('GET', '/webhooks'),
  getWebhookEvents: () => req('GET', '/webhooks/events'),
  createWebhook: (b) => req('POST', '/webhooks', b),
  updateWebhook: (id, b) => req('PUT', `/webhooks/${id}`, b),
  deleteWebhook: (id) => req('DELETE', `/webhooks/${id}`),
  testWebhook: (id) => req('POST', `/webhooks/${id}/test`),
  getDeliveries: (id) => req('GET', `/webhooks/${id}/deliveries`),
};
