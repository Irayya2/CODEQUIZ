import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

const EMPTY_Q = () => ({ text: '', options: ['', '', '', ''] });

export default function TeacherDashboard({ session, onLogout }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [title, setTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState([EMPTY_Q(), EMPTY_Q()]);
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

  function updateDraftText(i, value) {
    setDraftQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, text: value } : q));
  }

  function updateDraftOption(qi, oi, value) {
    setDraftQuestions((prev) => prev.map((q, idx) =>
      idx === qi ? { ...q, options: q.options.map((o, oidx) => oidx === oi ? value : o) } : q
    ));
  }

  function addDraftRow() { setDraftQuestions((prev) => [...prev, EMPTY_Q()]); }

  function removeDraftRow(i) {
    setDraftQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

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

  function getQuestionObj(q) {
    if (typeof q === 'string') return { text: q, options: [] };
    return { text: q?.text ?? '', options: Array.isArray(q?.options) ? q.options : [] };
  }

  function addGeneratedQuestion(q) {
    const obj = getQuestionObj(q);
    const newQ = {
      text: obj.text,
      options: obj.options.length === 4 ? obj.options : ['', '', '', ''],
    };
    setDraftQuestions((prev) => {
      const emptyIdx = prev.findIndex((r) => !r.text.trim());
      if (emptyIdx !== -1) return prev.map((r, idx) => idx === emptyIdx ? newQ : r);
      return [...prev, newQ];
    });
  }

  function addAllGeneratedQuestions() {
    setDraftQuestions((prev) => {
      let result = [...prev];
      for (const q of aiQuestions) {
        const obj = getQuestionObj(q);
        const newQ = {
          text: obj.text,
          options: obj.options.length === 4 ? obj.options : ['', '', '', ''],
        };
        const emptyIdx = result.findIndex((r) => !r.text.trim());
        if (emptyIdx !== -1) result = result.map((r, idx) => idx === emptyIdx ? newQ : r);
        else result = [...result, newQ];
      }
      return result;
    });
    setAddedAll(true);
  }

  async function handleCreateQuiz(e) {
    e.preventDefault();
    setError('');
    const cleanQuestions = draftQuestions
      .filter((q) => q.text.trim())
      .map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
      }));
    if (!title.trim()) return setError('Give this quiz a title.');
    if (cleanQuestions.length === 0) return setError('Add at least one question.');
    const missingOptions = cleanQuestions.filter((q) => q.options.length < 2);
    if (missingOptions.length > 0) {
      return setError(`Add at least 2 options for: "${missingOptions[0].text.slice(0, 60)}…"`);
    }
    setCreating(true);
    try {
      await api.createQuiz(session.token, title.trim(), cleanQuestions);
      showSuccess(`"${title.trim()}" is now live for students! 🎉`);
      setTitle('');
      setDraftQuestions([EMPTY_Q(), EMPTY_Q()]);
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
  const filledCount = draftQuestions.filter((q) => q.text.trim()).length;

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

      <div style={{ flex: 1, maxWidth: 1020, width: '100%', margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{quizzes.length}</div>
            <div className="stat-label">Total quizzes</div>
          </div>
          <div className="stat-card" style={{ borderColor: activeQuiz ? 'rgba(99,102,241,0.35)' : undefined }}>
            <div className="stat-value" style={{ fontSize: activeQuiz ? 18 : undefined, color: activeQuiz ? 'var(--accent-bright)' : undefined }}>
              {activeQuiz ? '● Live' : '—'}
            </div>
            <div className="stat-label">Active quiz</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{filledCount}</div>
            <div className="stat-label">Draft questions</div>
          </div>
        </div>

        {error && <div className="error-msg">⚠ {error}</div>}
        {successMsg && <div className="success-msg">✅ {successMsg}</div>}

        {!selectedQuiz ? (
          <>
            {/* ── Quiz creator ── */}
            <div className="card" style={{ padding: 0, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div className="section-title">
                  <span className="icon">📝</span>
                  Post this week's quiz
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8 }}>
                  All questions are MCQ with 4 choices. Posting replaces the current live quiz.
                </p>
              </div>

              <div className="dash-grid" style={{ padding: '24px', gap: 32 }}>

                {/* Left — manual builder */}
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

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 12 }}>
                        Questions ({filledCount} added)
                      </label>

                      {draftQuestions.map((q, qi) => (
                        <div
                          key={qi}
                          style={{
                            marginBottom: 16,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: '14px 14px 12px',
                          }}
                        >
                          {/* Question text row */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                            <span className="q-num" style={{ paddingTop: 10 }}>{qi + 1}</span>
                            <input
                              type="text"
                              placeholder={`Question ${qi + 1}`}
                              value={q.text}
                              onChange={(e) => updateDraftText(qi, e.target.value)}
                              style={{
                                flex: 1,
                                fontSize: 14,
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1.5px solid var(--border)',
                                borderRadius: 8,
                                color: 'var(--text)',
                              }}
                            />
                            {draftQuestions.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-danger btn-icon"
                                onClick={() => removeDraftRow(qi)}
                                title="Remove question"
                                style={{ fontSize: 16, marginTop: 2 }}
                              >
                                ×
                              </button>
                            )}
                          </div>

                          {/* 4 option inputs in 2×2 grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingLeft: 36 }}>
                            {['A', 'B', 'C', 'D'].map((letter, oi) => (
                              <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  width: 22, height: 22, borderRadius: 6,
                                  background: 'rgba(99,102,241,0.15)',
                                  border: '1px solid rgba(99,102,241,0.3)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 10, fontWeight: 700, color: 'var(--accent-bright)',
                                  flexShrink: 0,
                                }}>
                                  {letter}
                                </span>
                                <input
                                  type="text"
                                  placeholder={`Option ${letter}`}
                                  value={q.options[oi]}
                                  onChange={(e) => updateDraftOption(qi, oi, e.target.value)}
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    padding: '7px 10px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                    color: 'var(--text)',
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <button type="button" className="btn btn-ghost btn-sm" onClick={addDraftRow} style={{ marginTop: 2 }}>
                        + Add question
                      </button>
                    </div>

                    <button className="btn btn-primary" type="submit" disabled={creating}>
                      {creating ? <><span className="spinner" /> Publishing…</> : '🚀 Post quiz to all students'}
                    </button>
                  </form>
                </div>

                {/* Right — AI panel */}
                <div className="ai-panel">
                  <div className="ai-badge">✨ AI Assistant</div>
                  <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 16, lineHeight: 1.5 }}>
                    Generate MCQ questions instantly with Gemini AI — then add them to your draft.
                  </p>

                  {aiError && <div className="error-msg">⚠ {aiError}</div>}

                  <form onSubmit={handleGenerateAIQuestions} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Topic / concept</label>
                      <input
                        type="text"
                        placeholder="e.g. JavaScript Promises"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>How many questions</label>
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

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
                        {aiQuestions.map((q, idx) => {
                          const obj = getQuestionObj(q);
                          return (
                            <div key={idx} className="ai-question-card" style={{ animationDelay: `${idx * 0.04}s`, flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <span className="ai-question-text" style={{ fontWeight: 500, color: 'var(--text)' }}>
                                  {idx + 1}. {obj.text}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                                  onClick={() => addGeneratedQuestion(q)}
                                >
                                  + Add
                                </button>
                              </div>
                              {obj.options.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, paddingLeft: 2 }}>
                                  {obj.options.map((opt, oi) => (
                                    <span key={oi} style={{ fontSize: 11.5, color: 'var(--text-soft)', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--accent-bright)', flexShrink: 0 }}>
                                        {'ABCD'[oi]}.
                                      </span>
                                      {opt}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Past quizzes ── */}
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
          /* ── Responses view ── */
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedQuiz(null)}>← Back</button>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-soft)', flexWrap: 'wrap' }}>
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
