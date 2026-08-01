import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import DisplayPage from './pages/DisplayPage';
import VotePage from './pages/VotePage';

/**
 * HashRouter keeps routing entirely client-side, so the app works on Amplify
 * Hosting (and any static host) without rewrite rules — one less thing to
 * configure for a throwaway event stack.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<VotePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}

function NotFound() {
  return (
    <div className="center-screen">
      <div className="card">
        <h1>Page not found</h1>
        <p>
          <Link to="/">Go to voting</Link>
        </p>
      </div>
    </div>
  );
}
