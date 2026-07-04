import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const s3 = new S3Client({ region });

export function s3ObjectUrl(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

export async function createPresignedUpload(input: {
  bucket: string;
  key: string;
  mimeType: string;
  checksumSha256?: string | null;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; requiredHeaders: Record<string, string>; expiresInSeconds: number }> {
  const expiresInSeconds = input.expiresInSeconds ?? 900;
  const command = new PutObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    ContentType: input.mimeType
  });
  return {
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: expiresInSeconds }),
    requiredHeaders: {
      "content-type": input.mimeType
    },
    expiresInSeconds
  };
}

export async function createPresignedDownload(input: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key
  }), { expiresIn: input.expiresInSeconds ?? 300 });
}

export async function readS3ObjectBytes(bucket: string, key: string): Promise<Uint8Array> {
  const output = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!output.Body) throw new Error("S3 object response did not include a body.");
  return output.Body.transformToByteArray();
}
