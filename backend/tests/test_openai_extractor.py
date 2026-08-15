import asyncio
import json

from app.core.config import Settings
from app.domain.models import DocumentType
from app.services.extraction import OpenAIExtractor
from app.services.file_validation import SafeUpload


class FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        payload = {
            "detected_document_type": "invoice",
            "document_id": "INV-1",
            "shipment_id": "SHP-1",
            "sender": "PT Gudang",
            "recipient": "PT Maju Jaya",
            "destination": "Bandung",
            "document_total": 1800000,
            "items": [
                {
                    "sku": "SKU-001",
                    "description": "Minyak Goreng 1L",
                    "quantity": 100,
                    "unit_price": 18000,
                    "line_total": 1800000,
                }
            ],
        }
        return {"choices": [{"message": {"content": json.dumps(payload)}}]}


class FakeClient:
    last_payload = None
    last_url = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers, json):
        FakeClient.last_url = url
        FakeClient.last_payload = json
        return FakeResponse()


def test_openai_adapter_uses_chat_completions_json_object_and_untrusted_policy(monkeypatch):
    monkeypatch.setattr("app.services.extraction.httpx.AsyncClient", FakeClient)
    settings = Settings(
        openai_api_key="test-key",
        openai_model="gpt-5",
        openai_base_url="https://api.openai.com/v1",
    )
    extractor = OpenAIExtractor(settings)
    upload = SafeUpload(
        filename="invoice.png",
        extension=".png",
        media_type="image/png",
        data=b"\x89PNG\r\n\x1a\nfake",
        sha256="test-sha",
    )

    document = asyncio.run(extractor.extract(upload, DocumentType.INVOICE))

    assert document.recipient.value == "PT Maju Jaya"
    assert document.items[0].quantity.value == 100
    assert document.detected_document_type == DocumentType.INVOICE
    assert document.document_type_confidence == 0.65
    assert document.line_items_complete is False
    assert FakeClient.last_url == "https://api.openai.com/v1/chat/completions"
    assert FakeClient.last_payload["response_format"] == {"type": "json_object"}
    policy = FakeClient.last_payload["messages"][0]["content"]
    assert FakeClient.last_payload["messages"][0]["role"] == "developer"
    assert "UNTRUSTED DATA" in policy
    assert FakeClient.last_payload["messages"][1]["role"] == "user"
    image = FakeClient.last_payload["messages"][1]["content"][1]
    assert image["type"] == "image_url"
    assert image["image_url"]["url"].startswith("data:image/png;base64,")
