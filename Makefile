# PlagLens — root Makefile
# Auto-detects services from services/* directories.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ----------------------------------------------------------------------------
# Detection
# ----------------------------------------------------------------------------
SERVICES := $(notdir $(wildcard services/*))
LIBS     := $(notdir $(wildcard libs/*))
COMPOSE  := docker compose -f infra/docker-compose.yml --env-file infra/.env

# Pretty colours (best-effort, gracefully degrades if `tput` missing)
BOLD  := $(shell tput bold 2>/dev/null || echo "")
GREEN := $(shell tput setaf 2 2>/dev/null || echo "")
YEL   := $(shell tput setaf 3 2>/dev/null || echo "")
CYAN  := $(shell tput setaf 6 2>/dev/null || echo "")
RST   := $(shell tput sgr0 2>/dev/null || echo "")

# ----------------------------------------------------------------------------
# Help
# ----------------------------------------------------------------------------
.PHONY: help
help: ## Show this help (default target)
	@echo "$(BOLD)PlagLens — development targets$(RST)"
	@echo ""
	@echo "Detected services: $(GREEN)$(SERVICES)$(RST)"
	@echo "Detected libs:     $(GREEN)$(LIBS)$(RST)"
	@echo ""
	@echo "$(BOLD)Usage:$(RST) make $(CYAN)<target>$(RST) [SERVICE=<name>]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-22s$(RST) %s\n", $$1, $$2}'

# ----------------------------------------------------------------------------
# Bootstrap / setup
# ----------------------------------------------------------------------------
.PHONY: gen-keys
gen-keys: ## Generate JWT keypair (idempotent — skip if files exist)
	bash tools/scripts/gen-jwt-keys.sh infra/secrets

.PHONY: dev-tools
dev-tools: ## Install local Python dev tooling (pre-commit, ruff, mypy, pytest)
	python -m pip install --upgrade pip
	python -m pip install pre-commit ruff mypy pytest pytest-asyncio pytest-cov httpx respx
	pre-commit install

.PHONY: bootstrap
bootstrap: ## Initial setup: generate JWT keys, copy .env, install dev tools
	@$(MAKE) gen-keys
	@if [ ! -f infra/.env ]; then \
		cp infra/.env.example infra/.env && \
		echo "$(YEL)→ created infra/.env from .env.example — review BOOTSTRAP_SUPER_ADMIN_*$(RST)"; \
	else \
		echo "$(GREEN)→ infra/.env already present$(RST)"; \
	fi
	@if [ ! -f infra/.env.local ]; then \
		echo "$(YEL)WARNING: infra/.env.local missing — required for OPENROUTER_API_KEY and other secret overrides$(RST)"; \
	fi
	@$(MAKE) dev-tools
	@echo "$(GREEN)bootstrap complete$(RST)"
	@echo "Next: $(BOLD)make build && make up$(RST), then $(BOLD)make seed-demo$(RST)"

# ----------------------------------------------------------------------------
# Docker compose
# ----------------------------------------------------------------------------
.PHONY: build
build: ## docker compose build all images
	$(COMPOSE) build

.PHONY: up
up: ## docker compose up -d (production-like)
	$(COMPOSE) up -d

.PHONY: up-dev
up-dev: ## docker compose up -d with dev override (hot reload, debug)
	$(COMPOSE) -f infra/docker-compose.dev.yml up -d

.PHONY: down
down: ## docker compose down
	$(COMPOSE) down

.PHONY: ps
ps: ## docker compose ps
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail logs (all services, or SERVICE=<name> for one)
	@if [ -z "$(SERVICE)" ] || [ "$(SERVICE)" = "*" ]; then \
		$(COMPOSE) logs -f --tail=100; \
	else \
		$(COMPOSE) logs -f --tail=200 $(SERVICE); \
	fi

.PHONY: logs-all
logs-all: ## Tail logs for all services
	$(COMPOSE) logs -f --tail=100

# ----------------------------------------------------------------------------
# Test
# ----------------------------------------------------------------------------
.PHONY: test-all
test-all: ## Run pytest in every service and lib
	@set -e; \
	for s in $(SERVICES) $(LIBS); do \
		dir="services/$$s"; [ -d "libs/$$s" ] && dir="libs/$$s"; \
		if [ -d "$$dir/tests" ]; then \
			echo "$(BOLD)→ pytest $$dir$(RST)"; \
			(cd "$$dir" && python -m pytest --cov=src --cov-report=term-missing); \
		fi; \
	done

.PHONY: test
test: ## Run pytest for SERVICE=<name>
	@if [ -z "$(SERVICE)" ]; then \
		echo "$(YEL)usage: make test SERVICE=<name>$(RST)"; exit 1; fi
	@dir="services/$(SERVICE)"; [ -d "libs/$(SERVICE)" ] && dir="libs/$(SERVICE)"; \
	cd "$$dir" && python -m pytest --cov=src --cov-report=term-missing

# ----------------------------------------------------------------------------
# Lint / format / typecheck
# ----------------------------------------------------------------------------
.PHONY: lint-all
lint-all: ## ruff check across all services and libs
	ruff check services/ libs/ tools/

.PHONY: format-all
format-all: ## ruff format (write) across all services and libs
	ruff format services/ libs/ tools/

.PHONY: typecheck-all
typecheck-all: ## mypy across all services and libs (src/ only)
	@set -e; \
	for s in $(SERVICES) $(LIBS); do \
		dir="services/$$s"; [ -d "libs/$$s" ] && dir="libs/$$s"; \
		if [ -d "$$dir/src" ]; then \
			echo "$(BOLD)→ mypy $$dir/src$(RST)"; \
			(cd "$$dir" && mypy src --ignore-missing-imports) || true; \
		fi; \
	done

# ----------------------------------------------------------------------------
# Migrations (Alembic)
# ----------------------------------------------------------------------------
.PHONY: migrate-all
migrate-all: ## Run alembic upgrade head in every service
	@set -e; \
	for s in $(SERVICES); do \
		if [ -f "services/$$s/alembic.ini" ]; then \
			echo "$(BOLD)→ alembic upgrade head: $$s$(RST)"; \
			(cd "services/$$s" && alembic upgrade head); \
		fi; \
	done

.PHONY: migrate
migrate: ## alembic upgrade head for SERVICE=<name>
	@if [ -z "$(SERVICE)" ]; then \
		echo "$(YEL)usage: make migrate SERVICE=<name>$(RST)"; exit 1; fi
	cd services/$(SERVICE) && alembic upgrade head

.PHONY: makemigration
makemigration: ## Generate alembic migration: SERVICE=<name> MSG="<msg>"
	@if [ -z "$(SERVICE)" ] || [ -z "$(MSG)" ]; then \
		echo "$(YEL)usage: make makemigration SERVICE=<name> MSG=\"<message>\"$(RST)"; exit 1; fi
	cd services/$(SERVICE) && alembic revision --autogenerate -m "$(MSG)"

# ----------------------------------------------------------------------------
# E2E
# ----------------------------------------------------------------------------
.PHONY: e2e
e2e: ## Run e2e tests against running stack
	python -m pytest tools/e2e/ -v --tb=short

# ----------------------------------------------------------------------------
# Demo data seed
# ----------------------------------------------------------------------------
.PHONY: seed-demo
seed-demo: ## Seed demo tenant + users + courses + assignments + submissions + providers
	python tools/scripts/seed-demo-data.py --gateway-url $${GATEWAY_URL:-http://localhost:8000}

.PHONY: seed-demo-reset
seed-demo-reset: ## Wipe and re-seed demo data
	python tools/scripts/seed-demo-data.py --gateway-url $${GATEWAY_URL:-http://localhost:8000} --reset

# ----------------------------------------------------------------------------
# Frontend (Vite + React + TS SPA)
# ----------------------------------------------------------------------------
.PHONY: ui-install
ui-install: ## Install frontend deps
	cd frontend && npm install --legacy-peer-deps

.PHONY: ui-dev
ui-dev: ## Frontend dev server
	cd frontend && npm run dev

.PHONY: ui-build
ui-build: ## Frontend production build
	cd frontend && npm run build

.PHONY: ui-test
ui-test: ## Frontend tests
	cd frontend && npm test

.PHONY: ui-lint
ui-lint: ## Frontend lint
	cd frontend && npm run lint

# ----------------------------------------------------------------------------
# Frontend E2E (Playwright)
# ----------------------------------------------------------------------------
.PHONY: ui-e2e
ui-e2e: ## Run Playwright headless (CI-style)
	cd frontend && npx playwright test

.PHONY: ui-e2e-smoke
ui-e2e-smoke: ## Run Playwright smoke tests only
	cd frontend && npx playwright test e2e/specs/smoke/

.PHONY: ui-e2e-auth
ui-e2e-auth: ## Run Playwright auth-domain tests only
	cd frontend && npx playwright test e2e/specs/auth/

.PHONY: ui-e2e-headed
ui-e2e-headed: ## Run Playwright with visible browser windows (dev)
	cd frontend && npx playwright test --headed --project=chromium-headed

.PHONY: ui-e2e-ui
ui-e2e-ui: ## Open Playwright UI mode for interactive debugging
	cd frontend && npx playwright test --ui

.PHONY: ui-e2e-trace
ui-e2e-trace: ## Open last failed trace (set TRACE=path/to/trace.zip)
	cd frontend && npx playwright show-trace $${TRACE:-test-results}

.PHONY: ui-e2e-report
ui-e2e-report: ## Open the most recent HTML report
	cd frontend && npx playwright show-report

.PHONY: ui-e2e-install
ui-e2e-install: ## Install Playwright browsers (chromium)
	cd frontend && npx playwright install --with-deps chromium

# ----------------------------------------------------------------------------
# Cleanup
# ----------------------------------------------------------------------------
.PHONY: clean
clean: ## Remove pyc, __pycache__, .pytest_cache, .mypy_cache, dist, build
	@find . -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".mypy_cache" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".ruff_cache" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "*.egg-info" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "htmlcov" -prune -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)clean done$(RST)"

.PHONY: reset
reset: down clean ## Bring the stack down and remove volumes (DESTRUCTIVE)
	$(COMPOSE) down -v --remove-orphans
	@echo "$(YEL)stack reset (volumes wiped)$(RST)"
