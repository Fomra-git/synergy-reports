import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfigProvider } from './context/ConfigContext';
import { PrivateRoute, AdminRoute } from './components/PrivateRoute';

// Pages (lazy loaded for code splitting)
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const TemplateManager = lazy(() => import('./pages/TemplateManager'));
const GenerateReport = lazy(() => import('./pages/GenerateReport'));
const VisualExcelMapping = lazy(() => import('./pages/VisualExcelMapping'));
const PivotTemplateManager = lazy(() => import('./pages/PivotTemplateManager'));
const ScoreboardDesigner = lazy(() => import('./pages/ScoreboardDesigner'));
const MultiTableDesigner = lazy(() => import('./pages/MultiTableDesigner'));
const ViewReport = lazy(() => import('./pages/ViewReport'));

// Components
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <ConfigProvider>
      <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="generate" element={<GenerateReport />} />
            <Route path="view-report" element={<ViewReport />} />
            <Route path="templates" element={<TemplateManager />} />
            <Route path="admin" element={
              <AdminRoute>
                <AdminPanel />
              </AdminRoute>
            } />
            <Route path="visual-mapper" element={
              <AdminRoute>
                <VisualExcelMapping />
              </AdminRoute>
            } />
            <Route path="pivot-designer" element={
              <AdminRoute>
                <PivotTemplateManager />
              </AdminRoute>
            } />
            <Route path="scoreboard-designer" element={
              <AdminRoute>
                <ScoreboardDesigner />
              </AdminRoute>
            } />
            <Route path="multi-table-designer" element={
              <AdminRoute>
                <MultiTableDesigner />
              </AdminRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
      </ThemeProvider>
      </ConfigProvider>
    </Router>
  );
}

export default App;
