export interface Product {
  _id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  brand: string;
  inStock: boolean;
  rating: number;
  imageUrl: string;
  createdAt: string;
}

export interface SearchResponse {
  source: string;
  time: string;
  cached: boolean;
  count: number;
  data: Product[];
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  connections: {
    mongodb: boolean;
    redis: boolean;
  };
  servers: {
    this_server: string;
    mongodb: string;
    redis: string;
  };
}

export type NetworkPath = 'IDLE' | 'CACHE_HIT' | 'DB_MISS';
