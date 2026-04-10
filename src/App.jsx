import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfigProvider } from './context/ConfigContext';
import { PrivateRoute, AdminRoute } from './components/PrivateRoute';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import TemplateManager from './pages/TemplateManager';
import GenerateReport from './pages/GenerateReport';
import VisualExcelMapping from './pages/VisualExcelMapping';
import PivotTemplateManager from './pages/PivotTemplateManager';

// Components
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <ConfigProvider>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="generate" element={<GenerateReport />} />
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
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
      </ConfigProvider>
    </Router>
  );
}

export default App;
