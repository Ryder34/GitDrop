# GitDrop

GitDrop is a locally run web application that turns a GitHub repository into personal file storage. It offloads files from your local disk directly to GitHub without cloning repositories, keeping local storage usage close to zero.

## What it does

GitDrop connects to GitHub using a personal access token and provides a GitHub-style interface for uploading and browsing files.

**Uploading** — Select or create a repository and destination folder, then upload individual files or entire folders recursively while preserving their structure. Smaller files are committed directly, while large files and videos are uploaded as release assets. Conflicts are detected beforehand, with options to overwrite, keep both, or skip. Unchanged files are skipped automatically, and upload progress is shown in real time.

**Browsing and retrieval** — Browse repository contents and release assets with search, bulk download, and bulk delete with confirmation.

**Branches** — Browse existing branches or upload to them, and create new branches directly from the interface.

## Who this is for

GitDrop is intended for individual developers and students who want a simple, self-hosted way to store personal files and media on GitHub without a third-party sync service. Familiarity with GitHub and personal access tokens is assumed. It is not a replacement for proper backups of irreplaceable data.

## Reporting issues

Please open an issue with what you tried, what you expected, and what happened. Screenshots or browser/server error messages are helpful.

## License and usage

For personal and educational use only, provided as-is without warranty. All rights are reserved. Redistribution, modification, or commercial use beyond personal, non-commercial purposes requires permission.

Copyright © 2026 me. All rights reserved.

---

## Project structure

```
gitdrop/
├── backend/
│   ├── server.js
│   ├── config.js
│   ├── limits.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── repos.js
│   │   ├── tree.js
│   │   ├── fs.js
│   │   ├── plan.js
│   │   ├── upload.js
│   │   ├── release.js
│   │   ├── browse.js
│   │   └── progress.js
│   └── utils/
│       ├── blobHash.js
│       ├── walkFolder.js
│       └── progressTracker.js
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   └── App.css
    └── vite.config.js
```

## Setup

### Requirements

- Node.js 20 or later
- A GitHub personal access token (classic), with the `repo` scope

### 1. Clone or download the project

```bash
git clone <repository-url>
cd gitdrop
```

### 2. Install the backend

```bash
cd backend
npm install
```

### 3. Install the frontend

```bash
cd ../frontend
npm install
```

### 4. Start the backend

```bash
cd ../backend
node --watch server.js
```

The backend runs at `http://127.0.0.1:3001`.

### 5. Start the frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:5173`.

### 6. Connect a GitHub account

On first load, generate a personal access token from GitHub under **Settings → Developer settings → Personal access tokens → Tokens (classic)**, with the `repo` scope checked. Paste this token into the connect screen to begin using the application.

The token is stored locally in a configuration file outside the project directory and is never sent anywhere other than directly to GitHub's API.

## Windows setup

This code base was written for linux based systems but still `No code changes` are required — paths are handled with Node's cross-platform path module throughout. Use PowerShell or Command Prompt in place of bash for the setup commands above.