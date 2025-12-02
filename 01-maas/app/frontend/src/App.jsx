import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Models from './components/Models';
import ApiKeys from './components/ApiKeys';
import Subscriptions from './components/Subscriptions';
import Notebooks from './components/Notebooks';
import FinOpsDashboard from './components/FinOpsDashboard';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('models');

  return (
    <div className="flex h-screen bg-cream-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-auto gradient-subtle">
        {activeTab === 'models' && <Models />}
        {activeTab === 'notebooks' && <Notebooks />}
        {activeTab === 'finops' && <FinOpsDashboard />}
        {activeTab === 'api-keys' && <ApiKeys />}
        {activeTab === 'subscriptions' && <Subscriptions />}
      </main>
    </div>
  );
}

export default App;
