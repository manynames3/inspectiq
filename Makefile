.PHONY: diagram

DIAGRAM_VENV ?= .venv-diagrams

diagram:
	python3 -m venv $(DIAGRAM_VENV)
	$(DIAGRAM_VENV)/bin/python -m pip install --upgrade pip
	$(DIAGRAM_VENV)/bin/python -m pip install -r requirements.txt
	$(DIAGRAM_VENV)/bin/python docs/architecture_aws.py
