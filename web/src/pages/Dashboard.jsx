import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Overview from '../components/Overview';
import Users from '../components/Users';
import Drivers from '../components/Drivers';
import Rides from '../components/Rides';
import Routes_Component from '../components/Routes';
import RouteDetails from '../components/RouteDetails';
import Sidebar from '../components/Sidebar';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <div>
              <p className="header-kicker">Admin Workspace</p>
              <h2>Ghoomo Operations Console</h2>
            </div>
          </div>
          <div className="header-right">
            <span className="user-info">{user?.name || user?.email}</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          <Routes>
            <Route path="/" element={<Navigate to="overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/users" element={<Users />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/rides" element={<Rides />} />
            <Route path="/routes" element={<Routes_Component />} />
            <Route path="/routes/:routeId" element={<RouteDetails />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
