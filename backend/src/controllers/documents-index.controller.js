const { generateDocumentIndex } = require('../services/generate-index.service');

async function generateIndexHandler(req, res) {
  try {
    const documentId = req.params.id;
    const userId = req.user.userId; // ← matches auth middleware's req.user shape

    if (!documentId) {
      return res.status(400).json({ success: false, message: 'Document ID required' });
    }

    // generateDocumentIndex handles DB lookup, Groq call, and persistence
    const index = await generateDocumentIndex(documentId, userId);

    return res.json({
      success: true,
      data: { index },
    });
  } catch (err) {
    console.error('[generate-index handler]', err.message);

    if (err.message === 'Document not found') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.message.includes('not finished processing')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.message.includes('No text content')) {
      return res.status(422).json({ success: false, message: err.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Index generation failed. Please try again.',
    });
  }
}

module.exports = { generateIndexHandler };


