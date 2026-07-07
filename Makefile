SHELL := /bin/bash

.PHONY: clean-generated diagram e2e-local live-smoke terraform-validate verify-api verify-fast verify-full verify-grading verify-production-proof verify-web

DIAGRAM_VENV ?= .venv-diagrams
GRADING_VENV ?= /tmp/inspectiq-grading-venv
LIVE_BASE_URL ?= https://inspectiq.pages.dev
LOCAL_APP_LOG ?= /tmp/inspectiq-dev.log
LOCAL_APP_PID ?= /tmp/inspectiq-dev.pid
PYTHON ?= python3

diagram:
	python3 -m venv $(DIAGRAM_VENV)
	$(DIAGRAM_VENV)/bin/python -m pip install --upgrade pip
	$(DIAGRAM_VENV)/bin/python -m pip install -r requirements.txt
	$(DIAGRAM_VENV)/bin/python docs/architecture_aws.py

verify-web:
	npm run typecheck -w @inspectiq/web
	npm run test -w @inspectiq/web

verify-api:
	npm run build -w @inspectiq/shared
	npm run typecheck -w @inspectiq/api
	npm run test -w @inspectiq/api

verify-fast:
	npm run typecheck
	npm test

verify-full:
	npm run lint
	npm run typecheck
	npm test
	npm run eval:vision
	npm run build
	npm run build:lambda
	$(MAKE) verify-grading
	$(MAKE) terraform-validate
	$(MAKE) e2e-local

verify-grading:
	rm -rf $(GRADING_VENV)
	$(PYTHON) -m venv $(GRADING_VENV)
	$(GRADING_VENV)/bin/python -m pip install -r services/grading-python/requirements.txt
	cd services/grading-python && $(GRADING_VENV)/bin/python -m pytest

terraform-validate:
	terraform -chdir=infra/terraform init -backend=false
	terraform -chdir=infra/terraform validate

e2e-local:
	rm -f $(LOCAL_APP_LOG) $(LOCAL_APP_PID)
	PERSISTENCE_MODE=memory npm run dev > $(LOCAL_APP_LOG) 2>&1 & echo $$! > $(LOCAL_APP_PID); \
	trap 'if [ -f "$(LOCAL_APP_PID)" ]; then kill "$$(cat "$(LOCAL_APP_PID)")" 2>/dev/null || true; fi' EXIT; \
	for i in {1..90}; do \
		if curl -fsS http://localhost:4000/api/health >/dev/null && curl -fsS http://localhost:5173 >/dev/null; then \
			npm run test:e2e; \
			exit $$?; \
		fi; \
		sleep 2; \
	done; \
	cat $(LOCAL_APP_LOG); \
	exit 1

live-smoke:
	E2E_BASE_URL=$${E2E_BASE_URL:-$(LIVE_BASE_URL)} npm run test:live

verify-production-proof:
	npm run eval:vision
	$(MAKE) live-smoke

clean-generated:
	rm -rf infra/terraform/.terraform .venv-diagrams $(GRADING_VENV) dist output coverage apps/web/.vite
