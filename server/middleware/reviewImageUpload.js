const multer = require('multer');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'png', 'webp']);

const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
    fields: 3,
    parts: 4,
  },
}).single('image');

const reviewImageUpload = (req, res, next) => {
  parseImage(req, res, async error => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: 'Image must be 5 MB or smaller',
        });
      }

      return res.status(400).json({
        message: 'Invalid image upload request',
      });
    }

    if (!req.file) {
      return next();
    }

    if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(415).json({
        message: 'Only JPEG, PNG, and WebP images are allowed',
      });
    }

    try {
      const {fileTypeFromBuffer} = await import('file-type');
      const detectedType = await fileTypeFromBuffer(req.file.buffer);

      if (
        !detectedType ||
        !ALLOWED_EXTENSIONS.has(detectedType.ext) ||
        detectedType.mime !== req.file.mimetype
      ) {
        return res.status(415).json({
          message: 'Uploaded file content must match a JPEG, PNG, or WebP image',
        });
      }

      return next();
    } catch {
      return res.status(400).json({
        message: 'Unable to validate uploaded image',
      });
    }
  });
};

module.exports = {
  MAX_IMAGE_SIZE,
  reviewImageUpload,
};
