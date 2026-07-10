SHELL := /bin/bash

.PHONY: clean-generated diagram e2e-local live-smoke screenshots-local terraform-validate verify-api verify-fast verify-full verify-grading verify-mobile verify-projector verify-production-proof verify-web

DIAGRAM_VENV ?= .venv-diagrams
GRADING_VENV ?= /tmp/inspectiq-grading-venv
PROJECTOR_VENV ?= /tmp/inspectiq-projector-venv
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

verify-mobile:
	npm run typecheck -w @inspectiq/mobile
	npm run test -w @inspectiq/mobile

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
	npm run build:projector
	$(MAKE) verify-grading
	$(MAKE) verify-projector
	$(MAKE) terraform-validate
	$(MAKE) e2e-local
	$(MAKE) screenshots-local

verify-grading:
	rm -rf $(GRADING_VENV)
	$(PYTHON) -m venv $(GRADING_VENV)
	$(GRADING_VENV)/bin/python -m pip install -r services/grading-python/requirements.txt
	cd services/grading-python && $(GRADING_VENV)/bin/python -m pytest

verify-projector:
	rm -rf $(PROJECTOR_VENV)
	$(PYTHON) -m venv $(PROJECTOR_VENV)
	$(PROJECTOR_VENV)/bin/python -m pip install -r services/operations-projector/requirements.txt
	cd services/operations-projector && $(PROJECTOR_VENV)/bin/python -m pytest

terraform-validate:
	terraform -chdir=infra/terraform init -backend=false
	terraform -chdir=infra/terraform validate

e2e-local:
	LOCAL_APP_LOG=$(LOCAL_APP_LOG) LOCAL_APP_PID=$(LOCAL_APP_PID) bash scripts/run-local-check.sh npm run test:e2e

screenshots-local:
	LOCAL_APP_LOG=$(LOCAL_APP_LOG) LOCAL_APP_PID=$(LOCAL_APP_PID) bash scripts/run-local-check.sh npm run test:screenshots

live-smoke:
	E2E_BASE_URL=$${E2E_BASE_URL:-$(LIVE_BASE_URL)} npm run test:live

verify-production-proof:
	npm run eval:vision
	$(MAKE) live-smoke

clean-generated:
	rm -rf infra/terraform/.terraform .venv-diagrams $(GRADING_VENV) $(PROJECTOR_VENV) dist output coverage apps/web/.vite
