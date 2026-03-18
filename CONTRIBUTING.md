# Contributing

Thanks for your interest in contributing to AI Legal Assistant.

## Ground Rules
- Be respectful and constructive.
- Keep PRs focused and small when possible.
- Avoid committing secrets or private data.

## Local Setup
1. Fork the repo and create a branch from `main`.
2. Install dependencies:
   - Frontend:
     ```bash
     cd frontend
     npm install
     ```
   - Backend:
     ```bash
     cd backend
     python -m venv venv
     venv\Scripts\activate
     pip install -r requirements.txt
     copy .env.example .env
     ```

## Development
- Frontend:
  ```bash
  npm run dev
  ```
- Backend:
  ```bash
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```

## Code Quality
- Frontend lint:
  ```bash
  npm run lint
  ```
- Frontend tests:
  ```bash
  npm test
  ```

## Pull Requests
- Describe what and why in the PR description.
- Link any related issues.
- Include screenshots for UI changes.
- Ensure CI checks pass.

## Security
If you find a security issue, do not open a public issue.
Please follow `SECURITY.md`.
