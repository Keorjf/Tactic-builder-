import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import RequireAdmin from '@/components/RequireAdmin';
import AppShell from '@/components/AppShell';
import { ToastHost } from '@/components/Toast';
import AuthView from '@/views/AuthView';
import ExploreView from '@/views/ExploreView';
import ExportView from '@/views/ExportView';
import StatsView from '@/views/StatsView';
import Placeholder from '@/views/Placeholder';

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);

  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthView />} />

        <Route
          element={
            <RequireAdmin>
              <AppShell />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="/explore" replace />} />
          <Route path="/explore" element={<ExploreView />} />
          <Route path="/ideas" element={<Placeholder title="Lesson Ideas" phase="Phase 6" />} />
          <Route path="/export" element={<ExportView />} />
          <Route path="/stats" element={<StatsView />} />
          <Route path="/marketing" element={<Placeholder title="Marketing" phase="Phase 6" />} />
          <Route path="/agents" element={<Placeholder title="AI Agents" phase="Phase 6" />} />
        </Route>

        <Route path="*" element={<Navigate to="/explore" replace />} />
      </Routes>

      <ToastHost />
    </>
  );
}
