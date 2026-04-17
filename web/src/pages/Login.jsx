import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Login.css';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const isCreateMode = mode === 'create';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, registerAdmin } = useAuth();
  const navigate = useNavigate();

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isCreateMode) {
        await registerAdmin({
          name,
          email,
          phone,
          city,
          emergencyContact,
          password,
          employeeId,
          organization,
        });
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-grid-overlay" />
      <div className="login-accent login-accent-top" />
      <div className="login-accent login-accent-bottom" />
      <div className="login-card">
        <p className="login-eyebrow">Control Center</p>
        <h1 className="login-title">Ghoomo Admin Portal</h1>
        <p className="login-subtitle">
          {isCreateMode
            ? 'Create an admin account to access users, drivers, rides, and route operations.'
            : 'Manage users, drivers, rides, and routes from one secure workspace.'}
        </p>

        <div className="login-mode-toggle" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={`mode-btn ${!isCreateMode ? 'active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`mode-btn ${isCreateMode ? 'active' : ''}`}
            onClick={() => switchMode('create')}
          >
            Create Admin Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {isCreateMode && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Admin name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@ghoomo.com"
              required
            />
          </div>

          {isCreateMode && (
            <>
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Your city"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="emergencyContact">Emergency Contact</label>
                <input
                  id="emergencyContact"
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Emergency contact number"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {isCreateMode && (
            <>
              <div className="form-group">
                <label htmlFor="employeeId">Employee ID</label>
                <input
                  id="employeeId"
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Employee ID"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="organization">Organization</label>
                <input
                  id="organization"
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Organization"
                  required
                />
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? (isCreateMode ? 'Creating account...' : 'Signing in...') : (isCreateMode ? 'Create Admin Account' : 'Sign In')}
          </button>
        </form>

        <p className="login-footer">Only accounts with the admin role can access this portal.</p>
      </div>
    </div>
  );
}
