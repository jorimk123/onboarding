const BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.easyonboardings.com' : 'http://localhost:4000');
const token = () => localStorage.getItem('crm_client_token');
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
  getInvite: (token) => req('GET', `/auth/invites/${token}`),
  acceptInvite: (b) => req('POST', '/auth/accept-invite', b),
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  me: () => req('GET', '/auth/me'),
  getJourneys: () => req('GET', '/journeys'),
  getJourney: (id) => req('GET', `/journeys/${id}`),
  completeTask: (taskId) => req('POST', `/progress/tasks/${taskId}/complete`),
  uncompleteTask: (taskId) => req('DELETE', `/progress/tasks/${taskId}/complete`),
};
