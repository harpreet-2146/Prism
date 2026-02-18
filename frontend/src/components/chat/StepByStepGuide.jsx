import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@components/ui/badge';

export default function StepByStepGuide({ content, images = [] }) {
  console.log('🎨 StepByStepGuide render:', { 
    contentLength: content?.length, 
    imagesCount: images?.length,
    images: images 
  }); // DEBUG

  // Try to parse JSON response from backend
  let parsed = null;
  try {
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
    console.log('✅ Parsed JSON response:', parsed); // DEBUG
  } catch (e) {
    console.log('ℹ️  Not JSON, rendering as markdown'); // DEBUG
  }

  // If we have structured data, render it properly
  if (parsed && (parsed.summary || (parsed.steps && parsed.steps.length > 0))) {
    return (
      <div className="space-y-4">
        {/* Summary */}
        {parsed.summary && (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="font-medium text-foreground">{parsed.summary}</p>
          </div>
        )}

        {/* Steps */}
        {parsed.steps && parsed.steps.length > 0 && (
          <div className="space-y-4">
            {parsed.steps.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                {/* Step number */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {idx + 1}
                </div>

                {/* Step content */}
                <div className="flex-1 space-y-2">
                  <h4 className="font-semibold text-foreground">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>

                  {/* T-Code badge */}
                  {step.tcode && (
                    <Badge variant="outline" className="font-mono">
                      T-Code: {step.tcode}
                    </Badge>
                  )}

                  {/* Screenshot description */}
                  {step.screenshotDescription && (
                    <p className="text-xs italic text-muted-foreground">
                      📸 {step.screenshotDescription}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {parsed.sources && parsed.sources.length > 0 && (
          <div className="mt-4 rounded-lg border bg-card p-3">
            <h4 className="mb-2 text-sm font-semibold">📎 Sources:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {parsed.sources.map((source, idx) => (
                <li key={idx}>
                  • {source.title || source.documentId}
                  {source.pageNumber && ` (Page ${source.pageNumber})`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Document images - WITH DEBUG */}
        {images && images.length > 0 ? (
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-semibold">
              📄 Referenced Screenshots from Documents ({images.length} images):
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((image, idx) => {
                console.log(`🖼️  Rendering image ${idx}:`, image); // DEBUG
                
                return (
                  <div key={idx} className="overflow-hidden rounded-lg border">
                    <img
                      src={image.url}
                      alt={`Screenshot from page ${image.pageNumber || 'unknown'}`}
                      className="h-auto w-full"
                      loading="lazy"
                      onLoad={() => console.log(`✅ Image ${idx} loaded successfully`)}
                      onError={(e) => {
                        console.error(`❌ Image ${idx} failed to load:`, image.url);
                        console.error('Error event:', e);
                      }}
                    />
                    {image.pageNumber && (
                      <div className="bg-muted p-2 text-xs text-muted-foreground">
                        Page {image.pageNumber}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            ℹ️ No images available for this response
            {console.log('⚠️  No images to display. Images array:', images)}
          </div>
        )}
      </div>
    );
  }

  // Fallback to markdown rendering for plain text responses
  return (
    <div className="space-y-4">
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>

      {/* Document images */}
      {images && images.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Referenced Screenshots ({images.length}):</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((image, idx) => (
              <div key={idx} className="overflow-hidden rounded-lg border">
                <img
                  src={image.url}
                  alt={image.caption || `Screenshot ${idx + 1}`}
                  className="h-auto w-full"
                  loading="lazy"
                  onLoad={() => console.log(`✅ Markdown image ${idx} loaded`)}
                  onError={() => console.error(`❌ Markdown image ${idx} failed:`, image.url)}
                />
                {image.caption && (
                  <p className="bg-muted p-2 text-xs text-muted-foreground">{image.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          ℹ️ No images available
        </div>
      )}
    </div>
  );
}