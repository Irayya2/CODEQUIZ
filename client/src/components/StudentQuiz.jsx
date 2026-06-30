import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function StudentQuiz({ session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizSet, setQuizSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [toast, setToast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const quizIdRef = useRef(null);
  const statusRef = useRef('in_progress');
  useEffect(() => { statusRef.current = status; }, [status]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  };

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getActiveQuiz(session.token);
      if (!data.quizSet) {
        setQuizSet(null);
      } else {
        setQuizSet(data.quizSet);
        setQuestions(data.questions);
        setAnswers(data.answers || {});
        setTabSwitchCount(data.tabSwitchCount || 0);
        setStatus(data.status);
        quizIdRef.current = data.quizSet.id;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== 'hidden') return;
      if (statusRef.current !== 'in_progress' || !quizIdRef.current) return;
      try {
        const res = await api.reportTabSwitch(session.token, quizIdRef.current);
        setTabSwitchCount(res.tabSwitchCount);
        setStatus(res.status);
        const left = Math.max(0, 3 - res.tabSwitchCount);
        if (res.status === 'auto_submitted') {
          showToast('⛔ Quiz auto-submitted after 3 screen changes.');
        } else {
          showToast(`⚠️ Screen change detected — ${left} warning${left !== 1 ? 's' : ''} left`);
        }
      } catch (err) {
        console.error('Tab switch report failed:', err.message);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session.token]);

  const saveTimers = useRef({});
  function handleAnswerChange(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      api.saveAnswer(session.token, quizSet.id, questionId, value).catch(console.error);
    }, 500);
  }

  function selectOption(questionId, value) {
    handleAnswerChange(questionId, value);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      await api.submitQuiz(session.token, quizSet.id);
      setStatus('submitted');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = status !== 'in_progress';
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const initials = session.email ? session.email[0].toUpperCase() : '?';

  const currentQ = questions[currentIdx];

  return (
    <div className="quiz-shell">
      {/* Toast */}
      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}

      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-user">
          <div className="avatar">{initials}</div>
          <div>
            <div className="top-bar-role">Student</div>
            <div className="top-bar-email">{session.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {quizSet && !isLocked && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {answeredCount}/{questions.length} answered
            </span>
          )}
          <button className="signout-link" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      {/* Progress Bar */}
      {quizSet && !isLocked && (
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Main */}
      <div className="quiz-main">
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: 'var(--text-muted)' }}>
            <div className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <span style={{ fontSize: 14 }}>Loading quiz…</span>
          </div>
        )}

        {!loading && error && (
          <div className="card card--full">
            <div className="error-msg">⚠ {error}</div>
          </div>
        )}

        {!loading && !quizSet && !error && (
          <div className="card" style={{ maxWidth: 480, width: '100%', padding: 0 }}>
            <div className="no-quiz-card">
              <span className="no-quiz-icon">📭</span>
              <div className="no-quiz-title">No quiz right now</div>
              <p className="no-quiz-sub">Your teacher hasn't posted this week's questions yet. Check back soon!</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 20, width: 'auto', padding: '10px 20px' }} onClick={loadQuiz}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {!loading && quizSet && (isLocked ? (
          /* ── Locked state ── */
          <div className="question-card">
            <div className="question-body">
              {status === 'auto_submitted' ? (
                <div className="banner-locked danger">
                  <span className="banner-locked-icon">⛔</span>
                  <strong style={{ fontSize: 18 }}>Quiz auto-submitted</strong>
                  <p>Your answers were automatically submitted after 3 screen changes were detected.</p>
                  <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>If you think this was a mistake, contact your teacher.</p>
                </div>
              ) : (
                <div className="banner-locked success">
                  <span className="banner-locked-icon">✅</span>
                  <strong style={{ fontSize: 18 }}>Submitted!</strong>
                  <p>Your answers are in. You can close this page.</p>
                  <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Good luck! 🎉</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Active quiz ── */
          <div className="question-card">
            {/* Meta row */}
            <div className="question-meta">
              <div className="question-counter">
                <span style={{ fontSize: 13 }}>{quizSet.title}</span>
                <div className="question-counter-dots">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIdx(i)}
                      className={`counter-dot ${i === currentIdx ? 'active' : answers[q.id]?.trim() ? 'done' : ''}`}
                      title={`Question ${i + 1}`}
                      style={{ border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                    />
                  ))}
                </div>
              </div>
              <div className="tab-tally" title="Screen changes used">
                ⚠
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`tally-mark ${i < tabSwitchCount ? 'used' : ''}`} />
                ))}
              </div>
            </div>

            {/* Question body */}
            {currentQ && (
              <div className="question-body" key={currentQ.id}>
                <div className="question-number-label">Question {currentIdx + 1} of {questions.length}</div>
                <p className="question-text">{currentQ.text}</p>

                {currentQ.options?.length >= 2 ? (
                  <div className="options-grid">
                    {currentQ.options.map((opt, oi) => (
                      <button
                        key={oi}
                        type="button"
                        className={`option-btn ${answers[currentQ.id] === opt ? 'selected' : ''}`}
                        onClick={() => selectOption(currentQ.id, opt)}
                        disabled={isLocked}
                      >
                        <span className="option-letter">{LETTERS[oi] || oi + 1}</span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="answer-area"
                    placeholder="Type your answer here…"
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                    disabled={isLocked}
                  />
                )}

                {/* Navigation */}
                <div className="quiz-nav" style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    style={{ opacity: currentIdx === 0 ? 0 : 1 }}
                  >
                    ← Previous
                  </button>

                  {currentIdx < questions.length - 1 ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Submitting…</> : '✓ Submit quiz'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && <div className="error-msg" style={{ marginTop: 12 }}>⚠ {error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
