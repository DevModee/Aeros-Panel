import { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { ServerInfo } from './pages/ServerInfo';

function App() {
  const [currentPath, setCurrentPath] = useState('dashboard');

  const renderContent = () => {
    switch (currentPath) {
      case 'dashboard':
        return <Dashboard />;
      case 'projects':
        return <Projects />;
      case 'server':
        return <ServerInfo />;
      case 'settings':
        return <Settings />;
      default:
        return <div className="text-aeros-blue font-mono">MODULE_NOT_FOUND</div>;
    }
  };

  return (
    <Layout currentPath={currentPath} onNavigate={setCurrentPath}>
      {renderContent()}
    </Layout>
  );
}

export default App;
