import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { env } from '../config/env.js';
import ApiError from '../utils/apiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/**
 * Multer storage engine that streams straight into Cloudinary.
 * Written against the v2 SDK directly — multer-storage-cloudinary still
 * peer-depends on cloudinary v1 and is effectively unmaintained.
 *
 * Files land on req.file(s) with `path` (secure URL) and `filename` (public_id),
 * matching the shape the rest of the codebase expects.
 */
class CloudinaryStorage {
  constructor({ folder }) {
    this.folder = folder;
  }

  _handleFile(req, file, cb) {
    const isVideo = VIDEO_TYPES.includes(file.mimetype);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${this.folder}/${isVideo ? 'videos' : 'images'}`,
        resource_type: isVideo ? 'video' : 'image',
        ...(isVideo ? {} : { transformation: [{ quality: 'auto:good', fetch_format: 'auto' }] }),
      },
      (err, result) => {
        if (err) return cb(err);
        cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
          width: result.width,
          height: result.height,
          format: result.format,
          resourceType: result.resource_type,
        });
      }
    );
    file.stream.pipe(stream);
  }

  _removeFile(req, file, cb) {
    cloudinary.uploader
      .destroy(file.filename, { resource_type: file.resourceType || 'image' })
      .then(() => cb(null))
      .catch(cb);
  }
}

const storage = new CloudinaryStorage({ folder: env.cloudinary.folder });

const fileFilter = (allowed) => (_req, file, cb) => {
  if (!allowed.includes(file.mimetype)) {
    return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
};

export const uploadImages = multer({
  storage,
  fileFilter: fileFilter(IMAGE_TYPES),
  limits: { fileSize: env.cloudinary.maxImageMb * 1024 * 1024, files: 10 },
});

export const uploadVideos = multer({
  storage,
  fileFilter: fileFilter(VIDEO_TYPES),
  limits: { fileSize: env.cloudinary.maxVideoMb * 1024 * 1024, files: 3 },
});

/** Turns multer's own errors into the standard API error shape. */
export const handleUploadError = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    const map = {
      LIMIT_FILE_SIZE: 'File is too large',
      LIMIT_FILE_COUNT: 'Too many files',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };
    return next(ApiError.badRequest(map[err.code] || err.message));
  }
  next(err);
};
