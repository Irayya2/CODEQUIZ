import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';

export default function StudentQuiz({ session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizSet, setQuizSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [warnFlash, setWarnFlash] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Keep a ref to current quizSet id + status so the visibility listener
  // (registered once) always sees fresh values without re-binding constantly.
  const quizIdRef = useRef(null);
  const statusRef = useRef('in_progress');
  useEffect(() => { statusRef.current = status; }, [status]);

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

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  // Tab-switch / app-switch detection.
  // Fires when the page becomes hidden (tab change, app switch, minimizing).
  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== 'hidden') return;
      if (statusRef.current !== 'in_progress' || !quizIdRef.current) return;

      try {
        const res = await api.reportTabSwitch(session.token, quizIdRef.current);
        setTabSwitchCount(res.tabSwitchCount);
        setStatus(res.status);
        setWarnFlash(true);
        setTimeout(() => setWarnFlash(false), 4000);
      } catch (err) {
        // Network hiccup while reporting - fail silently, this is a background event
        console.error('Failed to report tab switch:', err.message);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session.token]);

  // Debounced auto-save: saves an answer ~600ms after the student stops typing.
  const saveTimers = useRef({});
  function handleAnswerChange(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      api.saveAnswer(session.token, quizSet.id, questionId, value).catch((err) => {
        console.error('Autosave failed:', err.message);
      });
    }, 600);
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

  const switchesLeft = Math.max(0, 3 - tabSwitchCount);
  const isLocked = status !== 'in_progress';

  return (
    <div className="app-shell">
      <div className="sheet sheet--wide">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Signed in as</p>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5 }}>{session.email}</p>
          </div>
          <button className="signout-link" onClick={onLogout}>Sign out</button>
        </div>

        {loading && <p className="empty-state">Loading this week's quiz…</p>}

        {!loading && error && <div className="error-msg">{error}</div>}

        {!loading && !quizSet && !error && (
          <div className="empty-state">
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', marginBottom: 6 }}>
              No quiz is open right now
            </p>
            <p>Your teacher hasn't posted this week's questions yet. Check back soon.</p>
          </div>
        )}

        {!loading && quizSet && (
          <>
            <div className="quiz-header">
              <div>
                <p className="eyebrow">This week</p>
                <h1 className="title" style={{ fontSize: 22 }}>{quizSet.title}</h1>
              </div>
              <div className="tally" aria-label={`${tabSwitchCount} of 3 screen changes used`}>
                <span className="tally-label">Screen changes</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`tally-mark ${i < tabSwitchCount ? 'used' : ''}`} />
                ))}
              </div>
            </div>

            {warnFlash && status === 'in_progress' && (
              <div className="banner-warn">
                ⚠️ Switching tabs or apps was detected. You have {switchesLeft} more before your
                answers are automatically submitted.
              </div>
            )}

            {status === 'auto_submitted' && (
              <div className="banner-locked">
                Your answers were automatically submitted after 3 screen changes were detected.
                If you believe this was a mistake, contact your teacher directly.
              </div>
            )}

            {status === 'submitted' && (
              <div className="banner-locked" style={{ background: '#DCFCE7', borderColor: '#BBF7D0', color: '#166534' }}>
                Your answers have been submitted. You can close this page.
              </div>
            )}

            {questions.map((q, idx) => (
              <div className="question-block" key={q.id}>
                <span className="question-number">Question {idx + 1} of {questions.length}</span>
                <p className="question-text">{q.text}</p>
                <textarea
                  className="answer-area"
                  placeholder="Type your answer here…"
                  value={answers[q.id] || ''}
                  disabled={isLocked}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                />
              </div>
            ))}

            {status === 'in_progress' && (
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <span className="spinner" /> : 'Submit answers'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
