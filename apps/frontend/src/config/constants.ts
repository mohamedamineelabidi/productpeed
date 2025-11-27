// Core frontend configuration for networking and node metadata.
const resolveDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }
  return 'http://localhost:8000';
};

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? resolveDefaultApiBaseUrl();

export const NODES = {
  A: {
    name: 'Computer A',
    role: 'Data Node (MongoDB)',
    ip: '192.168.1.100',
    color: 'text-green-400',
    borderColor: 'border-green-500/50',
  },
  B: {
    name: 'Computer B',
    role: 'Compute Node (Redis/ML)',
    ip: '192.168.1.101',
    color: 'text-red-400',
    borderColor: 'border-red-500/50',
  },
  C: {
    name: 'Computer C',
    role: 'Gateway Node (API)',
    ip: '192.168.1.102',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/50',
  },
} as const;
