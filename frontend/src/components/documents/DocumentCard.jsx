import { useState } from 'react';
import { useDocuments } from '@hooks/useDocuments';
import { Card, CardContent, CardFooter } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import { FileText, Trash2, FileWarning } from 'lucide-react';
import { formatFileSize, formatRelativeTime } from '@lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@components/ui/dialog';

export default function DocumentCard({ document }) {
  const { deleteDocument } = useDocuments();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deleteDocument(document.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleting(false);
    }
  };

  // ✅ Use originalName or filename
  const displayName = document.originalName || document.filename || 'Unnamed Document';
  
  // ✅ Status logic
  const isProcessed = document.status === 'completed';
  const isProcessing = document.status === 'processing' || document.status === 'pending';
  const hasFailed = document.status === 'failed';

  return (
    <>
      <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="p-6">
          {/* File icon */}
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
            {hasFailed ? (
              <FileWarning className="h-8 w-8 text-destructive" />
            ) : (
              <FileText className="h-8 w-8 text-primary" />
            )}
          </div>

          {/* File info */}
          <div className="space-y-2">
            <h3 className="line-clamp-2 font-semibold" title={displayName}>
              {displayName}
            </h3>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>•</span>
              <span>{formatRelativeTime(document.createdAt)}</span>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {hasFailed ? (
                <Badge variant="destructive" className="text-xs">
                  Failed
                </Badge>
              ) : isProcessed ? (
                <Badge variant="success" className="text-xs">
                  Ready
                </Badge>
              ) : isProcessing ? (
                <Badge variant="warning" className="text-xs">
                  Processing...
                </Badge>
              ) : null}
              
              {isProcessed && document.pageCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {document.pageCount} pages
                </Badge>
              )}
              
              {isProcessed && document.imageCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {document.imageCount} images
                </Badge>
              )}

              {isProcessed && document.sapModule && (
                <Badge variant="outline" className="text-xs">
                  {document.sapModule}
                </Badge>
              )}
            </div>

            {/* Error message if failed */}
            {hasFailed && document.processingError && (
              <p className="mt-2 text-xs text-destructive">
                Error: {document.processingError}
              </p>
            )}

            {/* SAP Transaction codes if found */}
            {isProcessed && document.tcodes && document.tcodes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">T-Codes found:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {document.tcodes.slice(0, 5).map((tcode, idx) => (
                    <span
                      key={idx}
                      className="inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs"
                    >
                      {tcode}
                    </span>
                  ))}
                  {document.tcodes.length > 5 && (
                    <span className="inline-block px-2 py-0.5 text-xs text-muted-foreground">
                      +{document.tcodes.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        </CardFooter>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{displayName}"? This will also delete all extracted
              images and embeddings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}