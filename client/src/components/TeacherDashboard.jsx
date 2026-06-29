import { useEffect, useState } from 'react';
import { api, API_URL } from '../api';

export default function TeacherDashboard({ session, onLogout }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState(['', '']);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // AI Assistant states
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiError, setAiError] = useState('');

  async function handleGenerateAIQuestions(e) {
    e.preventDefault();
    if (!aiTopic.trim()) return setAiError('Enter a topic for the AI to generate questions.');
    setGenerating(true);
    setAiError('');
    setAiQuestions([]);
    try {
      const data = await api.generateQuestions(session.token, aiTopic.trim(), aiCount);
      setAiQuestions(data.questions);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function addGeneratedQuestion(qText) {
    setDraftQuestions((prev) => {
      // Find if there's any empty draft row we can replace
      const emptyIdx = prev.findIndex((q) => !q.trim());
      if (emptyIdx !== -1) {
        return prev.map((q, idx) => (idx === emptyIdx ? qText : q));
      } else {
        return [...prev, qText];
      }
    });
  }

  async function loadQuizzes() {
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
  }

  useEffect(() => {
    loadQuizzes();
  }, []);

  function updateDraft(i, value) {
    setDraftQuestions((prev) => prev.map((q, idx) => (idx === i ? value : q)));
  }

  function addDraftRow() {
    setDraftQuestions((prev) => [...prev, '']);
  }

  function removeDraftRow(i) {
    setDraftQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreateQuiz(e) {
    e.preventDefault();
    setCreateMsg('');
    setError('');
    const cleanQuestions = draftQuestions.map((q) => q.trim()).filter(Boolean);
    if (!title.trim()) return setError('Give this week\'s quiz a title.');
    if (cleanQuestions.length === 0) return setError('Add at least one question.');

    setCreating(true);
    try {
      await api.createQuiz(session.token, title.trim(), cleanQuestions.map((text) => ({ text })));
      setCreateMsg(`"${title.trim()}" is now live for students.`);
      setTitle('');
      setDraftQuestions(['', '']);
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

  return (
    <div className="app-shell">
      <div className="sheet sheet--wide">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Teacher dashboard</p>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5 }}>{session.email}</p>
          </div>
          <button className="signout-link" onClick={onLogout}>Sign out</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {!selectedQuiz ? (
          <>
            <div className="dash-section">
              <p className="section-label">Post this week's quiz</p>
              {createMsg && (
                <div className="banner-locked" style={{ background: '#DCFCE7', borderColor: '#BBF7D0', color: '#166534', marginBottom: 18 }}>
                  {createMsg}
                </div>
              )}
              <div className="quiz-creator-layout">
                <div className="quiz-creator-main">
                  <form onSubmit={handleCreateQuiz}>
                    <div className="field">
                      <label htmlFor="title">Quiz title</label>
                      <input
                        id="title"
                        type="text"
                        placeholder="e.g. Week 6 — Data Structures"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Questions</label>
                      {draftQuestions.map((q, i) => (
                        <div className="q-draft-row" key={i}>
                          <input
                            type="text"
                            placeholder={`Question ${i + 1}`}
                            value={q}
                            onChange={(e) => updateDraft(i, e.target.value)}
                          />
                          {draftQuestions.length > 1 && (
                            <button type="button" className="remove-btn" onClick={() => removeDraftRow(i)} aria-label="Remove question">
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={addDraftRow} style={{ marginTop: 4 }}>
                        + Add another question
                      </button>
                    </div>
                    <button className="btn btn-primary" disabled={creating}>
                      {creating ? <span className="spinner" /> : 'Post quiz to all students'}
                    </button>
                    <p className="hint-msg">
                      Posting a new quiz replaces the current one — students will see this set instead.
                      Each student gets the same questions in a different order.
                    </p>
                  </form>
                </div>

                <div className="quiz-creator-ai">
                  <p className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', margin: 0 }}>
                    <span style={{ fontSize: '14px' }}>✨</span> AI Quiz Assistant
                  </p>
                  <p className="quiz-card-meta" style={{ marginTop: 4, marginBottom: 16 }}>
                    Generate educational questions using Gemini AI to populate your quiz.
                  </p>

                  {aiError && <div className="error-msg">{aiError}</div>}

                  <form onSubmit={handleGenerateAIQuestions}>
                    <div className="field">
                      <label htmlFor="aiTopic">Topic / Concept</label>
                      <input
                        id="aiTopic"
                        type="text"
                        placeholder="e.g. JavaScript Arrays, React Lifecycle"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        style={{ padding: '10px 12px', fontSize: '14px' }}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="aiCount">Number of Questions</label>
                      <select
                        id="aiCount"
                        value={aiCount}
                        onChange={(e) => setAiCount(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1.5px solid var(--rule)',
                          borderRadius: '5px',
                          background: 'white',
                          fontFamily: 'var(--font-body)'
                        }}
                      >
                        {[3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <option key={num} value={num}>{num} questions</option>
                        ))}
                      </select>
                    </div>

                    <button type="submit" className="btn btn-ghost btn-sm" style={{ width: '100%', display: 'flex', gap: '8px' }} disabled={generating}>
                      {generating ? (
                        <>
                          <span className="spinner" style={{ borderTopColor: 'var(--accent)', width: 14, height: 14, borderWidth: 2 }} /> Generating...
                        </>
                      ) : 'Generate with Gemini'}
                    </button>
                  </form>

                  {aiQuestions.length > 0 && (
                    <div className="ai-results" style={{ marginTop: 20 }}>
                      <p className="section-label">Generated ({aiQuestions.length})</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {aiQuestions.map((qText, idx) => (
                          <div key={idx} className="ai-question-card" style={{
                            background: 'white',
                            border: '1px solid var(--rule)',
                            borderRadius: '5px',
                            padding: '10px 12px',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            <span>{qText}</span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: '11px', gap: '4px' }}
                              onClick={() => addGeneratedQuestion(qText)}
                            >
                              + Add to draft
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="dash-section">
              <p className="section-label">Past quizzes</p>
              {loading && <p className="empty-state">Loading…</p>}
              {!loading && quizzes.length === 0 && (
                <p className="empty-state">No quizzes posted yet.</p>
              )}
              {!loading && quizzes.map((q) => (
                <div className="quiz-card" key={q.id}>
                  <div>
                    <p className="quiz-card-title">
                      {q.title} {q.isActive && <span className="badge">Live</span>}
                    </p>
                    <p className="quiz-card-meta">
                      {q.questions.length} question{q.questions.length !== 1 ? 's' : ''} ·{' '}
                      {new Date(q.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => viewAttempts(q)}>
                    View responses
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="dash-section">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedQuiz(null)} style={{ marginBottom: 18 }}>
              ← Back to all quizzes
            </button>
            <p className="section-label">{selectedQuiz.title} — responses</p>

            {attemptsLoading && <p className="empty-state">Loading responses…</p>}

            {!attemptsLoading && attempts.length === 0 && (
              <p className="empty-state">No students have started this quiz yet.</p>
            )}

            {!attemptsLoading && attempts.length > 0 && (
              <>
                <a
                  href={api.exportUrl(selectedQuiz.id, session.token)}
                  className="btn btn-primary"
                  style={{ width: 'auto', display: 'inline-flex', marginBottom: 18, textDecoration: 'none' }}
                >
                  Download as Excel
                </a>
                <div className="table-wrap">
                  <table className="responses">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Screen changes</th>
                        <th>Submitted</th>
                        {selectedQuiz.questions.map((q, i) => (
                          <th key={q.id}>Q{i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.studentName}</strong><br />
                            <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>{a.studentEmail}</span>
                          </td>
                          <td>
                            <span className={`status-pill status-${a.status}`}>
                              {a.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td>{a.tabSwitchCount}</td>
                          <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td>
                          {selectedQuiz.questions.map((q) => (
                            <td key={q.id}>{a.answers[q.id] || <span style={{ color: 'var(--rule)' }}>—</span>}</td>
                          ))}
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
