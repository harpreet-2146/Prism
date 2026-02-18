import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@components/ui/button';
import { Copy, Download, Check, Loader2 } from 'lucide-react';
import { copyToClipboard } from '@lib/utils';
import { exportAPI } from '@lib/api';

export default function MessageActions({ message }) {
  const { conversationId } = useParams();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(message.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportPDF = async () => {
    if (!conversationId) {
      alert('Please save the conversation first');
      return;
    }

    try {
      setExporting(true);
      const response = await exportAPI.exportPDF(conversationId);

      // Create download link
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${conversationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportDOCX = async () => {
    if (!conversationId) {
      alert('Please save the conversation first');
      return;
    }

    try {
      setExporting(true);
      const response = await exportAPI.exportDOCX(conversationId);

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${conversationId}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('DOCX export failed:', error);
      alert('Failed to export DOCX. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? (
          <>
            <Check className="mr-1 h-3 w-3" />
            Copied
          </>
        ) : (
          <>
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </>
        )}
      </Button>

      <Button variant="ghost" size="sm" onClick={handleExportPDF} disabled={exporting}>
        {exporting ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Download className="mr-1 h-3 w-3" />
        )}
        PDF
      </Button>

      <Button variant="ghost" size="sm" onClick={handleExportDOCX} disabled={exporting}>
        {exporting ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Download className="mr-1 h-3 w-3" />
        )}
        DOCX
      </Button>
    </div>
  );
}