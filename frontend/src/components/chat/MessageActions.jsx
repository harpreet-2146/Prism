import { useState } from 'react';
import { Button } from '@components/ui/button';
import { Copy, Download, Check } from 'lucide-react';
import { copyToClipboard } from '@lib/utils';
import { exportAPI } from '@lib/api';
import { downloadBlob } from '@lib/utils';

export default function MessageActions({ message }) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(message.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = async format => {
    try {
      setExporting(true);

      const response =
        format === 'pdf'
          ? await exportAPI.exportToPDF(message.conversationId)
          : await exportAPI.exportToDOCX(message.conversationId);

      const filename = `conversation-${message.conversationId}.${format}`;
      downloadBlob(response.data, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>

      <Button variant="ghost" size="sm" onClick={() => handleExport('pdf')} disabled={exporting}>
        <Download className="mr-1 h-3 w-3" />
        PDF
      </Button>

      <Button variant="ghost" size="sm" onClick={() => handleExport('docx')} disabled={exporting}>
        <Download className="mr-1 h-3 w-3" />
        DOCX
      </Button>
    </div>
  );
}