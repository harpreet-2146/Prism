// frontend/src/components/documents/DocumentUpload.jsx

import React, { useState, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import UploadProgress from './UploadProgress';

const DocumentUpload = ({ onUploadComplete, onUploadError }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }

      // Validate file size (50MB max)
      const maxSizeMB = 50;
      if (file.size > maxSizeMB * 1024 * 1024) {
        alert(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress({
      progress: 0,
      stage: 'uploading',
      status: 'processing'
    });

    try {
      const { useDocuments } = await import('../../hooks/useDocuments');
      const { uploadDocument } = useDocuments();

      const { eventSource } = await uploadDocument(selectedFile, (progressData) => {
        setUploadProgress(progressData);
      });

      eventSourceRef.current = eventSource;

    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
      setUploadProgress(null);
      
      if (onUploadError) {
        onUploadError(error);
      }
    }
  };

  const handleCancel = () => {
    // Close SSE connection if active
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setSelectedFile(null);
    setUploading(false);
    setUploadProgress(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else {
      alert('Please drop a PDF file');
    }
  };

  // Handle upload complete from progress component
  React.useEffect(() => {
    if (uploadProgress?.type === 'done') {
      setUploading(false);
      setSelectedFile(null);
      setUploadProgress(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onUploadComplete) {
        onUploadComplete();
      }
    }
  }, [uploadProgress, onUploadComplete]);

  return (
    <div className="w-full">
      {!uploading ? (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>

            {selectedFile ? (
              <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-lg">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  {selectedFile.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-lg font-medium text-gray-700 mb-1">
                    Drop your SAP PDF here
                  </p>
                  <p className="text-sm text-gray-500">
                    or click to browse
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  Maximum file size: 50MB
                </p>
              </>
            )}

            {selectedFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Upload & Process
              </button>
            )}
          </div>
        </div>
      ) : (
        <UploadProgress
          progress={uploadProgress}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};

export default DocumentUpload;