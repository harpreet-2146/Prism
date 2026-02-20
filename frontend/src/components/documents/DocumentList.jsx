import { formatDistanceToNow } from 'date-fns';
import { FileText, Trash2, Eye, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const DocumentList = ({ documents = [], loading = false, onDelete }) => {
  if (loading) {
    return <div className="text-center py-8">Loading documents...</div>;
  }

  if (!Array.isArray(documents) || documents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No documents uploaded yet.</p>
        <p className="text-sm mt-2">Upload a PDF to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map(doc => (
        <div
          key={doc.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
        >
          <div className="flex items-start justify-between">
            {/* Document Info */}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{doc.originalName}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                {doc.pageCount && ` • ${doc.pageCount} pages`}
                {doc.imageCount && ` • ${doc.imageCount} images`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
              </p>

              {/* Status Indicator */}
              <div className="mt-3">
                {doc.status === 'pending' && (
                  <div className="flex items-center text-yellow-600">
                    <Loader2 className="animate-spin rounded-full h-4 w-4 mr-2" />
                    <span className="text-sm">Queued for processing...</span>
                  </div>
                )}

                {doc.status === 'processing' && (
                  <div>
                    <div className="flex items-center text-blue-600 mb-2">
                      <Loader2 className="animate-spin rounded-full h-4 w-4 mr-2" />
                      <span className="text-sm font-medium">Processing...</span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${calculateProgress(doc)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Extracting text and images, running OCR, creating embeddings...
                    </p>
                  </div>
                )}

                {doc.status === 'completed' && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">Ready to chat!</span>
                  </div>
                )}

                {doc.status === 'failed' && (
                  <div className="flex items-center text-red-600">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">Processing failed</span>
                    {doc.processingError && (
                      <span className="text-xs ml-2">({doc.processingError})</span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats */}
              {doc.status === 'completed' && (
                <div className="mt-3 flex gap-4 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Embeddings:</span> {doc._count?.embeddings || 0}
                  </div>
                  <div>
                    <span className="font-medium">Images:</span> {doc._count?.images || 0}
                  </div>
                </div>
              )}
            </div>

            {/* Delete Button */}
            <button
              onClick={() => onDelete(doc.id)}
              className="ml-4 p-2 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete document"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper function to estimate progress
function calculateProgress(doc) {
  if (doc.status === 'completed') return 100;
  if (doc.status === 'failed') return 0;
  
  let progress = 0;
  
  if (doc.textContent) progress += 25;
  if (doc.imageCount > 0) progress += 25;
  if (doc.embeddingStatus === 'processing') progress += 25;
  if (doc.embeddingStatus === 'completed') progress += 25;
  
  return Math.min(progress, 95);
}

export default DocumentList;