from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import BinaryIO

from app.core.errors import GateGuardError, NotFoundError

_SAFE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,319}$")


class DocumentStorage:
    """Small local storage abstraction; object storage can replace this boundary later."""

    def __init__(self, root: str):
        self.root = Path(root).expanduser().resolve()

    def path_for(self, key: str) -> Path:
        if not _SAFE_KEY.fullmatch(key) or ".." in Path(key).parts:
            raise GateGuardError(
                "Document storage key is invalid.", code="INVALID_STORAGE_KEY", status_code=422
            )
        path = (self.root / key).resolve()
        if path != self.root and self.root not in path.parents:
            raise GateGuardError(
                "Document storage key is outside the document vault.",
                code="INVALID_STORAGE_KEY",
                status_code=422,
            )
        return path

    def write(self, key: str, stream: BinaryIO, *, max_bytes: int) -> tuple[int, str]:
        path = self.path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        digest = hashlib.sha256()
        temporary = path.with_name(f".{path.name}.part")
        try:
            with temporary.open("wb") as target:
                while chunk := stream.read(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        raise GateGuardError(
                            "The document is larger than the workspace limit.",
                            code="UPLOAD_TOO_LARGE",
                            status_code=413,
                        )
                    digest.update(chunk)
                    target.write(chunk)
            temporary.replace(path)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return total, digest.hexdigest()

    def open(self, key: str) -> BinaryIO:
        path = self.path_for(key)
        if not path.is_file():
            raise NotFoundError("The document file is not available.")
        return path.open("rb")
