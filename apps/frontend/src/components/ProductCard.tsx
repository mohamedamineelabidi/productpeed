import React from 'react';
import { Star, ShoppingCart, Tag } from 'lucide-react';
import { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onClick?: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`group bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative h-48 overflow-hidden bg-slate-900">
        <img
          src={product.imageUrl || `https://picsum.photos/seed/${product._id}/400/300`}
          alt={product.name}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
        />
        <div className="absolute top-2 right-2 bg-slate-900/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold text-white border border-slate-700 flex items-center gap-1">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          {product.rating}
        </div>
        {!product.inStock && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <span className="text-red-400 font-bold border border-red-500 px-3 py-1 rounded rotate-[-12deg]">OUT OF STOCK</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-xs text-blue-400 font-medium mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {product.category}
            </p>
            <h3 className="font-bold text-slate-100 line-clamp-1 group-hover:text-blue-400 transition-colors">{product.name}</h3>
          </div>
        </div>

        <p className="text-sm text-slate-400 line-clamp-2 mb-4 h-10">{product.description}</p>

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-700/50">
          <div>
            <span className="text-xs text-slate-500 block">Price</span>
            <span className="text-lg font-bold text-white">${product.price.toFixed(2)}</span>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors group-hover:scale-110 duration-200">
            <ShoppingCart className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
          <span>{product.brand}</span>
          <span className="font-mono">ID: {product._id.slice(-6)}</span>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
