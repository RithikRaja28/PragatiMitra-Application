const { S3Client, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;

/**
 * Presigned URL for uploading — frontend PUTs the file directly to S3.
 * Expires in 5 minutes by default.
 */
async function getUploadUrl(key, mimeType, expiresIn = 300) {
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: mimeType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Presigned URL for reading/downloading a private file.
 * Expires in 15 minutes by default.
 */
async function getReadUrl(key, expiresIn = 900) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Delete a file from S3 by its key.
 */
async function deleteFile(key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  return s3.send(command);
}

module.exports = { getUploadUrl, getReadUrl, deleteFile };
