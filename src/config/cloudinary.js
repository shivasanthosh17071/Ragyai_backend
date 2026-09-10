import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export const destroyAsset = (publicId, resourceType = 'image') =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });

/**
 * Signature for direct browser -> Cloudinary uploads from the admin panel.
 * The API secret never leaves the server; the client only receives the signature.
 */
export const signUploadParams = (params = {}) => {
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = { timestamp, folder: env.cloudinary.folder, ...params };
  const signature = cloudinary.utils.api_sign_request(toSign, env.cloudinary.apiSecret);
  return { ...toSign, signature, apiKey: env.cloudinary.apiKey, cloudName: env.cloudinary.cloudName };
};

export default cloudinary;
