import { useDocuments } from '@hooks/useDocuments';
import DocumentUpload from '@components/documents/DocumentUpload';
import DocumentList from '@components/documents/DocumentList';
import { Skeleton } from '@components/ui/skeleton';
import { FileText } from 'lucide-react';

export default function Documents() {
  const { documents, loading } = useDocuments(); // ✅ Remove fetchDocuments from here

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="mt-2 text-muted-foreground">
            Upload and manage your SAP documentation PDFs
          </p>
        </div>

        {/* Upload section */}
        <div className="mb-8">
          <DocumentUpload />
        </div>

        {/* Documents list */}
        <div>
          <h2 className="mb-4 text-xl font-semibold">Your Documents</h2>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
              <p className="text-sm text-muted-foreground">
                Upload your first SAP documentation PDF to get started
              </p>
            </div>
          ) : (
            <DocumentList documents={documents} />
          )}
        </div>
      </div>
    </div>
  );
}