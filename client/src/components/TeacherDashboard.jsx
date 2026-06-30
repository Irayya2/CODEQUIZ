import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

export default function TeacherDashboard({ session, onLogout }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [title, setTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState(['', '']);
  const [creating, setCreating] = useState(false);

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiError, setAiError] = useState('');
  const [addedAll, setAddedAll] = useState(false);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  async function handleGenerateAIQuestions(e) {
    e.preventDefault();
    if (!aiTopic.trim()) return setAiError('Enter a topic first.');
    setGenerating(true);
    setAiError('');
    setAiQuestions([]);
    setAddedAll(false);
    try {
      const data = await api.generateQuestions(session.token, aiTopic.trim(), aiCount);
      setAiQuestions(data.questions);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function getQuestionText(q) {
    return typeof q === 'string' ? q : q?.text ?? '';
  }

  function addGeneratedQuestion(q) {
    const text = getQuestionText(q);
    setDraftQuestions((prev) => {
      const emptyIdx = prev.findIndex((r) => !r.trim());
      if (emptyIdx !== -1) return prev.map((r, idx) => (idx === emptyIdx ? text : r));
      return [...prev, text];
    });
  }

  function addAllGeneratedQuestions() {
    setDraftQuestions((prev) => {
      let result = [...prev];
      for (const q of aiQuestions) {
        const text = getQuestionText(q);
        const emptyIdx = result.findIndex((r) => !r.trim());
        if (emptyIdx !== -1) result = result.map((r, idx) => (idx === emptyIdx ? text : r));
        else result = [...result, text];
      }
      return result;
    });
    setAddedAll(true);
  }

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listQuizzes(session.token);
      setQuizzes(data.quizSets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => { loadQuizzes(); }, [loadQuizzes]);

  function updateDraft(i, value) {
    setDraftQuestions((prev) => prev.map((q, idx) => (idx === i ? value : q)));
  }

  function addDraftRow() { setDraftQuestions((prev) => [...prev, '']); }

  function removeDraftRow(i) {
    setDraftQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreateQuiz(e) {
    e.preventDefault();
    setError('');
    const cleanQuestions = draftQuestions.map((q) => q.trim()).filter(Boolean);
    if (!title.trim()) return setError('Give this quiz a title.');
    if (cleanQuestions.length === 0) return setError('Add at least one question.');
    setCreating(true);
    try {
      await api.createQuiz(session.token, title.trim(), cleanQuestions.map((text) => ({ text })));
      showSuccess(`"${title.trim()}" is now live for students! 🎉`);
      setTitle('');
      setDraftQuestions(['', '']);
      setAiQuestions([]);
      loadQuizzes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function viewAttempts(quiz) {
    setSelectedQuiz(quiz);
    setAttemptsLoading(true);
    setError('');
    try {
      const data = await api.getAttempts(session.token, quiz.id);
      setAttempts(data.attempts);
    } catch (err) {
      setError(err.message);
    } finally {
      setAttemptsLoading(false);
    }
  }

  async function handleResetAttempt(studentId) {
    try {
      await api.resetAttempt(session.token, selectedQuiz.id, studentId);
      const data = await api.getAttempts(session.token, selectedQuiz.id);
      setAttempts(data.attempts);
    } catch (err) {
      setError(err.message);
    }
  }

  const initials = session.email ? session.email[0].toUpperCase() : 'T';
  const activeQuiz = quizzes.find((q) => q.isActive);
  const totalResponses = quizzes.reduce((sum, q) => sum + (q.questions?.length || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse 800px 500px at 60% -120px, rgba(99,102,241,0.16), transparent), var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-user">
          <div className="avatar">{initials}</div>
          <div>
            <div className="top-bar-role">Teacher dashboard</div>
            <div className="top-bar-email">{session.email}</div>
          </div>
        </div>
        <button className="signout-link" onClick={onLogout}>Sign out</button>
      </div>

      <div style={{ flex: 1, maxWidth: 1000, width: '100%', margin: '0 auto', padding: '24px 24px 40px' }}>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{quizzes.length}</div>
            <div className="stat-label">Total quizzes</div>
          </div>
          <div className="stat-card" style={{ borderColor: activeQuiz ? 'rgba(99,102,241,0.3)' : undefined }}>
            <div className="stat-value" style={{ color: activeQuiz ? 'var(--accent-bright)' : undefined }}>
              {activeQuiz ? '● Live' : '—'}
            </div>
            <div className="stat-label">Active quiz</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalResponses}</div>
            <div className="stat-label">Total questions</div>
          </div>
        </div>

        {error && <div className="error-msg">⚠ {error}</div>}
        {successMsg && <div className="success-msg">✅ {successMsg}</div>}

        {!selectedQuiz ? (
          <>
            {/* Quiz creator */}
            <div className="card" style={{ padding: 0, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div className="section-title">
                  <span className="icon">📝</span>
                  Post this week's quiz
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8 }}>
                  Posting a new quiz replaces the current one. Each student gets questions in a unique order.
                </p>
              </div>

              <div className="dash-grid" style={{ padding: '24px', gap: 32 }}>
                {/* Left: quiz form */}
                <div>
                  <form onSubmit={handleCreateQuiz}>
                    <div className="field">
                      <label>Quiz title</label>
                      <input
                        type="text"
                        placeholder="e.g. Week 6 — Data Structures"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 10 }}>
                        Questions ({draftQuestions.filter(q => q.trim()).length} added)
                      </label>
                      {draftQuestions.map((q, i) => (
                        <div className="q-draft-row" key={i}>
                          <span className="q-num">{i + 1}</span>
                          <input
                            type="text"
                            placeholder={`Question ${i + 1}`}
                            value={q}
                            onChange={(e) => updateDraft(i, e.target.value)}
                          />
                          {draftQuestions.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-danger btn-icon"
                              onClick={() => removeDraftRow(i)}
                              title="Remove"
                              style={{ fontSize: 16, lineHeight: 1 }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={addDraftRow} style={{ marginTop: 6 }}>
                        + Add question
                      </button>
                    </div>

                    <button className="btn btn-primary" type="submit" disabled={creating}>
                      {creating ? <><span className="spinner" /> Publishing…</> : '🚀 Post quiz to all students'}
                    </button>
                  </form>
                </div>

                {/* Right: AI panel */}
                <div className="ai-panel">
                  <div className="ai-badge">✨ AI Assistant</div>
                  <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 16, lineHeight: 1.5 }}>
                    Generate MCQ questions instantly with Gemini AI — then add them to your quiz.
                  </p>

                  {aiError && <div className="error-msg">⚠ {aiError}</div>}

                  <form onSubmit={handleGenerateAIQuestions} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Topic / concept</label>
                      <input
                        type="text"
                        placeholder="e.g. JavaScript Arrays, React Hooks"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Number of questions</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={aiCount}
                        onChange={(e) => setAiCount(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                    <button type="submit" className="btn btn-ghost" disabled={generating} style={{ marginTop: 2 }}>
                      {generating
                        ? <><span className="spinner spinner-dark" style={{ width: 14, height: 14, borderWidth: 2 }} /> Generating…</>
                        : '✨ Generate with Gemini'}
                    </button>
                  </form>

                  {aiQuestions.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                          {aiQuestions.length} generated
                        </span>
                        <button
                          type="button"
                          className={`btn btn-sm ${addedAll ? 'btn-ghost' : 'btn-primary'}`}
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={addAllGeneratedQuestions}
                          disabled={addedAll}
                        >
                          {addedAll ? '✓ All added' : '+ Add all to draft'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
                        {aiQuestions.map((q, idx) => (
                          <div key={idx} className="ai-question-card" style={{ animationDelay: `${idx * 0.04}s` }}>
                            <span className="ai-question-text">{idx + 1}. {getQuestionText(q)}</span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0, whiteSpace: 'nowrap' }}
                              onClick={() => addGeneratedQuestion(q)}
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Past quizzes */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <div className="section-title" style={{ marginBottom: 16 }}>
                <span className="icon">📚</span>
                Past quizzes
              </div>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '12px 0' }}>
                  <span className="spinner spinner-dark" style={{ width: 16, height: 16, borderWidth: 2 }} /> Loading…
                </div>
              )}
              {!loading && quizzes.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  No quizzes posted yet. Create your first one above!
                </div>
              )}
              {!loading && quizzes.map((q) => (
                <div className="quiz-card" key={q.id}>
                  <div>
                    <div className="quiz-card-title">
                      {q.title}
                      {q.isActive && <span className="badge">● Live</span>}
                    </div>
                    <div className="quiz-card-meta">
                      {q.questions.length} question{q.questions.length !== 1 ? 's' : ''} · {new Date(q.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => viewAttempts(q)}>
                    View responses →
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Responses view */
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedQuiz(null)}>
                ← Back
              </button>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{selectedQuiz.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Student responses</div>
              </div>
            </div>

            {attemptsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '16px 0' }}>
                <span className="spinner spinner-dark" style={{ width: 16, height: 16, borderWidth: 2 }} /> Loading responses…
              </div>
            )}

            {!attemptsLoading && attempts.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                No students have started this quiz yet.
              </div>
            )}

            {!attemptsLoading && attempts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-soft)' }}>
                    <span>📊 {attempts.length} student{attempts.length !== 1 ? 's' : ''}</span>
                    <span>✅ {attempts.filter(a => a.status === 'submitted').length} submitted</span>
                    <span>⚠️ {attempts.filter(a => a.status === 'auto_submitted').length} auto-submitted</span>
                  </div>
                  <a
                    href={api.exportUrl(selectedQuiz.id, session.token)}
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    ↓ Download Excel
                  </a>
                </div>

                <div className="table-wrap">
                  <table className="responses">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Switches</th>
                        <th>Submitted</th>
                        {selectedQuiz.questions.map((q, i) => (
                          <th key={q.id}>Q{i + 1}</th>
                        ))}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong style={{ color: 'var(--text)', display: 'block' }}>{a.studentName}</strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{a.studentEmail}</span>
                          </td>
                          <td>
                            <span className={`status-pill status-${a.status}`}>
                              {a.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ color: a.tabSwitchCount >= 3 ? 'var(--danger)' : 'var(--text-soft)' }}>
                            {a.tabSwitchCount}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          {selectedQuiz.questions.map((q) => (
                            <td key={q.id}>
                              {a.answers[q.id] || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          ))}
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={() => handleResetAttempt(a.studentId)}
                              title="Reset this student's attempt"
                            >
                              Reset
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
