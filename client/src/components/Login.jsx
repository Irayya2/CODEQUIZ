import { useState, useRef } from 'react';
import { api } from '../api';

const ROLL_RE = /^(24|25|26)BCA(\d{3})$/i;
const SEM_MAP = { '26': '1st Semester', '25': '3rd Semester', '24': '5th Semester' };

function detectSemester(roll) {
  const m = roll.trim().toUpperCase().match(/^(24|25|26)BCA(\d{3})$/);
  if (!m) return null;
  const num = parseInt(m[2], 10);
  if (num < 1 || num > 250) return null;
  return SEM_MAP[m[1]] || null;
}

export default function Login({ onLogin }) {
  const [role, setRole]     = useState('student');
  const [step, setStep]     = useState('email');
  const [email, setEmail]   = useState('');
  const [name, setName]     = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [otp, setOtp]       = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const otpRefs = useRef([]);

  const detectedSem = role === 'student' ? detectSemester(rollNumber) : null;
  const rollValid   = role === 'student' ? (rollNumber.trim() === '' || detectedSem !== null) : true;

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter your email address.');
    if (role === 'student') {
      if (!rollNumber.trim()) return setError('Enter your roll number (e.g. 26BCA042).');
      if (!detectedSem)       return setError('Roll number not recognised. Use format like 26BCA042 (001–250).');
    }
    setLoading(true);
    try {
      await api.requestOtp(email.trim(), role);
      setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length !== 6) return setError('Enter the full 6-digit code.');
    setLoading(true);
    try {
      const res = await api.verifyOtp(email.trim(), role, code, name.trim() || rollNumber.trim(), rollNumber.trim());
      onLogin({ token: res.token, role: res.role, email: email.trim(), semester: res.semester, semesterLabel: res.semesterLabel });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(idx, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[idx] = digit; setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  }
  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus();
  }
  function handleOtpPaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = text[i] || '';
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  }
  function switchRole(r) {
    setRole(r); setStep('email'); setError(''); setOtp(['', '', '', '', '', '']);
  }
  function goBack() {
    setStep('email'); setOtp(['', '', '', '', '', '']); setError('');
  }

  const initials = email ? email[0].toUpperCase() : '?';

  return (
    <div className="app-shell">
      <div className="card card--narrow">
        {step === 'email' ? (
          <>
            <p className="eyebrow">Weekly Quiz</p>
            <h1 className="title">Welcome back</h1>
            <p className="subtitle">Sign in with your email — no password needed.</p>

            <div className="role-tabs">
              <button type="button" className={`role-tab ${role === 'student' ? 'active' : ''}`} onClick={() => switchRole('student')}>🎓 Student</button>
              <button type="button" className={`role-tab ${role === 'teacher' ? 'active' : ''}`} onClick={() => switchRole('teacher')}>📋 Teacher</button>
            </div>

            {error && <div className="error-msg">⚠ {error}</div>}

            <form onSubmit={handleSendOtp}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" autoComplete="email"
                  placeholder={role === 'teacher' ? 'teacher@school.edu' : 'you@college.edu'}
                  value={email} onChange={e => setEmail(e.target.value)} autoFocus />
              </div>

              {role === 'student' && (
                <>
                  {/* Roll number */}
                  <div className="field">
                    <label htmlFor="roll">Roll number</label>
                    <input id="roll" type="text" placeholder="e.g. 26BCA042"
                      value={rollNumber}
                      onChange={e => setRollNumber(e.target.value.toUpperCase())}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.05em',
                        borderColor: rollNumber && !rollValid ? 'var(--danger)' : undefined }}
                    />
                    {/* Semester auto-detect badge */}
                    {detectedSem && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99,
                          background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)',
                          color:'var(--accent-bright)', letterSpacing:'0.04em' }}>
                          ✓ {detectedSem}
                        </span>
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>auto-detected</span>
                      </div>
                    )}
                    {rollNumber && !rollValid && (
                      <div style={{ fontSize:11.5, color:'var(--danger)', marginTop:5 }}>
                        Not a valid roll number — try 26BCA001 to 26BCA250 (or 25BCA / 24BCA).
                      </div>
                    )}
                  </div>

                  {/* Optional display name */}
                  <div className="field">
                    <label htmlFor="name">Your name <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400 }}>(optional)</span></label>
                    <input id="name" type="text" placeholder="Leave blank to use roll number"
                      value={name} onChange={e => setName(e.target.value)} />
                  </div>
                </>
              )}

              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Sending…</> : 'Send code →'}
              </button>
            </form>

            {/* Roll number guide for students */}
            {role === 'student' && (
              <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:8 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>Roll number guide</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {[['26BCA001–26BCA250','1st Semester','rgba(99,102,241,0.15)','var(--accent-bright)'],
                    ['25BCA001–25BCA250','3rd Semester','rgba(16,185,129,0.12)','#6EE7B7'],
                    ['24BCA001–24BCA250','5th Semester','rgba(245,158,11,0.10)','#FDE68A']].map(([range, sem, bg, color]) => (
                    <div key={sem} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, fontFamily:'monospace', color, background:bg, padding:'2px 7px', borderRadius:4 }}>{range}</span>
                      <span style={{ fontSize:11, color:'var(--text-muted)' }}>→ {sem}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="hint-msg" style={{ marginTop: 14 }}>We'll email you a one-time 6-digit code to verify your identity.</p>
          </>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
              <div className="avatar" style={{ width:44, height:44, fontSize:18 }}>{initials}</div>
              <div>
                <div style={{ fontSize:13, color:'var(--text-soft)', marginBottom:2 }}>Code sent to</div>
                <div style={{ fontWeight:600, fontSize:15, color:'var(--text)' }}>{email}</div>
                {role === 'student' && detectedSem && (
                  <div style={{ fontSize:11.5, color:'var(--accent-bright)', marginTop:3 }}>
                    🎓 {rollNumber} · {detectedSem}
                  </div>
                )}
              </div>
            </div>

            <p className="eyebrow">Check your inbox</p>
            <h1 className="title" style={{ fontSize:24, marginBottom:6 }}>Enter your code</h1>
            <p className="subtitle" style={{ marginBottom:20 }}>
              Enter the 6-digit code we just sent you. Check spam if it doesn't arrive.
            </p>

            {error && <div className="error-msg">⚠ {error}</div>}

            <form onSubmit={handleVerify}>
              <div style={{ marginBottom:20 }}>
                <div className="otp-grid" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input key={i} ref={el => (otpRefs.current[i] = el)}
                      className={`otp-box ${digit ? 'filled' : ''}`}
                      type="text" inputMode="numeric" maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)} />
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading || otp.join('').length < 6}>
                {loading ? <><span className="spinner" /> Verifying…</> : 'Verify & sign in →'}
              </button>
            </form>

            <p className="hint-msg" style={{ marginTop:16 }}>
              Didn't get it? <button type="button" onClick={goBack}>Try again</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
