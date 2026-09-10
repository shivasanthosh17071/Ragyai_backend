import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { destroyAsset, signUploadParams } from '../config/cloudinary.js';

const mapFiles = (files) => (files || []).map((f) => ({
  url: f.path,
  publicId: f.filename,
  bytes: f.size,
  format: f.mimetype,
}));

export const uploadImage = asyncHandler(async (req, res) => {
  const files = mapFiles(req.files?.length ? req.files : req.file ? [req.file] : []);
  if (!files.length) throw ApiError.badRequest('No image uploaded');
  return sendSuccess(res, { status: 201, message: 'Uploaded', data: { files } });
});

export const uploadVideo = asyncHandler(async (req, res) => {
  const files = mapFiles(req.files?.length ? req.files : req.file ? [req.file] : []);
  if (!files.length) throw ApiError.badRequest('No video uploaded');
  return sendSuccess(res, { status: 201, message: 'Uploaded', data: { files } });
});

export const deleteAsset = asyncHandler(async (req, res) => {
  const publicId = decodeURIComponent(req.params.publicId);
  const result = await destroyAsset(publicId, req.query.type === 'video' ? 'video' : 'image');
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw ApiError.badRequest(`Cloudinary refused the delete: ${result.result}`);
  }
  return sendSuccess(res, { message: 'Asset deleted' });
});

/** Lets the admin app upload straight to Cloudinary without proxying bytes through us. */
export const getUploadSignature = asyncHandler(async (_req, res) =>
  sendSuccess(res, { data: signUploadParams() }));
