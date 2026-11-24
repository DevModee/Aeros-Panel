import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { ServerInfo } from './pages/ServerInfo';
import { Login, type AuthUser } from './pages/Login';
import { apiFetch, onUnauthorized } from './lib/api';

interface AuthStatusResponse {
  authenticated: boolean;
  setupRequired: boolean;
  user: AuthUser | null;
}

function App() {
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [authChecked, setAuthChecked] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    apiFetch<AuthStatusResponse>('/api/auth/status', {}, { skipAuthRedirect: true })
      .then((status) => {
        if (!active) return;
        setSetupRequired(status.setupRequired);
        setUser(status.authenticated ? status.user : null);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setSetupRequired(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' }, { skipAuthRedirect: true });
    } catch (error) {
      console.error(error);
    } finally {
      setUser(null);
      setSetupRequired(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="h-screen bg-aeros-dark text-aeros-blue font-mono flex items-center justify-center">
        <Activity className="animate-spin mr-3" />
        INIT_SESSION_CHECK...
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        setupRequired={setupRequired}
        onAuthenticated={(loggedInUser) => {
          setSetupRequired(false);
          setUser(loggedInUser);
        }}
      />
    );
  }

  const renderContent = () => {
    switch (currentPath) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPath} />;
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
    <Layout
      currentPath={currentPath}
      onNavigate={setCurrentPath}
      user={user}
      onLogout={handleLogout}
    >
      {renderContent()}
    </Layout>
  );
}

export default App;
