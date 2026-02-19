import { useDocuments } from '../../hooks/useDocuments';

const DocumentList = () => {
  const { documents, loading, deleteDocument } = useDocuments();

  if (loading) {
    return <div className="text-center py-8">Loading documents...</div>;
  }

  if (documents.length === 0) {
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

              {/* ✅ ADD: Status Indicator */}
              <div className="mt-3">
                {doc.status === 'pending' && (
                  <div className="flex items-center text-yellow-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2" />
                    <span className="text-sm">Queued for processing...</span>
                  </div>
                )}

                {doc.status === 'processing' && (
                  <div>
                    <div className="flex items-center text-blue-600 mb-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
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
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm">Ready to chat!</span>
                  </div>
                )}

                {doc.status === 'failed' && (
                  <div className="flex items-center text-red-600">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm">Processing failed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => deleteDocument(doc.id)}
              className="ml-4 p-2 text-gray-400 hover:text-red-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
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
  
  // Estimate based on what's done
  let progress = 0;
  
  if (doc.textContent) progress += 25; // Text extracted
  if (doc.imageCount > 0) progress += 25; // Images extracted
  if (doc.embeddingStatus === 'processing') progress += 25; // Embeddings in progress
  if (doc.embeddingStatus === 'completed') progress += 25; // Embeddings done
  
  return Math.min(progress, 95); // Cap at 95 until fully complete
}

export default DocumentList;