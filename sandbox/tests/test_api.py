import asyncio
import json
import os
import shutil
import tempfile
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.schemas import SSEEvent
from app.services.git_manager import GitManager


@pytest.fixture
def temp_workspace():
    """Create a clean temporary workspace for isolated tests."""
    temp_dir = tempfile.mkdtemp(prefix="claude_test_ws_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.mark.asyncio
async def test_health_check():
    """Verify the /health endpoint returns healthy."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "claude-code-sandbox"


@pytest.mark.asyncio
async def test_ide_config():
    """Verify /api/ide/config returns code-server details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/ide/config")
        assert response.status_code == 200
        data = response.json()
        assert "code_server_url" in data
        assert "workspace_dir" in data


@pytest.mark.asyncio
async def test_create_session():
    """Verify session creation endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/sessions",
            json={
                "session_name": "Test Session",
                "model": "claude-3-7-sonnet-20250219",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "session_id" in data
        assert data["session_name"] == "Test Session"


def test_sse_event_serialization():
    """Verify SSEEvent formats correctly according to the text/event-stream spec."""
    event = SSEEvent(
        event="tool_use",
        data={
            "session_id": "test-uuid",
            "name": "Bash",
            "input": {"command": "ls -la"},
        },
    )
    raw = event.to_sse_str()
    assert raw.startswith("event: tool_use\n")
    assert "data: " in raw
    assert raw.endswith("\n\n")

    # Extract JSON line
    for line in raw.splitlines():
        if line.startswith("data: "):
            payload = json.loads(line[6:])
            assert payload["session_id"] == "test-uuid"
            assert payload["name"] == "Bash"
            assert payload["input"]["command"] == "ls -la"


@pytest.mark.asyncio
async def test_git_manager_lifecycle(temp_workspace: Path):
    """Test git operations: init, status, commit, and diff tracking."""
    git_mgr = GitManager(temp_workspace)

    # 1. Check not a repo initially
    assert await git_mgr.is_repo() is False

    # 2. Init repo
    proc = await asyncio.create_subprocess_exec(
        "git", "init", "-b", "main",
        cwd=str(temp_workspace),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    assert await git_mgr.is_repo() is True

    # Configure git identity for test
    _, _, _ = await git_mgr._run_git("config", "user.name", "Test User")
    _, _, _ = await git_mgr._run_git("config", "user.email", "test@test.com")

    # 3. Create a file and verify it shows in status
    test_file = temp_workspace / "sample.py"
    test_file.write_text("def hello():\n    return 'world'\n")

    status = await git_mgr.get_status()
    assert status.is_repo is True
    assert "sample.py" in status.untracked_files
    assert status.is_clean is False

    # 4. Commit file
    _, _, _ = await git_mgr._run_git("add", "sample.py")
    _, _, _ = await git_mgr._run_git("commit", "-m", "Initial commit")

    status = await git_mgr.get_status()
    assert status.is_clean is True
    assert status.latest_commit is not None
    assert status.latest_commit.message == "Initial commit"

    # 5. Modify file and verify git diff
    test_file.write_text("def hello():\n    return 'updated world'\n")
    diff_res = await git_mgr.get_diff()
    assert "sample.py" in diff_res.files_changed
    assert "+    return 'updated world'" in diff_res.diff


@pytest.mark.asyncio
async def test_sse_streaming_endpoint(monkeypatch):
    """Verify POST /api/sessions/{session_id}/messages streams text/event-stream chunks."""
    from app.services.agent_runner import AgentRunner
    from collections.abc import AsyncIterator

    async def mock_run_stream(*args, **kwargs) -> AsyncIterator[str]:
        yield SSEEvent(
            event="session_init",
            data={"session_id": "test-session", "model": "claude-3-7-sonnet"},
        ).to_sse_str()
        yield SSEEvent(
            event="thinking",
            data={"session_id": "test-session", "thinking": "Analyzing bug..."},
        ).to_sse_str()
        yield SSEEvent(
            event="tool_use",
            data={"session_id": "test-session", "name": "Bash", "input": {"command": "git status"}},
        ).to_sse_str()
        yield SSEEvent(
            event="result",
            data={"session_id": "test-session", "subtype": "success", "result": "Done"},
        ).to_sse_str()

    monkeypatch.setattr(AgentRunner, "run_stream", mock_run_stream)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create session
        create_res = await client.post("/api/sessions", json={"session_name": "Stream Test"})
        session_id = create_res.json()["session_id"]

        # Stream messages
        async with client.stream(
            "POST",
            f"/api/sessions/{session_id}/messages?stream=true",
            json={"prompt": "Check git status"},
        ) as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]

            events = []
            async for line in response.aiter_lines():
                if line.startswith("event: "):
                    events.append(line[7:])

            assert "session_init" in events
            assert "thinking" in events
            assert "tool_use" in events
            assert "result" in events


def test_parse_repo_name_from_url():
    """Verify repo name parsing from various Git remote URL formats."""
    from app.services.git_manager import parse_repo_name_from_url

    assert parse_repo_name_from_url("https://github.com/octocat/Spoon-Knife.git") == "Spoon-Knife"
    assert parse_repo_name_from_url("https://github.com/org/auth-service") == "auth-service"
    assert parse_repo_name_from_url("git@github.com:company/billing-api.git") == "billing-api"
    assert parse_repo_name_from_url("https://gitlab.com/group/subgroup/microservice.git/") == "microservice"


@pytest.mark.asyncio
async def test_workspace_git_manager_multi_repo(temp_workspace: Path):
    """Test WorkspaceGitManager handling multiple repositories and .code-workspace generation."""
    from app.services.git_manager import WorkspaceGitManager

    ws_mgr = WorkspaceGitManager(temp_workspace)
    assert ws_mgr.list_repositories() == []

    # Create two child repos
    repo_a = temp_workspace / "auth-service"
    repo_b = temp_workspace / "gateway-service"
    repo_a.mkdir()
    repo_b.mkdir()

    for r_dir in (repo_a, repo_b):
        proc = await asyncio.create_subprocess_exec(
            "git", "init", "-b", "main",
            cwd=str(r_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

    # Verify discovery
    repos = ws_mgr.list_repositories()
    assert sorted(repos) == ["auth-service", "gateway-service"]

    # Verify code-workspace file generation
    code_ws = ws_mgr.update_code_workspace_file()
    assert code_ws.exists()
    ws_json = json.loads(code_ws.read_text())
    assert "folders" in ws_json
    folder_names = [f["name"] for f in ws_json["folders"]]
    assert "auth-service" in folder_names
    assert "gateway-service" in folder_names

    # Verify summary
    summary = await ws_mgr.get_workspace_repos_summary()
    assert len(summary.repositories) == 2
    repo_names = [r.name for r in summary.repositories]
    assert "auth-service" in repo_names
    assert "gateway-service" in repo_names


@pytest.mark.asyncio
async def test_multi_repo_session_creation(temp_workspace: Path):
    """Verify session creation endpoint with ticket_id, target_repo, and multi-repo response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/sessions",
            json={
                "ticket_id": "AUTH-1024",
                "target_repo": "auth-service",
                "session_name": "Hotfix AUTH-1024",
                "workspace_dir": str(temp_workspace),
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["ticket_id"] == "AUTH-1024"
        assert data["target_repo"] == "auth-service"
        assert "session_id" in data

        session_id = data["session_id"]
        detail_res = await client.get(f"/api/sessions/{session_id}")
        assert detail_res.status_code == 200
        detail_data = detail_res.json()
        assert detail_data["ticket_id"] == "AUTH-1024"
        assert detail_data["target_repo"] == "auth-service"


@pytest.mark.asyncio
async def test_workspace_skills_sync(temp_workspace: Path):
    """Verify synchronizing and materializing skills in the sandbox workspace."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        sync_res = await client.post(
            f"/api/workspace/skills?workspace_dir={temp_workspace}",
            json={
                "skills": [
                    {
                        "skill_id": "skill-101",
                        "name": "AWS Deployer",
                        "slug": "aws-deployer",
                        "content": "# AWS Deployer\nDeploy using CDK.",
                        "version": 1
                    }
                ]
            }
        )
        assert sync_res.status_code == 201
        data = sync_res.json()
        assert data["synchronized_count"] == 1

        # Check file was materialized on disk
        skill_file = temp_workspace / ".claude" / "skills" / "aws-deployer" / "SKILL.md"
        assert skill_file.exists()
        assert "Deploy using CDK" in skill_file.read_text()

        # Check installed skills list
        list_res = await client.get(f"/api/workspace/skills?workspace_dir={temp_workspace}")
        assert list_res.status_code == 200
        installed = list_res.json()
        assert installed["installed_count"] >= 1
        assert any(s["slug"] == "aws-deployer" for s in installed["skills"])



