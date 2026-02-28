import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CommissionProvider } from './contexts/CommissionContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { SitdownPage } from './pages/SitdownPage';
import { MembersPage } from './pages/MembersPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { RecoveryRedirect } from './components/auth/RecoveryRedirect';

/** Key by :id so hooks fully remount (clean state) on sit-down switch */
function SitdownPageKeyed() {
  const { id } = useParams<{ id: string }>();
  return <SitdownPage key={id} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RecoveryRedirect />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <AuthGuard>
                <CommissionProvider>
                  <AppShell />
                </CommissionProvider>
              </AuthGuard>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="sitdown/:id" element={<SitdownPageKeyed />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
