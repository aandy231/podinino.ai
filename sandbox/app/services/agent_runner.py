import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    TaskNotificationMessage,
    TaskProgressMessage,
    TaskStartedMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)
from app.models.schemas import MessageSyncResponse, SSEEvent
from app.services.session_manager import ActiveSessionContext, session_manager

logger = logging.getLogger(__name__)


class AgentRunner:
    """Orchestrates Claude Agent SDK execution and formats streaming SSE / sync responses."""

    @staticmethod
    async def run_stream(
        context: ActiveSessionContext,
        prompt: str,
        allowed_tools: Optional[list[str]] = None,
        max_turns: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """
        Execute an agent turn and yield formatted SSE lines in real-time.
        """
        session_id = context.session_id
        logger.info(f"Starting agent streaming turn for session {session_id}")

        # Emit session_init event
        init_event = SSEEvent(
            event="session_init",
            data={
                "session_id": session_id,
                "prompt": prompt,
                "model": context.model,
                "workspace_dir": str(context.workspace_path),
                "ticket_id": context.ticket_id,
                "target_repo": context.target_repo,
                "repos": context.repos,
                "timestamp": time.time(),
            },
        )
        yield init_event.to_sse_str()

        context.is_running = True
        try:
            client = await session_manager.get_or_create_client(
                context=context,
                allowed_tools=allowed_tools,
            )

            # Drain any stale messages from prior turns or interruptions
            if hasattr(client, "_query") and hasattr(client._query, "_message_receive"):
                recv_stream = client._query._message_receive
                if hasattr(recv_stream, "receive_nowait"):
                    import anyio
                    while True:
                        try:
                            recv_stream.receive_nowait()
                        except (anyio.WouldBlock, anyio.EndOfStream, Exception):
                            break

            # Send prompt
            await client.query(prompt)

            # Receive and stream response blocks
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, ThinkingBlock):
                            event = SSEEvent(
                                event="thinking",
                                data={
                                    "session_id": session_id,
                                    "thinking": block.thinking,
                                    "signature": getattr(block, "signature", None),
                                    "timestamp": time.time(),
                                },
                            )
                            yield event.to_sse_str()

                        elif isinstance(block, ToolUseBlock):
                            event = SSEEvent(
                                event="tool_use",
                                data={
                                    "session_id": session_id,
                                    "tool_use_id": block.id,
                                    "name": block.name,
                                    "input": block.input,
                                    "timestamp": time.time(),
                                },
                            )
                            yield event.to_sse_str()

                        elif isinstance(block, TextBlock):
                            event = SSEEvent(
                                event="text",
                                data={
                                    "session_id": session_id,
                                    "text": block.text,
                                    "timestamp": time.time(),
                                },
                            )
                            yield event.to_sse_str()

                elif isinstance(message, UserMessage):
                    # Tool results are reported in UserMessages
                    for block in message.content:
                        if isinstance(block, ToolResultBlock):
                            # Normalize content to string or dict
                            content_val = block.content
                            if isinstance(content_val, list):
                                # List of text or image blocks
                                str_parts = []
                                for item in content_val:
                                    if isinstance(item, dict) and "text" in item:
                                        str_parts.append(item["text"])
                                    elif hasattr(item, "text"):
                                        str_parts.append(getattr(item, "text"))
                                    else:
                                        str_parts.append(str(item))
                                out_text = "\n".join(str_parts)
                            else:
                                out_text = str(content_val)

                            event = SSEEvent(
                                event="tool_result",
                                data={
                                    "session_id": session_id,
                                    "tool_use_id": block.tool_use_id,
                                    "output": out_text,
                                    "is_error": bool(block.is_error),
                                    "timestamp": time.time(),
                                },
                            )
                            yield event.to_sse_str()

                elif isinstance(message, (TaskStartedMessage, TaskProgressMessage, TaskNotificationMessage)):
                    event = SSEEvent(
                        event="status",
                        data={
                            "session_id": session_id,
                            "type": type(message).__name__,
                            "details": getattr(message, "status", str(message)),
                            "timestamp": time.time(),
                        },
                    )
                    yield event.to_sse_str()

                elif isinstance(message, ResultMessage):
                    event = SSEEvent(
                        event="result",
                        data={
                            "session_id": session_id,
                            "subtype": message.subtype,
                            "result": message.result,
                            "total_cost_usd": message.total_cost_usd,
                            "duration_ms": message.duration_ms,
                            "num_turns": message.num_turns,
                            "is_error": message.is_error,
                            "stop_reason": message.stop_reason,
                            "timestamp": time.time(),
                        },
                    )
                    yield event.to_sse_str()

        except asyncio.CancelledError:
            logger.info(f"Agent turn for session {session_id} was cancelled/interrupted")
            try:
                if 'client' in locals() and client:
                    await client.interrupt()
            except Exception:
                pass
            if 'client' in locals() and hasattr(client, "_query") and hasattr(client._query, "_message_receive"):
                recv_stream = client._query._message_receive
                if hasattr(recv_stream, "receive_nowait"):
                    import anyio
                    while True:
                        try:
                            recv_stream.receive_nowait()
                        except (anyio.WouldBlock, anyio.EndOfStream, Exception):
                            break
            event = SSEEvent(
                event="status",
                data={
                    "session_id": session_id,
                    "status": "interrupted",
                    "message": "Agent execution interrupted",
                    "timestamp": time.time(),
                },
            )
            yield event.to_sse_str()
        except Exception as e:
            logger.error(f"Error during agent turn for session {session_id}: {e}", exc_info=True)
            err_event = SSEEvent(
                event="error",
                data={
                    "session_id": session_id,
                    "error": str(e),
                    "timestamp": time.time(),
                },
            )
            yield err_event.to_sse_str()
        finally:
            context.is_running = False

    @staticmethod
    async def run_sync(
        context: ActiveSessionContext,
        prompt: str,
        allowed_tools: Optional[list[str]] = None,
        max_turns: Optional[int] = None,
    ) -> MessageSyncResponse:
        """
        Execute an agent turn and collect the final results as a synchronous JSON response.
        """
        start_time = time.time()
        session_id = context.session_id
        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        result_msg: Optional[ResultMessage] = None
        status = "success"

        context.is_running = True
        try:
            client = await session_manager.get_or_create_client(
                context=context,
                allowed_tools=allowed_tools,
            )

            await client.query(prompt)

            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            text_parts.append(block.text)
                        elif isinstance(block, ToolUseBlock):
                            tool_calls.append({
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            })
                elif isinstance(message, ResultMessage):
                    result_msg = message
                    if message.is_error or message.subtype != "success":
                        status = "error"

        except asyncio.CancelledError:
            status = "interrupted"
        except Exception as e:
            logger.error(f"Sync execution failed for session {session_id}: {e}")
            status = "error"
            text_parts.append(f"Execution failed: {e}")
        finally:
            context.is_running = False

        duration_ms = int((time.time() - start_time) * 1000)

        return MessageSyncResponse(
            session_id=session_id,
            status=status,
            response_text="".join(text_parts),
            tool_calls=tool_calls,
            total_cost_usd=result_msg.total_cost_usd if result_msg else None,
            duration_ms=result_msg.duration_ms if result_msg else duration_ms,
            num_turns=result_msg.num_turns if result_msg else None,
        )


agent_runner = AgentRunner()
