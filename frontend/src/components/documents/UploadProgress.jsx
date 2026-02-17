import { CheckCircle2, Loader2 } from 'lucide-react';

export default function UploadProgress({ progress, filename }) {
  const isComplete = progress === 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          <span className="font-medium">{isComplete ? 'Upload complete' : 'Uploading...'}</span>
        </div>
        <span className="text-muted-foreground">{progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {filename && (
        <p className="text-xs text-muted-foreground">
          {isComplete ? 'Processing document...' : filename}
        </p>
      )}
    </div>
  );
}