import { lazy, Suspense, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import './index.css';

const Models = lazy(() => import('./components/Models'));
const ApiKeys = lazy(() => import('./components/ApiKeys'));
const Subscriptions = lazy(() => import('./components/Subscriptions'));
const Notebooks = lazy(() => import('./components/Notebooks'));
const Agents = lazy(() => import('./components/Agents'));
const FinOpsDashboard = lazy(() => import('./components/FinOpsDashboard'));
const Teams = lazy(() => import('./components/Teams'));

const tabs = {
  models: Models,
  agents: Agents,
  notebooks: Notebooks,
  finops: FinOpsDashboard,
  teams: Teams,
  'api-keys': ApiKeys,
  subscriptions: Subscriptions,
};

const validTabs = new Set(Object.keys(tabs));

function normalizeTab(tab) {
  if (!tab) return 'models';
  const value = String(tab).toLowerCase().trim();
  if (value === 'home') return 'models';
  if (value === 'apikeys') return 'api-keys';
  return validTabs.has(value) ? value : 'models';
}

function getTabFromLocation() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (path) {
    const [segment] = path.split('/');
    return normalizeTab(segment);
  }

  const tabFromQuery = new URLSearchParams(window.location.search).get('tab');
  if (tabFromQuery) return normalizeTab(tabFromQuery);

  const hash = window.location.hash.replace(/^#/, '');
  if (hash) return normalizeTab(hash);

  return 'models';
}

function getPathForTab(tab) {
  return tab === 'models' ? '/' : `/${tab}`;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState(() => getTabFromLocation());
  const ActiveComponent = tabs[activeTab];

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const targetPath = getPathForTab(activeTab);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab: activeTab }, '', targetPath);
    }
  }, [activeTab]);

  return (
    <div className="flex h-screen bg-cream-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-auto gradient-subtle">
        <Suspense fallback={<LoadingFallback />}>
          {ActiveComponent ? <ActiveComponent /> : null}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
