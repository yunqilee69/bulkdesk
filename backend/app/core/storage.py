import boto3
import uuid
from datetime import datetime, timezone

from app.core.config import settings


class StorageService:
    """S3-compatible storage service (MinIO)"""

    def __init__(self):
        self._client = None
        self._bucket = settings.MINIO_BUCKET

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}",
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                region_name="us-east-1",
            )
            self._ensure_bucket()
        return self._client

    def _ensure_bucket(self):
        """Create bucket if not exists"""
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except Exception:
            self._client.create_bucket(Bucket=self._bucket)

    def upload_file(
        self, file_data: bytes, filename: str, content_type: str, prefix: str = "uploads"
    ) -> str:
        """Upload file and return the object key"""
        date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        unique_id = str(uuid.uuid4())[:8]
        key = f"{prefix}/{date_prefix}/{unique_id}-{filename}"

        self.client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=file_data,
            ContentType=content_type,
        )
        return key

    def delete_file(self, key: str) -> bool:
        """Delete file by key"""
        try:
            self.client.delete_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        """Generate presigned URL for temporary access"""
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires,
        )

    def get_public_url(self, key: str) -> str:
        """Get public URL (if bucket policy allows public read)"""
        return f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}/{self._bucket}/{key}"


storage_service = StorageService()
