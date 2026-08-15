from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import signal
import time
import uuid

from app.core.config import get_settings
from app.domain.jobs import ProcessingJobType
from app.domain.models import DocumentType
from app.repositories.operations import OperationsRepository
from app.services.document_storage import DocumentStorage
from app.services.extraction import ExtractionRouter
from app.services.file_validation import SafeUpload

LOGGER = logging.getLogger("gateguard.worker")


def safe_worker_error(exc: Exception) -> str:
    """Return a stable operator message without persisting sensitive exception detail."""
    if isinstance(exc, FileNotFoundError):
        return "The stored document is unavailable for processing."
    if isinstance(exc, (OSError, ValueError)):
        return "The document could not be processed safely."
    return "The processing worker could not complete this job."


class AssuranceWorker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = OperationsRepository(
            self.settings.database_url,
            auto_create_schema=self.settings.app_env.casefold() != "production",
        )
        self.extractor = ExtractionRouter(self.settings)
        self.storage = DocumentStorage(self.settings.document_storage_root)
        self.worker_id = f"worker-{uuid.uuid4()}"
        self.running = True

    def stop(self, *_args: object) -> None:
        self.running = False

    def handle(self, job: dict[str, object]) -> None:
        payload = json.loads(str(job.get("payload_json") or "{}"))
        job_type = str(job["job_type"])
        if job_type == ProcessingJobType.ASSESS_SHIPMENT.value:
            self.repository.complete_assessment(
                organization_id=str(job["organization_id"]),
                shipment_id=str(payload["shipment_id"]),
            )
        elif job_type == ProcessingJobType.EXTRACT_DOCUMENT.value:
            organization_id = str(job["organization_id"])
            document_id = str(payload["document_id"])
            version_id = str(payload["version_id"])
            context = self.repository.document_extraction_context(
                organization_id=organization_id,
                document_id=document_id,
                version_id=version_id,
            )
            document_type_map = {
                "COMMERCIAL_INVOICE": DocumentType.INVOICE,
                "INVOICE": DocumentType.INVOICE,
                "PACKING_LIST": DocumentType.PACKING_LIST,
                "DELIVERY_ORDER": DocumentType.DELIVERY_ORDER,
            }
            document_type = document_type_map.get(str(context["document_type"]).upper())
            if document_type is None:
                raise ValueError("Unsupported document type for extraction.")
            version = context["version"]
            with self.storage.open(str(version["storage_key"])) as stream:
                data = stream.read()
            if hashlib.sha256(data).hexdigest() != str(version["sha256"]):
                raise RuntimeError("Stored document hash does not match the validated upload.")
            result = asyncio.run(
                self.extractor.extract(
                    SafeUpload(
                        filename=str(version["filename"]),
                        extension=str(version["filename"]).rsplit(".", 1)[-1].lower(),
                        media_type=str(version["mime_type"]),
                        data=data,
                        sha256=str(version["sha256"]),
                    ),
                    document_type,
                )
            )
            self.repository.complete_document_extraction(
                organization_id=organization_id,
                document_id=document_id,
                version_id=version_id,
                result=result,
            )
        elif job_type in {
            ProcessingJobType.SCREEN_PARTY.value,
            ProcessingJobType.SEND_WEBHOOK.value,
            ProcessingJobType.ESCALATE_TASKS.value,
        }:
            raise RuntimeError(f"No provider-specific handler configured for {job_type}")
        else:
            raise ValueError(f"Unsupported processing job type: {job_type}")

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        self.repository.heartbeat(
            worker_id=self.worker_id,
            status="RUNNING",
            version=self.settings.app_version,
        )
        while self.running:
            job = self.repository.claim_job(worker_id=self.worker_id)
            if job is None:
                self.repository.heartbeat(
                    worker_id=self.worker_id,
                    status="IDLE",
                    version=self.settings.app_version,
                )
                time.sleep(self.settings.worker_poll_interval_seconds)
                continue
            self.repository.heartbeat(
                worker_id=self.worker_id,
                status="PROCESSING",
                version=self.settings.app_version,
                current_job_id=str(job["id"]),
            )
            try:
                self.handle(job)
            except Exception as exc:  # keep the worker alive and persist only safe error text
                safe_error = safe_worker_error(exc)
                LOGGER.exception("Processing job failed: %s", job["id"])
                self.repository.finish_job(
                    job_id=str(job["id"]),
                    success=False,
                    error_code="WORKER_HANDLER_FAILED",
                    safe_error=safe_error,
                )
                self.repository.heartbeat(
                    worker_id=self.worker_id,
                    status="DEGRADED",
                    version=self.settings.app_version,
                    safe_error=safe_error,
                )
            else:
                self.repository.finish_job(job_id=str(job["id"]), success=True)
                self.repository.heartbeat(
                    worker_id=self.worker_id,
                    status="RUNNING",
                    version=self.settings.app_version,
                )


def main() -> None:
    AssuranceWorker().run()


if __name__ == "__main__":
    main()
