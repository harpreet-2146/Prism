import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function StepByStepGuide({ content, images = [] }) {
  return (
    <div className="space-y-4">
      {/* Markdown content */}
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>

      {/* Referenced images */}
      {images && images.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Referenced Screenshots:</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((image, idx) => (
              <div key={idx} className="overflow-hidden rounded-lg border">
                <img
                  src={image.url || image.dataUrl}
                  alt={image.caption || `Screenshot ${idx + 1}`}
                  className="h-auto w-full"
                />
                {image.caption && (
                  <p className="bg-muted p-2 text-xs text-muted-foreground">{image.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}