// frontend/src/components/documents/UploadProgress.jsx

import React from 'react';
import { Loader2, CheckCircle, XCircle, Upload, Image, Eye, Database } from 'lucide-react';

const UploadProgress = ({ progress, onCancel }) => {
  if (!progress) return null;

  const { progress: percent, stage, status, imageCount, ocrCompleted, ocrTotal, embeddingsCount } = progress;

  // Stage-specific icons and messages
  const getStageInfo = () => {
    switch (stage) {
      case 'uploading':
        return {
          icon: Upload,
          title: 'Uploading document...',
          description: 'Transferring file to server',
          color: 'text-blue-600'
        };
      case 'extracting_images':
        return {
          icon: Image,
          title: 'Extracting images...',
          description: `Rendering ${imageCount || 'pages'} from PDF`,
          color: 'text-purple-600'
        };
      case 'ocr_processing':
        return {
          icon: Eye,
          title: 'Running OCR...',
          description: `Processing ${ocrCompleted}/${ocrTotal} images`,
          color: 'text-orange-600'
        };
      case 'creating_embeddings':
        return {
          icon: Database,
          title: 'Creating embeddings...',
          description: 'Making content searchable',
          color: 'text-green-600'
        };
      case 'finalizing':
        return {
          icon: Loader2,
          title: 'Finalizing...',
          description: 'Almost done',
          color: 'text-blue-600'
        };
      case 'completed':
        return {
          icon: CheckCircle,
          title: 'Complete!',
          description: `Processed ${imageCount} images with ${embeddingsCount} searchable chunks`,
          color: 'text-green-600'
        };
      case 'failed':
        return {
          icon: XCircle,
          title: 'Processing failed',
          description: 'An error occurred during processing',
          color: 'text-red-600'
        };
      default:
        return {
          icon: Loader2,
          title: 'Processing...',
          description: 'Please wait',
          color: 'text-gray-600'
        };
    }
  };

  const stageInfo = getStageInfo();
  const Icon = stageInfo.icon;
  const isComplete = stage === 'completed';
  const isFailed = stage === 'failed';
  const isProcessing = !isComplete && !isFailed;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`${stageInfo.color}`}>
            <Icon className={`w-6 h-6 ${isProcessing ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              {stageInfo.title}
            </h3>
            <p className="text-sm text-gray-500">
              {stageInfo.description}
            </p>
          </div>
        </div>

        {isProcessing && onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              isComplete ? 'bg-green-500' : 
              isFailed ? 'bg-red-500' : 
              'bg-blue-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        
        <div className="flex justify-between text-xs text-gray-600">
          <span>{Math.round(percent)}%</span>
          {ocrTotal > 0 && stage === 'ocr_processing' && (
            <span>OCR: {ocrCompleted}/{ocrTotal} images</span>
          )}
        </div>
      </div>

      {/* Stage Details */}
      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Images</div>
          <div className="text-lg font-semibold text-gray-800">
            {imageCount || '—'}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">OCR Complete</div>
          <div className="text-lg font-semibold text-gray-800">
            {ocrCompleted || 0}/{ocrTotal || 0}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Embeddings</div>
          <div className="text-lg font-semibold text-gray-800">
            {embeddingsCount || '—'}
          </div>
        </div>
      </div>

      {/* Status Message */}
      {isComplete && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 text-center">
            ✓ Document ready! You can now search and chat with this content.
          </p>
        </div>
      )}

      {isFailed && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 text-center">
            ✗ Processing failed. Please try uploading again.
          </p>
        </div>
      )}
    </div>
  );
};

export default UploadProgress;