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
import IdeasView from '@/views/IdeasView';
import AgentsView from '@/views/AgentsView';
import MarketingView from '@/views/MarketingView';

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
          <Route path="/ideas" element={<IdeasView />} />
          <Route path="/export" element={<ExportView />} />
          <Route path="/stats" element={<StatsView />} />
          <Route path="/marketing" element={<MarketingView />} />
          <Route path="/agents" element={<AgentsView />} />
        </Route>

        <Route path="*" element={<Navigate to="/explore" replace />} />
      </Routes>

      <ToastHost />
    </>
  );
}
