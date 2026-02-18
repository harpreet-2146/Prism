import { useState, useEffect, useCallback } from 'react';
import { documentsAPI } from '../lib/api';

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await documentsAPI.list();
      const docs = response.data?.data?.documents || response.data?.documents || [];
      console.log('✅ Fetched documents:', docs);
      setDocuments(docs);
    } catch (error) {
      console.error('❌ Failed to fetch documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(async (file) => {
    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('document', file);

      console.log('📤 Uploading:', file.name);

      const response = await documentsAPI.upload(
        formData,
        (progress) => {
          console.log('📊 Upload progress:', progress);
          setUploadProgress(progress);
        }
      );

      console.log('✅ Upload complete:', response.data);

      // Wait a moment for backend processing
      setTimeout(async () => {
        await fetchDocuments();
        setUploadProgress(0);
        setUploading(false);
      }, 1000);

    } catch (error) {
      console.error('❌ Upload failed:', error);
      setUploadProgress(0);
      setUploading(false);
      throw error;
    }
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (documentId) => {
    try {
      await documentsAPI.delete(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    } catch (error) {
      console.error('❌ Delete failed:', error);
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
    deleteDocument
  };
};