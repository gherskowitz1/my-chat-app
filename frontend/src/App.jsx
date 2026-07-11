import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import AuthPage from './pages/AuthPage';
import ChatLayout from './pages/ChatLayout';
import PrivacyPage from './pages/PrivacyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminDashboard from './pages/AdminDashboard';

function AppRoutes() {
  const { user, loading } = useAuth();
  const isAdminSubdomain = window.location.hostname.startsWith('admin.');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-tertiary)' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Admin subdomain — show admin dashboard or login
  if (isAdminSubdomain) {
    return (
      <Routes>
        <Route path="/*" element={
          user?.role === 'admin'
            ? <AdminDashboard />
            : user
              ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#f2f3f5',background:'#0f1117',flexDirection:'column',gap:16}}>
                  <p>Admin access required.</p>
                  <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }} style={{padding:'8px 16px',background:'#5865f2',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Sign out</button>
                </div>
              : <Navigate to="/auth" replace />
        } />
        <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" replace />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/*" element={user ? <SocketProvider><ChatLayout /></SocketProvider> : <Navigate to="/auth" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
