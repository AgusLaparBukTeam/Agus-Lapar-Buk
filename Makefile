.PHONY: backend frontend test eval

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest && uv run ruff check app tests
	cd frontend && npm test && npm run lint

eval:
	cd backend && uv run python ../evaluation/run.py
