from redis.asyncio import Redis, ConnectionPool

from app.core.config import settings

_pool = ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)


def get_redis() -> Redis:
    return Redis(connection_pool=_pool)
