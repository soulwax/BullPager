import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

let client: S3Client | undefined;

export function r2Configured() {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_BUCKET_NAME && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

function requireR2() {
  if (!r2Configured()) throw new Error('R2 storage is not configured. Set R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  client ??= new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
  });
  return client;
}

export function projectFileObjectKey(projectSlug: string, fileId: string, path: string) {
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `projects/${encodeURIComponent(projectSlug)}/${encodeURIComponent(fileId)}/${encodedPath}`;
}

export async function putProjectFileObject(key: string, content: string | Uint8Array, mimeType: string) {
  const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await requireR2().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: mimeType,
    ContentLength: body.byteLength,
    CacheControl: 'private, max-age=0, no-store'
  }));
}

export async function copyProjectFileObject(sourceKey: string, destinationKey: string, mimeType: string) {
  await requireR2().send(new CopyObjectCommand({
    Bucket: env.R2_BUCKET_NAME!,
    CopySource: `${env.R2_BUCKET_NAME!}/${sourceKey}`,
    Key: destinationKey,
    MetadataDirective: 'REPLACE',
    ContentType: mimeType,
    CacheControl: 'private, max-age=0, no-store'
  }));
}

export async function getProjectFileObjectUrl(key: string, expiresIn = Number(env.R2_PRESIGN_TTL_SECONDS || 900)) {
  return getSignedUrl(requireR2(), new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME!, Key: key }), { expiresIn: Math.max(1, Math.min(expiresIn, 604800)) });
}

export async function deleteProjectFileObject(key: string) {
  await requireR2().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME!, Key: key }));
}
