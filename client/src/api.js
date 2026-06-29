// api.js
// Small helper around fetch() for talking to the backend.
// Set VITE_API_URL in client/.env to point at your deployed backend,
// e.g. VITE_API_URL=https://your-quiz-backend.onrender.com

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  requestOtp: (email, role) => request('/api/otp/request', { method: 'POST', body: { email, role } }),
  verifyOtp: (email, role, code, name) =>
    request('/api/otp/verify', { method: 'POST', body: { email, role, code, name } }),

  // student
  getActiveQuiz: (token) => request('/api/student/quiz/active', { token }),
  saveAnswer: (token, quizId, questionId, answer) =>
    request(`/api/student/quiz/${quizId}/answer`, { method: 'POST', token, body: { questionId, answer } }),
  reportTabSwitch: (token, quizId) =>
    request(`/api/student/quiz/${quizId}/tab-switch`, { method: 'POST', token }),
  submitQuiz: (token, quizId) =>
    request(`/api/student/quiz/${quizId}/submit`, { method: 'POST', token }),

  // teacher
  createQuiz: (token, title, questions) =>
    request('/api/teacher/quiz', { method: 'POST', token, body: { title, questions } }),
  listQuizzes: (token) => request('/api/teacher/quiz', { token }),
  getAttempts: (token, quizId) => request(`/api/teacher/quiz/${quizId}/attempts`, { token }),
  exportUrl: (quizId, token) => `${API_URL}/api/teacher/quiz/${quizId}/export?token=${token}`,
  generateQuestions: (token, topic, count) =>
    request('/api/teacher/generate-questions', { method: 'POST', token, body: { topic, count } }),
};

export { API_URL };
