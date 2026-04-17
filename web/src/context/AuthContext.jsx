import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('admin_token');
    const storedUser = localStorage.getItem('admin_user');

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser?.role === 'admin') {
          setUser(parsedUser);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
        }
      } catch (_error) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
      }
    }

    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      if (user?.role !== 'admin') {
        throw new Error('Only admin accounts can sign in to this portal.');
      }

      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_user', JSON.stringify(user));

      setUser(user);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const registerAdmin = async ({
    name,
    email,
    phone,
    city,
    emergencyContact,
    password,
    employeeId,
    organization,
  }) => {
    try {
      setLoading(true);
      await api.post('/auth/register', {
        role: 'admin',
        name,
        email,
        phone,
        city,
        emergencyContact,
        password,
        employeeId,
        organization,
      });

      // Reuse login flow so auth state/local storage is set consistently.
      await login(email, password);
      return true;
    } catch (error) {
      console.error('Admin registration failed:', error);
      throw new Error(error.response?.data?.message || 'Admin account creation failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, registerAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
