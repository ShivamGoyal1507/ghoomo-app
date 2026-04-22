import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Sidebar.css';

export default function Sidebar({ open, onToggle }) {
  const location = useLocation();

  const menuItems = [
    { icon: '📊', label: 'Overview', path: '/dashboard/overview' },
    { icon: '👥', label: 'Users', path: '/dashboard/users' },
    { icon: '👨‍💼', label: 'Drivers', path: '/dashboard/drivers' },
    { icon: '🚗', label: 'Rides', path: '/dashboard/rides' },
    { icon: '🗺️', label: 'Routes', path: '/dashboard/routes' },
    { icon: '📋', label: 'Bus Schedule', path: '/dashboard/bus-schedule' },
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      <div className={`sidebar ${open ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-logo">Ghoomo</h1>
          <span className="admin-badge">Admin Portal</span>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`menu-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      {open && <div className="sidebar-overlay" onClick={onToggle} />}
    </>
  );
}
