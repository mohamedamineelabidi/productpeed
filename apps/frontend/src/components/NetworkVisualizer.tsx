import React from 'react';
import { Database, Server, Cpu, Activity } from 'lucide-react';
import { NODES } from '@/config/constants';
import { NetworkPath } from '@/types';

interface NetworkVisualizerProps {
  path: NetworkPath;
  loading: boolean;
}

const NetworkVisualizer: React.FC<NetworkVisualizerProps> = ({ path, loading }) => {
  const getOpacity = (node: 'A' | 'B' | 'C') => {
    if (!loading && path === 'IDLE') return 'opacity-100';
    if (loading) return 'opacity-100';

    if (path === 'CACHE_HIT') {
      return node === 'A' ? 'opacity-30 blur-[1px] transition-all duration-500' : 'opacity-100 scale-105 transition-all duration-300';
    }
    if (path === 'DB_MISS') {
      return node === 'B' ? 'opacity-30 blur-[1px] transition-all duration-500' : 'opacity-100 scale-105 transition-all duration-300';
    }
    return 'opacity-100';
  };

  const getLineClass = (route: 'C-A' | 'C-B') => {
    const base = 'absolute top-1/2 h-1 bg-slate-700 -z-10 transition-all duration-300';

    if (loading) return `${base} animate-pulse bg-blue-500`;

    if (path === 'CACHE_HIT' && route === 'C-B') return `${base} bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]`;
    if (path === 'DB_MISS' && route === 'C-A') return `${base} bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]`;

    return base;
  };

  return (
    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-8 mb-8 relative overflow-hidden backdrop-blur-sm">
      <div className="absolute inset-0 bg-grid-slate-800/[0.2] bg-[bottom_1px_center]" style={{ backgroundSize: '24px 24px' }}></div>

      <div className="relative z-10 flex justify-between items-center max-w-5xl mx-auto min-h-[160px]">
        <div className={`${getLineClass('C-A')} left-[16%] right-[50%] origin-right`} />
        <div className={`${getLineClass('C-B')} left-[50%] right-[16%] origin-left`} />

        <div className={`flex flex-col items-center gap-3 w-1/3 ${getOpacity('A')}`}>
          <div className={`relative w-24 h-24 rounded-2xl bg-slate-900 border-2 ${NODES.A.borderColor} flex items-center justify-center shadow-xl`}>
            <Database className={`w-10 h-10 ${NODES.A.color}`} />
            <div className="absolute -top-3 -right-3 bg-slate-800 text-xs px-2 py-1 rounded-full border border-slate-700">100k Items</div>
          </div>
          <div className="text-center">
            <h3 className={`font-bold ${NODES.A.color}`}>{NODES.A.name}</h3>
            <p className="text-xs text-slate-400">{NODES.A.role}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">{NODES.A.ip}</p>
          </div>
        </div>

        <div className={`flex flex-col items-center gap-3 w-1/3 ${getOpacity('C')}`}>
          <div className={`relative w-28 h-28 rounded-2xl bg-slate-900 border-4 ${NODES.C.borderColor} flex items-center justify-center shadow-2xl z-20`}>
            {loading ? (
              <Activity className={`w-12 h-12 ${NODES.C.color} animate-spin`} />
            ) : (
              <Server className={`w-12 h-12 ${NODES.C.color}`} />
            )}
            <div className="absolute -bottom-4 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">
              YOU ARE HERE
            </div>
          </div>
          <div className="text-center mt-2">
            <h3 className={`font-bold ${NODES.C.color} text-lg`}>{NODES.C.name}</h3>
            <p className="text-xs text-slate-400">{NODES.C.role}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">{NODES.C.ip}</p>
          </div>
        </div>

        <div className={`flex flex-col items-center gap-3 w-1/3 ${getOpacity('B')}`}>
          <div className={`relative w-24 h-24 rounded-2xl bg-slate-900 border-2 ${NODES.B.borderColor} flex items-center justify-center shadow-xl`}>
            <Cpu className={`w-10 h-10 ${NODES.B.color}`} />
            <div className="absolute -top-3 -left-3 bg-slate-800 text-xs px-2 py-1 rounded-full border border-slate-700">Cache/ML</div>
          </div>
          <div className="text-center">
            <h3 className={`font-bold ${NODES.B.color}`}>{NODES.B.name}</h3>
            <p className="text-xs text-slate-400">{NODES.B.role}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">{NODES.B.ip}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkVisualizer;
