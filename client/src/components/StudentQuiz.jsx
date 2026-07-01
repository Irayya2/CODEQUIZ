import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';

const LETTERS = ['A', 'B', 'C', 'D'];

const MALPRACTICE_SHORTCUTS = [
  { label: 'Alt+Tab (window switch)',  test: (e) => e.altKey  && e.key === 'Tab' },
  { label: 'Win+D (show desktop)',     test: (e) => e.metaKey && e.key.toLowerCase() === 'd' },
  { label: 'Win+Tab (task view)',      test: (e) => e.metaKey && e.key === 'Tab' },
  { label: 'Win+L (lock screen)',      test: (e) => e.metaKey && e.key.toLowerCase() === 'l' },
  { label: 'Win+M (minimise all)',     test: (e) => e.metaKey && e.key.toLowerCase() === 'm' },
  { label: 'Alt+F4 (close window)',    test: (e) => e.altKey  && e.key === 'F4' },
  { label: 'Ctrl+W (close tab)',       test: (e) => e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'w' },
  { label: 'Ctrl+T (new tab)',         test: (e) => e.ctrlKey && !e.altKey && e.key.toLowerCase() === 't' },
  { label: 'Ctrl+N (new window)',      test: (e) => e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n' },
  { label: 'Ctrl+Alt+T (terminal)',    test: (e) => e.ctrlKey && e.altKey  && e.key.toLowerCase() === 't' },
  { label: 'Cmd+Tab (app switcher)',   test: (e) => e.metaKey && e.key === 'Tab' },
  { label: 'Cmd+H (hide window)',      test: (e) => e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'h' },
  { label: 'Cmd+Q (quit app)',         test: (e) => e.metaKey && e.key.toLowerCase() === 'q' },
  { label: 'Cmd+Space (Spotlight)',    test: (e) => e.metaKey && e.code === 'Space' },
];
function detectShortcut(e) { return (MALPRACTICE_SHORTCUTS.find(s => s.test(e)) || null)?.label ?? null; }

export default function StudentQuiz({ session, onLogout }) {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [quizSet, setQuizSet]       = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [answers, setAnswers]       = useState({});
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [status, setStatus]         = useState('in_progress');
  const [toast, setToast]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const quizIdRef       = useRef(null);
  const statusRef       = useRef('in_progress');
  const lastReportedRef = useRef(0);
  useEffect(() => { statusRef.current = status; }, [status]);

  const showToast = useCallback((msg, type = 'warn') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 5000);
  }, []);

  const reportMalpractice = useCallback(async (reason) => {
    if (statusRef.current !== 'in_progress' || !quizIdRef.current) return;
    const now = Date.now();
    if (now - lastReportedRef.current < 2500) return;
    lastReportedRef.current = now;
    try {
      const res = await api.reportTabSwitch(session.token, quizIdRef.current);
      setTabSwitchCount(res.tabSwitchCount);
      setStatus(res.status);
      const left = Math.max(0, 3 - res.tabSwitchCount);
      if (res.status === 'auto_submitted') {
        showToast('⛔ Quiz auto-submitted — 3 malpractice actions detected.', 'danger');
      } else {
        showToast(`🚨 ${reason} detected — ⚠ ${left} strike${left !== 1 ? 's' : ''} left before auto-submit`, 'warn');
      }
    } catch (err) { console.error('Malpractice report failed:', err.message); }
  }, [session.token, showToast]);

  const loadQuiz = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.getActiveQuiz(session.token);
      if (!data.quizSet) { setQuizSet(null); }
      else {
        setQuizSet(data.quizSet);
        setQuestions(data.questions);
        setAnswers(data.answers || {});
        setTabSwitchCount(data.tabSwitchCount || 0);
        setStatus(data.status);
        quizIdRef.current = data.quizSet.id;
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (statusRef.current !== 'in_progress' || !quizIdRef.current) return;
      const label = detectShortcut(e);
      if (!label) return;
      e.preventDefault();
      reportMalpractice(label);
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [reportMalpractice]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'hidden') return;
      reportMalpractice('Screen switch');
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reportMalpractice]);

  useEffect(() => {
    function handleBlur() { reportMalpractice('Window focus lost'); }
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [reportMalpractice]);

  const saveTimers = useRef({});
  function handleAnswerChange(questionId, value) {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      api.saveAnswer(session.token, quizSet.id, questionId, value).catch(console.error);
    }, 500);
  }

  async function handleSubmit() {
    setSubmitting(true); setError('');
    try {
      await api.submitQuiz(session.token, quizSet.id);
      setStatus('submitted');
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  // ── Score calculation (client-side, after submission) ────────────────
  const gradableQuestions = questions.filter(q => q.correctAnswer);
  const score = gradableQuestions.reduce((sum, q) => sum + (answers[q.id] === q.correctAnswer ? 1 : 0), 0);
  const scorePct = gradableQuestions.length ? Math.round((score / gradableQuestions.length) * 100) : null;
  function scoreEmoji(pct) {
    if (pct === 100) return '🏆';
    if (pct >= 80)  return '🎉';
    if (pct >= 60)  return '👍';
    if (pct >= 40)  return '📚';
    return '💪';
  }
  function scoreColor(pct) {
    if (pct >= 80) return 'var(--success)';
    if (pct >= 50) return 'var(--warn)';
    return 'var(--danger)';
  }

  const isLocked      = status !== 'in_progress';
  const answeredCount = questions.filter(q => answers[q.id]?.trim()).length;
  const progress      = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const initials      = session.email ? session.email[0].toUpperCase() : '?';
  const currentQ      = questions[currentIdx];

  return (
    <div className="quiz-shell">
      {/* Toast */}
      {toast && (
        <div className="toast" role="alert" style={{
          borderColor: toast.type === 'danger' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)',
          color:       toast.type === 'danger' ? '#FCA5A5' : '#FDE68A',
        }}>
          {toast.msg}
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
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {quizSet && !isLocked && (
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>{answeredCount}/{questions.length} answered</span>
          )}
          <button className="signout-link" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      {/* Progress Bar */}
      {quizSet && !isLocked && (
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width:`${progress}%` }} />
        </div>
      )}

      {/* Main */}
      <div className="quiz-main">
        {loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, color:'var(--text-muted)' }}>
            <div className="spinner spinner-dark" style={{ width:32, height:32, borderWidth:3 }} />
            <span style={{ fontSize:14 }}>Loading quiz…</span>
          </div>
        )}

        {!loading && error && <div className="card card--full"><div className="error-msg">⚠ {error}</div></div>}

        {!loading && !quizSet && !error && (
          <div className="card" style={{ maxWidth:480, width:'100%', padding:0 }}>
            <div className="no-quiz-card">
              <span className="no-quiz-icon">📭</span>
              <div className="no-quiz-title">No quiz right now</div>
              <p className="no-quiz-sub">Your teacher hasn't posted this week's questions yet. Check back soon!</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop:20, width:'auto', padding:'10px 20px' }} onClick={loadQuiz}>Refresh</button>
            </div>
          </div>
        )}

        {!loading && quizSet && (isLocked ? (
          /* ── Locked / submitted state ── */
          <div className="question-card">
            <div className="question-body">
              {status === 'auto_submitted' ? (
                <div className="banner-locked danger">
                  <span className="banner-locked-icon">⛔</span>
                  <strong style={{ fontSize:18 }}>Quiz auto-submitted</strong>
                  <p>Your answers were automatically submitted after 3 malpractice detections.</p>
                  {scorePct !== null && (
                    <div style={{ marginTop:16, padding:'14px 20px', background:'rgba(0,0,0,0.2)', borderRadius:10, textAlign:'center' }}>
                      <div style={{ fontSize:36, fontWeight:700, color:scoreColor(scorePct) }}>{score}/{gradableQuestions.length}</div>
                      <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>Your score ({scorePct}%)</div>
                    </div>
                  )}
                  <p style={{ fontSize:13, opacity:0.7, marginTop:8 }}>If this was a mistake, contact your teacher.</p>
                </div>
              ) : (
                <div className="banner-locked success">
                  <span className="banner-locked-icon">{scorePct !== null ? scoreEmoji(scorePct) : '✅'}</span>
                  <strong style={{ fontSize:18 }}>Submitted!</strong>

                  {/* Score display */}
                  {scorePct !== null && (
                    <div style={{ width:'100%', marginTop:8 }}>
                      {/* Big score */}
                      <div style={{ textAlign:'center', padding:'20px 16px', background:'rgba(0,0,0,0.2)', borderRadius:12, marginBottom:16 }}>
                        <div style={{ fontSize:52, fontWeight:700, color:scoreColor(scorePct), lineHeight:1 }}>{score}</div>
                        <div style={{ fontSize:16, color:'var(--text-soft)', marginTop:4 }}>out of {gradableQuestions.length} correct</div>
                        <div style={{ marginTop:12, height:8, background:'rgba(255,255,255,0.08)', borderRadius:99, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${scorePct}%`, background:`linear-gradient(90deg,${scoreColor(scorePct)},${scoreColor(scorePct)}99)`, borderRadius:99, transition:'width 0.8s ease' }} />
                        </div>
                        <div style={{ fontSize:24, fontWeight:700, color:scoreColor(scorePct), marginTop:8 }}>{scorePct}%</div>
                      </div>

                      {/* Per-question breakdown */}
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {questions.map((q, i) => {
                          const studentAnswer = answers[q.id];
                          const isCorrect = q.correctAnswer && studentAnswer === q.correctAnswer;
                          const isWrong   = q.correctAnswer && studentAnswer && studentAnswer !== q.correctAnswer;
                          const noAnswer  = !studentAnswer;
                          return (
                            <div key={q.id} style={{ padding:'10px 14px', borderRadius:8, background: isCorrect?'rgba(16,185,129,0.08)': isWrong?'rgba(239,68,68,0.08)':'rgba(255,255,255,0.03)', border:`1px solid ${isCorrect?'rgba(16,185,129,0.2)':isWrong?'rgba(239,68,68,0.15)':'var(--border)'}` }}>
                              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                                <span style={{ fontSize:18, flexShrink:0 }}>{isCorrect ? '✅' : isWrong ? '❌' : '⬜'}</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>Q{i+1}. {q.text}</div>
                                  <div style={{ fontSize:12.5 }}>
                                    <span style={{ color:'var(--text-muted)' }}>Your answer: </span>
                                    <span style={{ color: isCorrect?'#6EE7B7': isWrong?'#FCA5A5':'var(--text-muted)', fontWeight:500 }}>
                                      {noAnswer ? 'Not answered' : studentAnswer}
                                    </span>
                                  </div>
                                  {isWrong && q.correctAnswer && (
                                    <div style={{ fontSize:12.5, marginTop:2 }}>
                                      <span style={{ color:'var(--text-muted)' }}>Correct: </span>
                                      <span style={{ color:'#6EE7B7', fontWeight:500 }}>{q.correctAnswer}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {scorePct === null && <p>Your answers are in. You can close this page.</p>}
                  <p style={{ fontSize:13, opacity:0.7, marginTop:8 }}>Good luck! 🎉</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Active quiz ── */
          <div className="question-card">
            <div className="question-meta">
              <div className="question-counter">
                <span style={{ fontSize:13, color:'var(--text-soft)' }}>{quizSet.title}</span>
                <div className="question-counter-dots">
                  {questions.map((q, i) => (
                    <button key={q.id} onClick={()=>setCurrentIdx(i)} className={`counter-dot ${i===currentIdx?'active':answers[q.id]?.trim()?'done':''}`} title={`Question ${i+1}`} style={{ border:'none', padding:0, cursor:'pointer', background:'none' }} />
                  ))}
                </div>
              </div>
              <div className="tab-tally" title={`${tabSwitchCount} of 3 strikes used`}>
                <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:2 }}>Strikes</span>
                {[0,1,2].map(i => <span key={i} className={`tally-mark ${i<tabSwitchCount?'used':''}`} />)}
              </div>
            </div>

            {currentQ && (
              <div className="question-body" key={currentQ.id}>
                <div className="question-number-label">Question {currentIdx+1} of {questions.length}</div>
                <p className="question-text">{currentQ.text}</p>

                {currentQ.options?.length >= 2 ? (
                  <div className="options-grid">
                    {currentQ.options.map((opt, oi) => (
                      <button key={oi} type="button" className={`option-btn ${answers[currentQ.id]===opt?'selected':''}`} onClick={()=>handleAnswerChange(currentQ.id, opt)} disabled={isLocked}>
                        <span className="option-letter">{LETTERS[oi]||oi+1}</span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea className="answer-area" placeholder="Type your answer here…" value={answers[currentQ.id]||''} onChange={e=>handleAnswerChange(currentQ.id, e.target.value)} disabled={isLocked} />
                )}

                <div className="quiz-nav" style={{ marginTop:20 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setCurrentIdx(i=>Math.max(0,i-1))} disabled={currentIdx===0} style={{ opacity:currentIdx===0?0:1 }}>← Previous</button>
                  {currentIdx < questions.length-1 ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={()=>setCurrentIdx(i=>Math.min(questions.length-1,i+1))}>Next →</button>
                  ) : (
                    <button type="button" className="btn btn-success btn-sm" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <><span className="spinner" style={{ width:14,height:14,borderWidth:2 }}/> Submitting…</> : '✓ Submit quiz'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && <div className="error-msg" style={{ marginTop:12 }}>⚠ {error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
