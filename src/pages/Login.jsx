import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { FileSpreadsheet, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const { login, resetPassword } = useAuth();
  const { config } = useConfig();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    }
    setLoading(false);
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError('Failed to send reset email. Check the address and try again.');
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-card">
        <div className="login-logo" style={{ justifyContent: 'center' }}>
          {config?.logoBase64 ? (
             <img src={config.logoBase64} alt="App Logo" style={{ maxHeight: '48px', maxWidth: '48px' }} />
          ) : (
             <div className="login-logo-icon">
               <FileSpreadsheet size={32} />
             </div>
          )}
        </div>

        <div className="divider" />

        {resetSent ? (
          <div className="success-message">
            <p>✓ Password reset email sent. Check your inbox.</p>
            <button className="btn-link" onClick={() => { setResetMode(false); setResetSent(false); }}>
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={resetMode ? handleReset : handleSubmit} className="login-form">
            <h2 className="form-heading">{resetMode ? 'Reset Password' : 'Welcome Back'}</h2>
            <p className="form-subheading">
              {resetMode ? 'Enter your email to receive a reset link.' : 'Sign in to access your workspace.'}
            </p>

            {error && (
              <div className="alert-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            {!resetMode && (
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-icon-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary btn-full" disabled={loading}>
              {loading ? (
                <span className="spinner" />
              ) : resetMode ? (
                'Send Reset Link'
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>

            <div className="login-footer-links">
              {resetMode ? (
                <button type="button" className="btn-link" onClick={() => setResetMode(false)}>
                  ← Back to Login
                </button>
              ) : (
                <button type="button" className="btn-link" onClick={() => setResetMode(true)}>
                  Forgot password?
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
