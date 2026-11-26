# Podi UI Service (`podi-ui-service`)

This repository contains the React frontend for Podi UI Service (`podi-ui-service`), built with React, Vite, and Lucide React icons.

## Prerequisites

Before starting, ensure you have the following installed on your local machine:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (usually bundled with Node.js)

## Getting Started

Follow these steps to run the application locally:

### 1. Install Dependencies

In the root of the project directory, run:
```bash
npm install
```

### 2. Start the Development Server

To start the Vite development server with Hot Module Replacement (HMR):
```bash
npm run dev
```

By default, this will start the server at [http://localhost:5173](http://localhost:5173).

### 3. Build for Production (Optional)

To create a production-ready build in the `dist` directory:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

## Running the Backend Dependencies

For full functionality (creating workspaces, authenticating with GitHub, etc.), podi-ui-service relies on two backend services:

1. **Spinup Service**
   - **Address:** `http://localhost:8000`
   - Used for managing workspace lifecycle and configuration.

2. **Integration Service**
   - **Address:** `http://localhost:8081`
   - Used for GitHub OAuth and repository access integrations.

Make sure these backend services are started and listening on their respective ports.
