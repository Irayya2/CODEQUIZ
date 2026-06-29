import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [role, setRole] = useState('student');
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter your email address.');
    setLoading(true);
    try {
      await api.requestOtp(email.trim(), role);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    if (code.trim().length !== 6) return setError('Enter the 6-digit code.');
    setLoading(true);
    try {
      const res = await api.verifyOtp(email.trim(), role, code.trim(), name.trim());
      onLogin({ token: res.token, role: res.role, email: email.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchRole(r) {
    setRole(r);
    setStep('email');
    setError('');
    setCode('');
  }

  return (
    <div className="app-shell">
      <div className="sheet">
        <p className="eyebrow">Weekly Quiz</p>
        <h1 className="title">{step === 'email' ? 'Sign in' : 'Check your email'}</h1>
        <p className="subtitle">
          {step === 'email'
            ? 'No passwords. We\u2019ll email you a one-time code to sign in.'
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {step === 'email' && (
          <div className="role-tabs">
            <button
              type="button"
              className={`role-tab ${role === 'student' ? 'active' : ''}`}
              onClick={() => switchRole('student')}
            >
              Student
            </button>
            <button
              type="button"
              className={`role-tab ${role === 'teacher' ? 'active' : ''}`}
              onClick={() => switchRole('teacher')}
            >
              Teacher
            </button>
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            {role === 'student' && (
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="As it should appear to your teacher"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <button className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="field">
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                className="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="······"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Verify & sign in'}
            </button>
            <p className="hint-msg">
              Didn't get it?{' '}
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                Try again
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
