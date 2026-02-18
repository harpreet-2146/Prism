import { useState, useEffect } from 'react';
import { documentsAPI } from '../lib/api';

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await documentsAPI.list();
      const docs = response.data?.data?.documents || response.data?.documents || [];
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const uploadDocument = async (file) => {
    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('document', file);

      const response = await documentsAPI.upload(
        formData,
        (progress) => setUploadProgress(progress)
      );

      console.log('Upload response:', response.data);

      // Force immediate refresh
      await fetchDocuments();

      setUploadProgress(0);
      setUploading(false);

      return response.data;
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadProgress(0);
      setUploading(false);
      throw error;
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      await documentsAPI.delete(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    } catch (error) {
      console.error('Delete failed:', error);
      throw error;
    }
  };

  return {
    documents,
    loading,
    uploading,
    uploadProgress,
    fetchDocuments,
    uploadDocument,
    deleteDocument
  };
};