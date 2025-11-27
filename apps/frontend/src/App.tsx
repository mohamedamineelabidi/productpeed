import React, { useState, useEffect, useCallback } from 'react';
import { Search, Zap, Clock, Database, AlertCircle, Terminal, RefreshCw, Settings, Server, WifiOff, LayoutDashboard, ArrowRight, History } from 'lucide-react';
import { API_BASE_URL } from '@/config/constants';
import { Product, SearchResponse, NetworkPath, HealthResponse } from '@/types';
import NetworkVisualizer from '@/components/NetworkVisualizer';
import ProductCard from '@/components/ProductCard';
import ProductDetail from '@/components/ProductDetail';

type ViewState = 'home' | 'results' | 'dashboard' | 'product';

interface AccessLog {
  id: string;
  timestamp: string;
  action: string;
  source: string;
  latency: number;
  isCache: boolean;
}

type ApiUrlSanitizeReason = 'empty' | 'invalid' | 'protocol' | 'mongo-port' | 'mongo-protocol';

const API_URL_WARNING_MESSAGES: Record<ApiUrlSanitizeReason, string> = {
  empty: 'API URL was blank, so it fell back to the default backend.',
  invalid: 'Could not parse the API URL. Reverted to the default backend.',
  protocol: 'Only HTTP/HTTPS endpoints are supported. Reverted to the default backend.',
  'mongo-port': 'Detected a MongoDB port (27017/27018/27019); switched back to the API gateway.',
  'mongo-protocol': 'MongoDB connection strings are not valid API endpoints. Reverted to the default backend.',
};

const sanitizeApiUrl = (raw: string | null | undefined): { value: string; reason: ApiUrlSanitizeReason | null } => {
  if (!raw) {
    return { value: API_BASE_URL, reason: 'empty' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: API_BASE_URL, reason: 'empty' };
  }

  if (trimmed.startsWith('/')) {
    const normalized = trimmed.replace(/\/+$/, '');
    if (!normalized.length) {
      return { value: API_BASE_URL, reason: 'empty' };
    }
    return { value: normalized, reason: null };
  }

  try {
    const parsed = new URL(trimmed);
    if (['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
      return { value: API_BASE_URL, reason: 'mongo-protocol' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { value: API_BASE_URL, reason: 'protocol' };
    }

    if (['27017', '27018', '27019'].includes(parsed.port)) {
      return { value: API_BASE_URL, reason: 'mongo-port' };
    }

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    const normalized = parsed.toString().replace(/\/+$/, '');
    if (!normalized) {
      return { value: API_BASE_URL, reason: 'empty' };
    }

    return { value: normalized, reason: null };
  } catch (_err) {
    return { value: API_BASE_URL, reason: 'invalid' };
  }
};

const App: React.FC = () => {
  const initialApiConfig = (() => {
    try {
      const stored = localStorage.getItem('SPEEDSCALE_API_URL');
      return sanitizeApiUrl(stored ?? API_BASE_URL);
    } catch (e) {
      return { value: API_BASE_URL, reason: null };
    }
  })();

  const [apiUrl, setApiUrl] = useState<string>(initialApiConfig.value);
  const [apiUrlDraft, setApiUrlDraft] = useState<string>(initialApiConfig.value);
  const [apiUrlWarning, setApiUrlWarning] = useState<string | null>(
    initialApiConfig.reason ? API_URL_WARNING_MESSAGES[initialApiConfig.reason] : null
  );

  const applyApiUrl = useCallback(
    (raw?: string) => {
      const input = raw ?? apiUrlDraft;
      const { value: next, reason } = sanitizeApiUrl(input);
      setApiUrl(next);
      setApiUrlDraft(next);

      if (reason) {
        setApiUrlWarning(API_URL_WARNING_MESSAGES[reason]);
      } else {
        setApiUrlWarning(null);
      }

      return next;
    },
    [apiUrlDraft]
  );
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);

  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [networkPath, setNetworkPath] = useState<NetworkPath>('IDLE');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [trending, setTrending] = useState<string[]>([]);

  const [history, setHistory] = useState<AccessLog[]>(() => {
    try {
      const saved = localStorage.getItem('SPEEDSCALE_HISTORY');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('SPEEDSCALE_API_URL', apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    localStorage.setItem('SPEEDSCALE_HISTORY', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (showSettings) {
      setApiUrlDraft(apiUrl);
    }
  }, [showSettings, apiUrl]);

  const generateMockData = (searchQuery: string): SearchResponse => {
    const isCacheHit = Math.random() > 0.4;
    const count = Math.floor(Math.random() * 8) + 1;

    return {
      source: isCacheHit ? 'REDIS_CACHE ⚡ (Computer B)' : 'MONGODB_DISK 🐢 (Computer A)',
      time: isCacheHit ? `${Math.floor(Math.random() * 15) + 5}ms` : `${Math.floor(Math.random() * 300) + 150}ms`,
      cached: isCacheHit,
      count,
      data: Array(count)
        .fill(null)
        .map((_, i) => ({
          _id: `mock-${Date.now()}-${i}`,
          name: `${searchQuery} ${i === 0 ? 'Pro' : i === 1 ? 'Lite' : 'Plus'}`,
          price: parseFloat((Math.random() * 1000 + 50).toFixed(2)),
          description: `This is a simulated product description for ${searchQuery}. In demo mode, we generate random data to test the UI without backend connectivity.`,
          category: 'Demo Category',
          brand: 'SpeedScale Demo',
          inStock: Math.random() > 0.2,
          rating: parseFloat((Math.random() * 2 + 3).toFixed(1)),
          imageUrl: `https://picsum.photos/seed/${searchQuery}${i}/400/300`,
          createdAt: new Date().toISOString(),
        })),
    };
  };

  const checkHealth = useCallback(
    async (silent = false, overrideUrl?: string) => {
      if (isDemoMode) {
        setHealth({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          connections: { mongodb: true, redis: true },
          servers: {
            this_server: 'Demo Mode (Local)',
            mongodb: 'Simulated',
            redis: 'Simulated',
          },
        });
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const targetUrl = overrideUrl ?? apiUrl;
        const res = await fetch(`${targetUrl}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          setHealth(json);
          setError(null);
        } else {
          if (!silent) console.warn(`Health check status: ${res.status}`);
          setHealth(null);
        }
      } catch (err) {
        if (!silent) {
          console.warn('Health check failed - Backend unreachable', err);
        }
        setHealth(null);
      }
    },
    [apiUrl, isDemoMode]
  );

  useEffect(() => {
    checkHealth(false);
    const interval = setInterval(() => checkHealth(true), 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const fetchTrending = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const res = await fetch(`${apiUrl}/api/trending`);
      if (res.ok) {
        const data = await res.json();
        const unique = Array.from(new Set(data as string[])).slice(0, 5);
        setTrending(unique);
      }
    } catch (e) {
      /* silent */
    }
  }, [apiUrl, isDemoMode]);

  useEffect(() => {
    fetchTrending();
    const interval = setInterval(fetchTrending, 10000);
    return () => clearInterval(interval);
  }, [fetchTrending]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setNetworkPath('IDLE');

    if (currentView !== 'results') setCurrentView('results');

    try {
      let result: SearchResponse;

      if (isDemoMode) {
        await new Promise(resolve => setTimeout(resolve, 800));
        result = generateMockData(query);
      } else {
        try {
          const res = await fetch(`${apiUrl}/api/search?query=${encodeURIComponent(query)}`);
          if (!res.ok) {
            throw new Error(`Server error: ${res.status} ${res.statusText}`);
          }
          result = await res.json();
        } catch (fetchErr) {
          if (fetchErr instanceof TypeError && fetchErr.message === 'Failed to fetch') {
            throw new Error('Connection failed. Is the backend server running?');
          }
          throw fetchErr;
        }
      }

      setData(result);

      if (result.cached) {
        setNetworkPath('CACHE_HIT');
      } else {
        setNetworkPath('DB_MISS');
      }

      const ms = parseInt(result.time.replace('ms', ''), 10);

      const newLog: AccessLog = {
        id: Date.now().toString() + Math.random().toString(),
        timestamp: new Date().toISOString(),
        action: `Search: "${query}"`,
        source: result.source,
        latency: ms,
        isCache: result.cached,
      };
      setHistory(prev => [newLog, ...prev].slice(0, 50));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setNetworkPath('IDLE');
    } finally {
      setLoading(false);
    }
  };

  const handleProductClick = (id: string) => {
    setSelectedProductId(id);
    setCurrentView('product');
    setNetworkPath('IDLE');
    window.scrollTo(0, 0);
  };

  const handleBackToSearch = () => {
    setCurrentView(data ? 'results' : 'home');
    setSelectedProductId(null);
    setNetworkPath('IDLE');
  };

  const handleProductNetworkUpdate = (source: string, time: string, cached: boolean, label: string = 'Product View') => {
    setNetworkPath(cached ? 'CACHE_HIT' : 'DB_MISS');
    const ms = parseInt(time.replace('ms', ''), 10);

    const newLog: AccessLog = {
      id: Date.now().toString() + Math.random().toString(),
      timestamp: new Date().toISOString(),
      action: label,
      source,
      latency: ms,
      isCache: cached,
    };
    setHistory(prev => [newLog, ...prev].slice(0, 50));
  };

  const renderHeader = () => (
    <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('home')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">SpeedScale</span>
          {isDemoMode && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs font-bold rounded border border-amber-500/50">
              DEMO
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="flex bg-slate-800/50 rounded-lg p-1 mr-4">
            <button
              onClick={() => setCurrentView(data ? 'results' : 'home')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                ['home', 'results', 'product'].includes(currentView) ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </nav>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white relative"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
            {!health && !isDemoMode && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            )}
          </button>
        </div>
      </div>
    </header>
  );

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4">
      <div className="text-center mb-8 animate-fade-in-up">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-blue-500/20">
          <Zap className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-4">
          SpeedScale
        </h1>
        <p className="text-slate-400 text-lg max-w-md mx-auto">
          Distributed E-Commerce Search Engine powered by Redis Caching and MongoDB.
        </p>
      </div>

      <div className="w-full max-w-2xl animate-fade-in-up delay-100">
        <form onSubmit={handleSearch} className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
          <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden p-2 focus-within:border-blue-500/50 focus-within:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-all">
            <Search className="w-6 h-6 text-slate-400 ml-4" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for products..."
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 h-12 px-4 text-xl outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-12 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>
        <div className="mt-8 flex justify-center gap-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Database className="w-4 h-4" /> 100k Items
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> &lt;20ms Latency
          </span>
          <span className="flex items-center gap-1.5">
            <Server className="w-4 h-4" /> Distributed
          </span>
        </div>

        {trending.length > 0 && (
          <div className="mt-8 animate-fade-in-up delay-200">
            <p className="text-center text-slate-500 text-xs uppercase tracking-wider mb-3">Trending Now</p>
            <div className="flex flex-wrap justify-center gap-2">
              {trending.map((term, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(term);
                    handleSearch({ preventDefault: () => {} } as any);
                  }}
                  className="px-3 py-1 bg-slate-800/50 hover:bg-blue-600/20 hover:text-blue-400 border border-slate-700 rounded-full text-sm text-slate-300 transition-all"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="max-w-7xl mx-auto px-4 pt-6">
      <div className="mb-8">
        <form onSubmit={handleSearch} className="relative max-w-3xl">
          <div className="flex items-center bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden p-1 focus-within:border-blue-500/50 transition-all">
            <Search className="w-5 h-5 text-slate-400 ml-3" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 h-10 px-3 text-base outline-none"
            />
            <button type="submit" disabled={loading} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 h-9 rounded-lg text-sm font-medium transition-all">
              Search
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-800/50 rounded-xl h-80"></div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-950/30 border border-red-900/50 p-6 rounded-xl flex flex-col gap-4 text-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-lg">Search Failed</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
          <div className="ml-9">
            <p className="text-sm text-red-300/60 mb-3">
              The backend at <span className="font-mono bg-red-950 px-1 rounded">{apiUrl}</span> is unreachable.
            </p>
            <button
              onClick={() => {
                setIsDemoMode(true);
                handleSearch({ preventDefault: () => {} } as any);
              }}
              className="px-4 py-2 bg-red-900 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Enable Demo Mode & Retry
            </button>
          </div>
        </div>
      ) : data ? (
        <div className="animate-fade-in-up">
          <div className="flex items-center gap-4 mb-6 text-sm">
            <div
              className={`px-3 py-1 rounded-full border flex items-center gap-2 ${
                data.cached ? 'bg-red-950/30 border-red-500/30 text-red-400' : 'bg-green-950/30 border-green-500/30 text-green-400'
              }`}
            >
              {data.cached ? <Zap className="w-3 h-3" /> : <Database className="w-3 h-3" />}
              <span className="font-mono">{data.time}</span>
            </div>
            <span className="text-slate-500">Found {data.count} results via {data.source}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-20">
            {data.data.map(product => (
              <ProductCard key={product._id} product={product} onClick={() => handleProductClick(product._id)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-slate-500 py-20">No results to display. Try searching for something.</div>
      )}
    </div>
  );

  const renderDashboard = () => (
    <div className="max-w-7xl mx-auto px-4 pt-8 animate-fade-in-up pb-20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-500" />
          System Dashboard
        </h2>
        <div className="flex gap-3">
          {health && (
            <span className="text-xs text-slate-500 font-mono bg-slate-900 px-3 py-1 rounded-full border border-slate-800 flex items-center gap-2">
              <Server className="w-3 h-3" />
              {health.servers.this_server}
            </span>
          )}
          <button onClick={() => setHistory([])} className="text-xs text-red-400 hover:text-red-300 underline">
            Clear History
          </button>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4 text-sm text-slate-400">
          <Terminal className="w-4 h-4" />
          <span>Live Network Topology</span>
        </div>
        <NetworkVisualizer path={networkPath} loading={loading || (currentView === 'product' && networkPath === 'IDLE' && !selectedProductId)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Cluster Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-300">
                <Server className="w-4 h-4" /> API Gateway
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono text-green-400 bg-green-950/30 px-2 py-1 rounded border border-green-900/50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> ONLINE
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-300">
                <Zap className="w-4 h-4" /> Redis Cache
              </span>
              <span
                className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded border ${
                  health?.connections.redis ? 'text-green-400 bg-green-950/30 border-green-900/50' : 'text-red-400 bg-red-950/30 border-red-900/50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${health?.connections.redis ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {health?.connections.redis ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-300">
                <Database className="w-4 h-4" /> MongoDB
              </span>
              <span
                className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded border ${
                  health?.connections.mongodb ? 'text-green-400 bg-green-950/30 border-green-900/50' : 'text-yellow-400 bg-yellow-950/30 border-yellow-900/50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${health?.connections.mongodb ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {health?.connections.mongodb ? 'ONLINE' : 'DISCONNECTED'}
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Response Latency History</h3>
          {history.length > 0 ? (
            <div className="h-32 flex items-end gap-1">
              {[...history]
                .reverse()
                .slice(0, 20)
                .reverse()
                .map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end group relative">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-500 ${
                        h.isCache ? 'bg-red-500/60 hover:bg-red-400' : 'bg-green-500/60 hover:bg-green-400'
                      }`}
                      style={{ height: `${Math.min(100, Math.max(10, (h.latency / 200) * 100))}%` }}
                    ></div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-xs p-2 rounded border border-slate-700 whitespace-nowrap z-10 shadow-xl">
                      {h.latency}ms ({h.isCache ? 'Cache' : 'DB'})
                      <div className="text-[10px] text-slate-400">{h.action}</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-600 text-sm">No recent requests recorded.</div>
          )}
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-slate-100 font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" />
            Search & Access History
          </h3>
          <span className="text-xs text-slate-500">{history.length} Events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {history.length > 0 ? (
                history.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-200">{log.action}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold border ${
                          log.isCache
                            ? 'bg-red-950/30 border-red-500/30 text-red-400'
                            : 'bg-green-950/30 border-green-500/30 text-green-400'
                        }`}
                      >
                        {log.isCache ? <Zap className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                        {log.isCache ? 'REDIS' : 'MONGO'}
                      </span>
                      <span className="ml-2 text-slate-500 text-xs truncate max-w-[150px] inline-block align-bottom">
                        {log.source.split('(')[0]}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-mono font-bold ${
                        log.latency < 50 ? 'text-green-400' : log.latency < 150 ? 'text-yellow-400' : 'text-red-400'
                      }`}
                    >
                      {log.latency}ms
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No activity recorded in this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative">
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-500" />
              Configuration
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Backend API URL</label>
                <input
                  type="text"
                  value={apiUrlDraft}
                  onChange={e => setApiUrlDraft(e.target.value)}
                  disabled={isDemoMode}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none disabled:opacity-50"
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    onClick={() => {
                      const next = applyApiUrl('http://127.0.0.1:3000');
                      checkHealth(false, next);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                  >
                    Node (Local)
                  </button>
                  <button
                    onClick={() => {
                      const next = applyApiUrl('http://127.0.0.1:8000');
                      checkHealth(false, next);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors border border-yellow-600/30 text-yellow-500"
                  >
                    Python (Local)
                  </button>
                  <button
                    onClick={() => {
                      const next = applyApiUrl(API_BASE_URL);
                      checkHealth(false, next);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                  >
                    Default (192.168...)
                  </button>
                </div>
                {apiUrlWarning && <p className="mt-2 text-xs text-amber-400">{apiUrlWarning}</p>}
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div>
                  <p className="font-medium">Demo Mode</p>
                  <p className="text-xs text-slate-400">Simulate backend responses</p>
                </div>
                <button
                  onClick={() => setIsDemoMode(!isDemoMode)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${isDemoMode ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  <div
                    className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                      isDemoMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  const next = applyApiUrl();
                  setShowSettings(false);
                  checkHealth(false, next);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {renderHeader()}

      <main>
        {!health && !isDemoMode && !loading && currentView !== 'home' && (
          <div className="max-w-7xl mx-auto px-4 mt-4 mb-4 animate-fade-in-up">
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl flex items-center gap-4">
              <WifiOff className="w-6 h-6 text-red-400" />
              <div className="flex-1">
                <h3 className="font-bold text-red-200">Backend Unavailable</h3>
                <p className="text-sm text-red-300/80">Using {apiUrl}</p>
              </div>
              <button onClick={() => setIsDemoMode(true)} className="px-4 py-2 bg-red-900/50 text-red-200 rounded-lg text-sm font-medium hover:bg-red-800 transition-colors">
                Enable Demo
              </button>
            </div>
          </div>
        )}

        {currentView === 'home' && renderHome()}
        {currentView === 'results' && renderResults()}
        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'product' && selectedProductId && (
          <div className="max-w-7xl mx-auto px-4 pt-8">
            <ProductDetail
              productId={selectedProductId}
              apiUrl={apiUrl}
              isDemoMode={isDemoMode}
              onBack={handleBackToSearch}
              onNetworkUpdate={handleProductNetworkUpdate}
              onProductSelect={handleProductClick}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
