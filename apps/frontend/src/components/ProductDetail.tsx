import React, { useEffect, useState } from 'react';
import { ArrowLeft, Star, ShoppingCart, Tag, Clock, Database, Share2, Heart, AlertCircle } from 'lucide-react';
import { Product } from '@/types';
import ProductCard from './ProductCard';

interface ProductDetailProps {
  productId: string;
  apiUrl: string;
  isDemoMode: boolean;
  onBack: () => void;
  onNetworkUpdate: (source: string, time: string, cached: boolean, label: string) => void;
  onProductSelect: (id: string) => void;
}

const ProductDetail: React.FC<ProductDetailProps> = ({
  productId,
  apiUrl,
  isDemoMode,
  onBack,
  onNetworkUpdate,
  onProductSelect,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ source: string; time: string; cached: boolean } | null>(null);

  const getMockProduct = (id: string): Product => ({
    _id: id,
    name: `SpeedScale Ultra ${id.slice(-4)}`,
    price: 299.99,
    description:
      'Experience the power of distributed systems with this premium demo product. Features include high availability, fault tolerance, and eventual consistency.',
    category: 'Electronics',
    brand: 'SpeedScale Tech',
    inStock: true,
    rating: 4.8,
    imageUrl: `https://picsum.photos/seed/${id}/800/600`,
    createdAt: new Date().toISOString(),
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setProduct(null);
      setSimilar([]);

      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 600));
          const mockProd = getMockProduct(productId);
          setProduct(mockProd);
          setSimilar(Array(4).fill(null).map((_, i) => getMockProduct(`sim-${productId}-${i}`)));
          const mockMeta = { source: 'DEMO_MEMORY', time: '12ms', cached: true };
          setMeta(mockMeta);
          onNetworkUpdate(mockMeta.source, mockMeta.time, mockMeta.cached, `View: ${mockProd.name}`);
        } else {
          const res = await fetch(`${apiUrl}/api/products/${productId}`);
          if (!res.ok) throw new Error('Product not found');
          const json = await res.json();

          setProduct(json.data);
          const productMeta = { source: json.source, time: json.time, cached: json.cached };
          setMeta(productMeta);
          onNetworkUpdate(json.source, json.time, json.cached, `View: ${json.data.name}`);

          fetch(`${apiUrl}/api/products/${productId}/similar`)
            .then(r => r.json())
            .then(simJson => setSimilar(simJson.data))
            .catch(e => console.warn('Failed to load similar items', e));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, apiUrl, isDemoMode]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] animate-pulse">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400">Retrieving product data from cluster...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <AlertCircle className="w-16 h-16 mb-4 text-red-500 opacity-50" />
        <h2 className="text-xl font-bold text-white">Product Not Found</h2>
        <button onClick={onBack} className="mt-4 text-blue-400 hover:underline">
          Return to Search
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 group transition-colors">
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        Back to Results
      </button>

      {meta && (
        <div
          className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg border mb-6 text-sm font-mono ${
            meta.cached ? 'bg-red-950/30 border-red-500/30 text-red-300' : 'bg-green-950/30 border-green-500/30 text-green-300'
          }`}
        >
          {meta.cached ? <Clock className="w-4 h-4" /> : <Database className="w-4 h-4" />}
          <span>Fetched from {meta.source} in {meta.time}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        <div className="space-y-4">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shadow-2xl">
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              <Tag className="w-4 h-4" />
              {product.category}
            </span>
            <div className="flex gap-2">
              <button className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
                <Share2 className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-pink-500 transition-colors">
                <Heart className="w-5 h-5" />
              </button>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{product.name}</h1>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-lg border border-yellow-400/20">
              <Star className="w-4 h-4 fill-current" />
              <span className="font-bold">{product.rating}</span>
            </div>
            <span className="text-slate-500">|</span>
            <span className={product.inStock ? 'text-green-400' : 'text-red-400'}>{product.inStock ? 'In Stock' : 'Out of Stock'}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400 font-mono text-sm">ID: {product._id.slice(-6)}</span>
          </div>

          <div className="prose prose-invert max-w-none text-slate-300 mb-8 leading-relaxed">{product.description}</div>

          <div className="mt-auto pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Price</p>
                <p className="text-4xl font-bold text-white">${product.price.toFixed(2)}</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-slate-500 mb-1">Brand</p>
                <p className="text-lg text-slate-200">{product.brand}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-14 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all hover:shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-[0.98]">
                <ShoppingCart className="w-6 h-6" />
                Add to Cart
              </button>
              <button className="px-6 border border-slate-600 hover:border-slate-400 rounded-xl font-medium transition-colors">
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <div className="border-t border-slate-800 pt-12">
          <h3 className="text-2xl font-bold text-white mb-6">Similar Products</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {similar.map(item => (
              <div key={item._id} onClick={() => onProductSelect(item._id)}>
                <ProductCard product={item} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
