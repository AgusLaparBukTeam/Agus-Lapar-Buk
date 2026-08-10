from __future__ import annotations

import json
import logging
import signal
import time
import uuid

from app.core.config import get_settings
from app.repositories.operations import OperationsRepository

LOGGER = logging.getLogger("gateguard.worker")


class AssuranceWorker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = OperationsRepository(
            self.settings.database_url,
            auto_create_schema=self.settings.app_env.casefold() != "production",
        )
        self.worker_id = f"worker-{uuid.uuid4()}"
        self.running = True

    def stop(self, *_args: object) -> None:
        self.running = False

    def handle(self, job: dict[str, object]) -> None:
        payload = json.loads(str(job.get("payload_json") or "{}"))
        job_type = str(job["job_type"])
        if job_type == "ASSESS_SHIPMENT":
            self.repository.complete_assessment(
                organization_id=str(job["organization_id"]),
                shipment_id=str(payload["shipment_id"]),
            )
        elif job_type == "EXTRACT_DOCUMENT":
            # Extraction remains an explicit provider boundary. The worker records a
            # safe review state until a configured extractor can consume the vault file.
            LOGGER.info("Document extraction queued for provider boundary: %s", job["id"])
            self.repository.complete_document_extraction(
                organization_id=str(job["organization_id"]),
                document_id=str(payload["document_id"]),
                version_id=str(payload["version_id"]),
            )
        elif job_type in {"SCREEN_PARTY", "SEND_WEBHOOK", "ESCALATE_TASKS"}:
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
                safe_error = str(exc).replace("\n", " ")[:500]
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
