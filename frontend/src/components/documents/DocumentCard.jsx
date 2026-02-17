import { useState } from 'react';
import { useDocuments } from '@hooks/useDocuments';
import { Card, CardContent, CardFooter } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import { FileText, Trash2, Eye, Download } from 'lucide-react';
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

  const handleDownload = () => {
    window.open(document.url, '_blank');
  };

  return (
    <>
      <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="p-6">
          {/* File icon */}
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-8 w-8 text-primary" />
          </div>

          {/* File info */}
          <div className="space-y-2">
            <h3 className="line-clamp-2 font-semibold" title={document.filename}>
              {document.filename}
            </h3>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(document.size)}</span>
              <span>•</span>
              <span>{formatRelativeTime(document.createdAt)}</span>
            </div>

            {/* Status badges */}
            <div className="flex gap-2">
              <Badge variant={document.processed ? 'success' : 'warning'} className="text-xs">
                {document.processed ? 'Processed' : 'Processing'}
              </Badge>
              {document.imageCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {document.imageCount} images
                </Badge>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 border-t p-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </CardFooter>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{document.filename}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
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