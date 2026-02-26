// frontend/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';

// Pages
import Login from '@pages/Login';
import Register from '@pages/Register';
import Chat from '@pages/Chat';
import Documents from '@pages/Documents';
import DocumentIndex from '@pages/DocumentIndex';
import Settings from '@pages/Settings';

// Layout
import MainLayout from '@components/layout/MainLayout';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  return !isAuthenticated ? children : <Navigate to="/chat" replace />;
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

      {/* Protected — all share MainLayout */}
      <Route
        path="/"
        element={<ProtectedRoute><MainLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:conversationId" element={<Chat />} />
        <Route path="documents" element={<Documents />} />
        <Route path="document-index" element={<DocumentIndex />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}

export default App;