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
	                <div className="mb-2 text-xs text-gray-500">
	                  <span className="font-medium">Status:</span> {doc.status || 'unknown'} {' • '}
	                  <span className="font-medium">Embeddings:</span> {doc.embeddingStatus || 'unknown'} {' • '}
	                  <span className="font-medium">Images:</span> {getLiveImageCount(doc)}
	                </div>

	                {isProcessingForChat(doc) && (
	                  <div>
	                    <div className="flex items-center text-blue-600 mb-2">
	                      <Loader2 className="animate-spin rounded-full h-4 w-4 mr-2" />
	                      <span className="text-sm font-medium">Processing...</span>
	                    </div>
	                    <div className="w-full bg-gray-200 rounded-full h-2">
	                      <div
	                        className="bg-blue-600 h-2 rounded-full transition-all"
	                        style={{ width: `${calculateProgress(doc)}%` }}
	                      />
	                    </div>
	                  </div>
	                )}

	                {doc.status === 'pending' && (
	                  <div className="flex items-center text-yellow-600">
	                    <Loader2 className="animate-spin rounded-full h-4 w-4 mr-2" />
	                    <span className="text-sm">Queued for processing...</span>
	                  </div>
	                )}

	                {isReadyToChat(doc) ? (
	                  <div className="flex items-center text-green-600">
	                    <CheckCircle className="w-4 h-4 mr-2" />
	                    <span className="text-sm">Ready to chat!</span>
	                  </div>
	                ) : null}

	                {doc.status === 'failed' && (
                  <div className="flex items-center text-red-600">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">Processing failed</span>
                    {doc.processingError && (
                      <span className="text-xs ml-2">({doc.processingError})</span>
                    )}
	                  </div>
	                )}

	                <div className="mt-3 space-y-1 text-xs text-gray-600">
	                  <div><span className="font-medium">Text Extraction:</span> {getTextExtractionLabel(doc)}</div>
	                  <div><span className="font-medium">Embeddings:</span> {getEmbeddingsLabel(doc)}</div>
	                  <div>{getScreensLabel(doc)}</div>
	                  <div><span className="font-medium">OCR:</span> {getOCRLabel(doc)}</div>
	                </div>
	              </div>

              {/* Stats */}
              {isReadyToChat(doc) && (
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
  if (isReadyToChat(doc)) return 100;
  if (doc.status === 'failed' || doc.embeddingStatus === 'failed') return 0;
  
  let progress = 0;
  
  if (doc.status === 'processing' || doc.status === 'completed') progress += 40;
  if (doc.imageCount > 0) progress += 30;
  if (doc.embeddingStatus === 'processing') progress += 10;
  if (doc.embeddingStatus === 'completed') progress += 20;
  
  return Math.min(progress, 95);
}

function isProcessingForChat(doc) {
  return (
    !isReadyToChat(doc) &&
    doc.status !== 'failed' &&
    doc.embeddingStatus !== 'failed'
  );
}

function isReadyToChat(doc) {
  const statusDone = doc.status === 'completed';
  const embeddingDone = doc.embeddingStatus === 'completed';
  return statusDone && embeddingDone;
}

function getTextExtractionLabel(doc) {
  if (doc.status === 'failed') return 'Failed';
  if (doc.status === 'completed') return 'Completed';
  if (doc.status === 'processing') return 'In Progress';
  return 'Pending';
}

function getEmbeddingsLabel(doc) {
  if (doc.embeddingStatus === 'failed') return 'Failed';
  if (doc.embeddingStatus === 'completed') return 'Completed';
  if (doc.embeddingStatus === 'processing') return 'In Progress';
  return 'Pending';
}

function getScreensLabel(doc) {
  const liveImageCount = getLiveImageCount(doc);
  if (liveImageCount > 0) return `Screens: ${liveImageCount}`;
  return 'Extracting Screens...';
}

function getOCRLabel(doc) {
  const images = Array.isArray(doc.images) ? doc.images : [];
  if (!images.length) return 'Waiting for screens';

  const completed = images.filter((img) => img.ocrStatus === 'completed').length;
  if (completed >= images.length) return `Completed (${completed}/${images.length})`;
  if (completed > 0) return `In Progress (${completed}/${images.length})`;
  return `Pending (0/${images.length})`;
}

function getLiveImageCount(doc) {
  const directImageCount = Number(doc?.imageCount || 0);
  const relatedImageCount = Array.isArray(doc?.images) ? doc.images.length : 0;
  const countedImages = Number(doc?._count?.images || 0);
  return Math.max(directImageCount, relatedImageCount, countedImages);
}

export default DocumentList;
