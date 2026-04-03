"""统一日志配置：控制台 + 文件滚动"""

import logging
import logging.handlers
import os
import sys

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_DIR    = os.path.join(os.path.dirname(__file__), "logs")


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)

    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 控制台
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    console.setLevel(LOG_LEVEL)

    # 文件（按大小滚动，保留最近 5 个）
    file_h = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"),
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_h.setFormatter(fmt)
    file_h.setLevel(logging.DEBUG)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(console)
    root.addHandler(file_h)

    # 压低第三方噪声
    for noisy in ("httpx", "httpcore", "openai", "anthropic", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
