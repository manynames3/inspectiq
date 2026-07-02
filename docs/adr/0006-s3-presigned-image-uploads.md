# ADR 0006: S3 Presigned Image Uploads

Decision: Production image ingestion should use S3 presigned uploads.

Reason: Large image binaries should not flow through the API service when object storage can handle scale, encryption, and lifecycle policies directly.

