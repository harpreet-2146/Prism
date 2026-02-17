import { useState, useCallback } from 'react';
import { documentsAPI } from '@lib/api';

export function useDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await documentsAPI.getAll();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Upload document
  const uploadDocument = useCallback(async file => {
    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      const { data } = await documentsAPI.upload(formData);

      // Add to list
      setDocuments(prev => [data.document, ...prev]);
      setUploadProgress(100);

      return data.document;
    } catch (error) {
      console.error('Failed to upload document:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, []);

  // Delete document
  const deleteDocument = useCallback(async documentId => {
    try {
      await documentsAPI.delete(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }, []);

  // Get document preview
  const getDocumentPreview = useCallback(async documentId => {
    try {
      const { data } = await documentsAPI.getPreview(documentId);
      return data.preview;
    } catch (error) {
      console.error('Failed to get document preview:', error);
      throw error;
    }
  }, []);

  return {
    documents,
    loading,
    uploading,
    uploadProgress,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
    getDocumentPreview
  };
}