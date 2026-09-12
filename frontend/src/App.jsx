/**
 * App — корневой роутинг.
 * "/"             -> Dashboard (grid карточек + модалка деталей)
 * "/service/:id"  -> ServiceDetailsPage (страница с графиком, для deep-link)
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { ServiceDetailsPage } from './components/ServiceDetails';
import Inventory from './pages/Inventory';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/service/:id" element={<ServiceDetailsPage />} />
        <Route path="/inventory" element={<Inventory />} />
      </Routes>
    </BrowserRouter>
  );
}
