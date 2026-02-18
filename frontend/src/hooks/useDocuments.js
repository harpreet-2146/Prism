// frontend/src/hooks/useDocuments.js

import { useState, useEffect, useCallback } from 'react';
import { documentsAPI } from '../lib/api';

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await documentsAPI.getAll();
      setDocuments(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  // Upload document with progress tracking
  const uploadDocument = useCallback(async (file, onProgress) => {
    setError(null);

    try {
      // Upload file
      const uploadResponse = await documentsAPI.upload(file, (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        
        if (onProgress) {
          onProgress({
            type: 'upload',
            progress: Math.min(percentCompleted, 20), // Upload is 0-20%
            stage: 'uploading',
            status: 'processing'
          });
        }
      });

      const document = uploadResponse.data.data;

      // Start SSE stream for processing status
      const eventSource = documentsAPI.streamStatus(
        document.id,
        (progressData) => {
          // Progress update
          if (onProgress) {
            onProgress(progressData);
          }
        },
        (completeData) => {
          // Processing complete
          if (onProgress) {
            onProgress(completeData);
          }
          // Refresh documents list
          fetchDocuments();
        },
        (errorData) => {
          // Processing error
          console.error('Document processing error:', errorData);
          setError(errorData.error || 'Processing failed');
          fetchDocuments();
        }
      );

      return { document, eventSource };

    } catch (err) {
      console.error('Upload failed:', err);
      const errorMsg = err.response?.data?.error || 'Upload failed';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [fetchDocuments]);

  // Delete document
  const deleteDocument = useCallback(async (documentId) => {
    setError(null);

    try {
      await documentsAPI.delete(documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      return true;
    } catch (err) {
      console.error('Delete failed:', err);
      setError(err.response?.data?.error || 'Failed to delete document');
      return false;
    }
  }, []);

  // Get document by ID
  const getDocument = useCallback(async (documentId) => {
    setLoading(true);
    setError(null);

    try {
      const response = await documentsAPI.getById(documentId);
      return response.data.data;
    } catch (err) {
      console.error('Failed to fetch document:', err);
      setError(err.response?.data?.error || 'Failed to load document');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load documents on mount
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    loading,
    error,
    uploadDocument,
    deleteDocument,
    getDocument,
    refreshDocuments: fetchDocuments,
  };
};

export default useDocuments;