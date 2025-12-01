import React from 'react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'models', name: 'Models', icon: '🧠' },
    { id: 'subscriptions', name: 'Subscriptions', icon: '💳' },
    { id: 'api-keys', name: 'API Keys', icon: '🔑' }
  ];

  return (
    <aside className="w-64 bg-dark text-white flex flex-col">
      <div className="p-6 border-b border-dark-light">
        <h1 className="text-2xl font-bold">Acme Inc.</h1>
        <p className="text-gray-400 text-sm mt-1">MaaS</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${
                  activeTab === item.id
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-dark-light'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-dark-light">
        <p className="text-gray-400 text-xs">
          Powered by Acme Inc.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
