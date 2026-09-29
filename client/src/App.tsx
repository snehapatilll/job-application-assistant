import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NewAnalysisPage } from './pages/NewAnalysisPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { HistoryPage } from './pages/HistoryPage';

function NotFoundPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-medium text-slate-900">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-sm font-medium text-slate-900 underline">
        Back to new analysis
      </Link>
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* Signed-out area: bounces to the app if a session already exists. */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Signed-in area: everything below sits inside the app shell. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<NewAnalysisPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analyses/:id" element={<AnalysisPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
