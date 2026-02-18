// frontend/src/components/documents/DocumentCard.jsx

import React from 'react';
import { FileText, Trash2, Eye, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const DocumentCard = ({ document, onDelete, onClick }) => {
  const {
    id,
    originalName,
    pageCount,
    imageCount,
    status,
    embeddingStatus,
    sapModule,
    tcodes,
    createdAt,
    _count
  } = document;

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (status === 'completed' && embeddingStatus === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
          <CheckCircle className="w-3 h-3" />
          Ready
        </span>
      );
    }

    if (status === 'processing' || embeddingStatus === 'processing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    }

    if (status === 'failed' || embeddingStatus === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
        <Loader2 className="w-3 h-3 animate-spin" />
        Pending
      </span>
    );
  };

  const getOCRStatusBadge = () => {
    if (!imageCount || imageCount === 0) return null;

    const ocrComplete = _count?.images || 0;
    const percentage = Math.round((ocrComplete / imageCount) * 100);

    if (percentage === 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
          <Eye className="w-3 h-3" />
          OCR: {ocrComplete}/{imageCount}
        </span>
      );
    }

    if (percentage > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
          <Eye className="w-3 h-3" />
          OCR: {percentage}%
        </span>
      );
    }

    return null;
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    
    if (window.confirm(`Delete "${originalName}"?`)) {
      onDelete(id);
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {originalName}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClick && (
            <button
              onClick={onClick}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="View document"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          
          <button
            onClick={handleDelete}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete document"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {getStatusBadge()}
        {getOCRStatusBadge()}
        
        {sapModule && (
          <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
            {sapModule}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
        <div>
          <div className="text-xs text-gray-500">Pages</div>
          <div className="text-sm font-semibold text-gray-800">
            {pageCount || '—'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-500">Images</div>
          <div className="text-sm font-semibold text-gray-800">
            {imageCount || '—'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-500">Embeddings</div>
          <div className="text-sm font-semibold text-gray-800">
            {_count?.embeddings || '—'}
          </div>
        </div>
      </div>

      {/* TCodes */}
      {tcodes && tcodes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Transaction Codes</div>
          <div className="flex flex-wrap gap-1">
            {tcodes.slice(0, 5).map((tcode, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
              >
                {tcode}
              </span>
            ))}
            {tcodes.length > 5 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                +{tcodes.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentCard;