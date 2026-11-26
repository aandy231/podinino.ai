# Developer Pod Dockerfile: FastAPI Claude Agent Service + code-server

# Build stage for python dependencies
FROM python:3.12-slim-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com --prefix=/install -r requirements.txt

# Final Runtime Stage
FROM python:3.12-slim-bookworm

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV WORKSPACE_DIR=/workspace

# Configure Debian mirror to bypass ISP Fastly packet loss
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true

# Install system runtime dependencies (excluding heavy build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    supervisor \
    ca-certificates \
    procps \
    sudo \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install GitHub CLI (gh) for Pull Requests and GitHub API operations
RUN mkdir -p -m 755 /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Node.js 20 LTS (required for Claude Code runtime and ecosystem tools)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm cache clean --force && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code && \
    npm cache clean --force

# Install code-server (VS Code in the browser) and clean caches
RUN curl -fsSL https://code-server.dev/install.sh | sh && \
    rm -rf /root/.cache /tmp/* /var/tmp/*

# Create non-root developer user (UID 1000)
RUN useradd -m -s /bin/bash -u 1000 developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Setup directories
WORKDIR /app
RUN mkdir -p /workspace /etc/supervisor/conf.d && \
    chown -R developer:developer /app /workspace

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy application source code
COPY app /app/app
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN chown -R developer:developer /app /etc/supervisor/conf.d

# Configure git identity for developer user
USER developer
RUN git config --global user.name "Claude Agent" && \
    git config --global user.email "claude-agent@sandbox.local" && \
    git config --global init.defaultBranch main

# Switch back to root for supervisor startup (supervisor drops privileges per program)
USER root
WORKDIR /workspace

# Expose ports: 8000 for FastAPI Agent Service, 8080 for code-server IDE
EXPOSE 8000 8080

# Start supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
