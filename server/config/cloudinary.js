const cloudinary = require('cloudinary').v2;

const getConfiguredCloudinary = () => {
  const {CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET} =
    process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
};

const uploadReviewImage = async buffer => {
  const client = getConfiguredCloudinary();

  const result = await new Promise((resolve, reject) => {
    client.uploader
      .upload_stream(
        {
          folder: 'restaurant-review/reviews',
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          unique_filename: true,
          overwrite: false,
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult);
        },
      )
      .end(buffer);
  });

  if (
    typeof result?.secure_url !== 'string' ||
    !result.secure_url.startsWith('https://') ||
    typeof result.public_id !== 'string' ||
    !result.public_id
  ) {
    throw new Error('Cloudinary returned an invalid upload result');
  }

  return {
    imageUrl: result.secure_url,
    publicId: result.public_id,
  };
};

const deleteReviewImage = async publicId => {
  if (typeof publicId !== 'string' || !publicId.trim()) {
    return false;
  }

  const client = getConfiguredCloudinary();
  const result = await client.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });

  return result?.result === 'ok' || result?.result === 'not found';
};

module.exports = {
  uploadReviewImage,
  deleteReviewImage,
};
