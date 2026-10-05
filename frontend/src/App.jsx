/**
 * App — корневой роутинг.
 * Портал сотрудника (светлый стиль), вход по доменной учётке:
 *   "/"               -> Login
 *   "/portal"         -> PortalHome (заявления: отпуск, больничный, справки…)
 *   "/helpdesk"       -> HelpdeskEmployee (заявки в IT)
 *   "/helpdesk/admin" -> HelpdeskAdmin (только для админов)
 *   "/phones"         -> PhoneBook (книга номеров)
 * Мониторинг (тёмная тема) — только для администраторов ИТ: "/monitor".
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PortalLayout from './components/PortalLayout';
import Dashboard from './pages/Dashboard';
import { ServiceDetailsPage } from './components/ServiceDetails';
import Inventory from './pages/Inventory';
import Alerts from './pages/Alerts';
import PhoneBook from './pages/PhoneBook';
import MedregLaunch from './pages/MedregLaunch';
import HelpdeskEmployee from './pages/HelpdeskEmployee';
import HelpdeskAdmin from './pages/HelpdeskAdmin';
import Login from './pages/Login';
import PortalHome from './pages/PortalHome';
import AdminPanel from './pages/AdminPanel';
import AgentPage from './pages/AgentPage';
import Assets from './pages/Assets';
import Analytics from './pages/Analytics';
import { getAuth, useInactivityLogout } from './lib/portal-auth';

function RequireAuth({ children, adminOnly = false, path = null }) {
  const auth = getAuth();
  if (!auth?.token) return <Navigate to="/" replace />;
  const u = auth.user || {};
  const isAdmin = u.role === 'admin';
  // Индивидуальные права могут выдать доступ к админ-разделам сотруднику
  const vis = Array.isArray(u.visible_sections) ? u.visible_sections : null;
  const canAdmin = isAdmin || (vis ? vis.includes('/portal/admin') : false);
  if (adminOnly && !canAdmin) return <Navigate to="/portal" replace />;
  // Индивидуальные права: если пользователю задан список видимых разделов и этот
  // путь в него не входит — отправляем на главную
  if (path && vis && !vis.includes(path)) {
    return <Navigate to="/portal" replace />;
  }
  return children;
}

function MonitorLayout({ children }) {
  // Мониторинг ИТ: тёмная тема, доступен только администраторам
  return <Layout>{children}</Layout>;
}

export default function App() {
  useInactivityLogout();

  return (
    <BrowserRouter>
      <Routes>
        {/* Вход */}
        <Route path="/" element={<Login />} />

        {/* Портал сотрудника (светлый стиль) */}
        <Route path="/portal" element={<RequireAuth><PortalLayout><PortalHome /></PortalLayout></RequireAuth>} />
        <Route path="/portal/absence" element={<RequireAuth path="/portal/absence"><PortalLayout><PortalHome scope="absence" /></PortalLayout></RequireAuth>} />
        <Route path="/portal/documents" element={<RequireAuth path="/portal/documents"><PortalLayout><PortalHome scope="docs" /></PortalLayout></RequireAuth>} />
        <Route path="/helpdesk" element={<RequireAuth><PortalLayout><HelpdeskEmployee /></PortalLayout></RequireAuth>} />
        <Route path="/helpdesk/admin" element={<RequireAuth adminOnly><PortalLayout><HelpdeskAdmin /></PortalLayout></RequireAuth>} />
        <Route path="/phones" element={<RequireAuth><PortalLayout><PhoneBook /></PortalLayout></RequireAuth>} />
        <Route path="/medreg" element={<RequireAuth><PortalLayout><MedregLaunch /></PortalLayout></RequireAuth>} />

        {/* Мониторинг ИТ — только для администраторов ИТ (тёмная тема) */}
        <Route path="/monitor" element={<RequireAuth adminOnly><MonitorLayout><Dashboard /></MonitorLayout></RequireAuth>} />
        <Route path="/monitor/assets" element={<RequireAuth adminOnly><MonitorLayout><Assets /></MonitorLayout></RequireAuth>} />
        <Route path="/monitor/agent" element={<RequireAuth adminOnly><MonitorLayout><AgentPage /></MonitorLayout></RequireAuth>} />
        <Route path="/service/:id" element={<RequireAuth adminOnly><MonitorLayout><ServiceDetailsPage /></MonitorLayout></RequireAuth>} />
        <Route path="/inventory" element={<RequireAuth adminOnly><MonitorLayout><Inventory /></MonitorLayout></RequireAuth>} />
        <Route path="/inventory/:hostId" element={<RequireAuth adminOnly><MonitorLayout><Inventory /></MonitorLayout></RequireAuth>} />
        <Route path="/alerts" element={<RequireAuth adminOnly><MonitorLayout><Alerts /></MonitorLayout></RequireAuth>} />

        {/* Админ-панель портала */}
        <Route path="/portal/admin" element={<RequireAuth adminOnly><PortalLayout><AdminPanel /></PortalLayout></RequireAuth>} />
        <Route path="/monitor/analytics" element={<RequireAuth adminOnly><MonitorLayout><Analytics /></MonitorLayout></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}
