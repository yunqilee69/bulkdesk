from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from starlette.concurrency import run_in_threadpool

from app.core.storage import storage_service
from app.schemas.upload import UploadResult, FileDeleteRequest
from app.core.deps import get_current_user
import mimetypes

router = APIRouter(prefix="/upload", tags=["文件上传"])

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    prefix: str = "uploads",
    current_user=Depends(get_current_user),
):
    """Upload a file to MinIO"""
    content_type = (
        file.content_type
        or mimetypes.guess_type(file.filename or "")[0]
        or "application/octet-stream"
    )
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {content_type}")

    data = await file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过10MB")

    # boto3 is synchronous; keep its network I/O off the FastAPI event loop.
    key = await run_in_threadpool(
        storage_service.upload_file,
        file_data=data,
        filename=file.filename or "unnamed",
        content_type=content_type,
        prefix=prefix,
    )

    url = storage_service.get_public_url(key)

    return {
        "code": 0,
        "message": "上传成功",
        "data": UploadResult(
            key=key,
            url=url,
            filename=file.filename or "unnamed",
            content_type=content_type,
            size=len(data),
        ).model_dump(),
    }


@router.delete("")
async def delete_file(
    req: FileDeleteRequest,
    current_user=Depends(get_current_user),
):
    """Delete a file from MinIO"""
    success = await run_in_threadpool(storage_service.delete_file, req.key)
    if not success:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"code": 0, "message": "删除成功"}


@router.get("/presign/{key:path}")
async def get_presigned_url(
    key: str,
    expires: int = 3600,
    current_user=Depends(get_current_user),
):
    """Get presigned URL for a file"""
    url = await run_in_threadpool(storage_service.get_presigned_url, key, expires)
    return {"code": 0, "data": {"url": url, "key": key}}
