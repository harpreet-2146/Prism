// frontend/src/hooks/useDocuments.js

import { useState, useEffect, useCallback, useRef } from 'react';
import { documentsAPI } from '../lib/api';

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Track active polling intervals
  const pollingIntervalsRef = useRef({});

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

  // Poll for document status updates
  const pollDocumentStatus = useCallback((documentId) => {
    // Clear existing interval if any
    if (pollingIntervalsRef.current[documentId]) {
      clearInterval(pollingIntervalsRef.current[documentId]);
    }

    const interval = setInterval(async () => {
      try {
        const response = await documentsAPI.getById(documentId);
        const updatedDoc = response.data.data;

        // Update document in state
        setDocuments(prev =>
          prev.map(doc => doc.id === documentId ? updatedDoc : doc)
        );

        // Stop polling when completed or failed
        if (updatedDoc.status === 'completed' || updatedDoc.status === 'failed') {
          clearInterval(interval);
          delete pollingIntervalsRef.current[documentId];
        }
      } catch (err) {
        console.error('Failed to poll document status:', err);
        clearInterval(interval);
        delete pollingIntervalsRef.current[documentId];
      }
    }, 3000); // Poll every 3 seconds

    // Store interval ID
    pollingIntervalsRef.current[documentId] = interval;

    return interval;
  }, []);

  // Upload document with progress tracking
  const uploadDocument = useCallback(async (file, onProgress) => {
    setIsUploading(true);
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
            progress: percentCompleted,
            stage: 'uploading'
          });
        }
      });

      const newDocument = uploadResponse.data.data;

      // ✅ CRITICAL: Add document to state immediately
      setDocuments(prev => [newDocument, ...prev]);

      // ✅ Start polling for status updates
      pollDocumentStatus(newDocument.id);

      // ✅ Notify upload complete
      if (onProgress) {
        onProgress({
          type: 'processing',
          progress: 0,
          stage: 'Processing started'
        });
      }

      return { document: newDocument };

    } catch (err) {
      console.error('Upload failed:', err);
      const errorMsg = err.response?.data?.error || 'Upload failed';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsUploading(false);
    }
  }, [pollDocumentStatus]);

  // Delete document
  const deleteDocument = useCallback(async (documentId) => {
    setError(null);

    try {
      // Stop polling if active
      if (pollingIntervalsRef.current[documentId]) {
        clearInterval(pollingIntervalsRef.current[documentId]);
        delete pollingIntervalsRef.current[documentId];
      }

      await documentsAPI.delete(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      return true;
    } catch (err) {
      console.error('Delete failed:', err);
      setError(err.response?.data?.error || 'Failed to delete document');
      return false;
    }
  }, []);

  // Get document by ID
  const getDocument = useCallback(async (documentId) => {
    setError(null);

    try {
      const response = await documentsAPI.getById(documentId);
      return response.data.data;
    } catch (err) {
      console.error('Failed to fetch document:', err);
      setError(err.response?.data?.error || 'Failed to load document');
      return null;
    }
  }, []);

  // Load documents on mount
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Check for processing documents and start polling
  useEffect(() => {
    const processingDocs = documents.filter(
      doc => doc.status === 'pending' || doc.status === 'processing'
    );

    processingDocs.forEach(doc => {
      if (!pollingIntervalsRef.current[doc.id]) {
        pollDocumentStatus(doc.id);
      }
    });
  }, [documents, pollDocumentStatus]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervalsRef.current).forEach(clearInterval);
    };
  }, []);

  return {
    documents,
    loading,
    error,
    isUploading,
    uploadDocument,
    deleteDocument,
    getDocument,
    refreshDocuments: fetchDocuments,
  };
};

export default useDocuments;