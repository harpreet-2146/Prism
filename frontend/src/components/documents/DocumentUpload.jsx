import { useState, useRef } from 'react';
import { useDocuments } from '@hooks/useDocuments';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { cn, formatFileSize, isValidFileType, isValidFileSize } from '@lib/utils';
import {
  MAX_FILE_SIZE_MB,
  ACCEPTED_FILE_TYPES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '@lib/constants';
import UploadProgress from './UploadProgress';

export default function DocumentUpload() {
  const { uploadDocument, uploading, uploadProgress } = useDocuments();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = file => {
    if (!isValidFileType(file, ACCEPTED_FILE_TYPES)) {
      setError(ERROR_MESSAGES.INVALID_FILE_TYPE);
      return false;
    }

    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      setError(ERROR_MESSAGES.FILE_TOO_LARGE);
      return false;
    }

    return true;
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError('');

    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleChange = e => {
    e.preventDefault();
    setError('');

    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadDocument(selectedFile);
      setSelectedFile(null);
      setError('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (err) {
      setError(ERROR_MESSAGES.UPLOAD_FAILED);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setError('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Drag and drop area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
            dragActive ? 'border-primary bg-primary/5' : 'border-border',
            selectedFile && 'border-primary bg-primary/5'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_FILE_TYPES.join(',')}
            onChange={handleChange}
            disabled={uploading}
          />

          {selectedFile ? (
            // Selected file preview
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-10 w-10 text-primary" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              {!uploading && (
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            // Upload prompt
            <>
              <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-lg font-medium">Drop your PDF here</p>
              <p className="mb-4 text-sm text-muted-foreground">
                or click to browse (max {MAX_FILE_SIZE_MB}MB)
              </p>
              <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
                Select File
              </Button>
            </>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload progress */}
        {uploading && <UploadProgress progress={uploadProgress} filename={selectedFile?.name} />}

        {/* Upload button */}
        {selectedFile && !uploading && (
          <Button onClick={handleUpload} className="w-full" size="lg">
            Upload Document
          </Button>
        )}
      </div>
    </Card>
  );
}