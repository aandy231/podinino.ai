import hashlib
import re
from typing import Tuple
from fastapi import HTTPException, status
from app.config import settings


def slugify(text: str) -> str:
    """Generate a clean URL-friendly slug from text."""
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug or "skill"


def compute_sha256(content: str) -> str:
    """Compute SHA-256 hash of text content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def validate_and_normalize_skill_file(
    filename: str,
    file_bytes: bytes
) -> Tuple[str, str]:
    """
    Validates uploaded file against requirements:
    - Expected file extension is .md (case-insensitive)
    - Normalized filename is 'SKILL.md'
    - Size within limits (MAX_UPLOAD_SIZE_BYTES)
    - Reject binary files, ZIPs, executables, or null bytes
    - Valid UTF-8 encoding
    - Non-empty meaningful content

    Returns:
        Tuple[normalized_filename, decoded_content]
    """
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required for skill instruction upload."
        )

    # Check extension
    lower_name = filename.strip().lower()
    if not lower_name.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{filename}'. Skill instructions must be a Markdown file (.md)."
        )

    # Check size
    size_bytes = len(file_bytes)
    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded SKILL.md file cannot be empty."
        )

    if size_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // 1024} KB."
        )

    # Reject common binary magic numbers (ZIP archives, ELF, Mach-O, Windows PE, etc.)
    if file_bytes.startswith(b"PK\x03\x04") or file_bytes.startswith(b"PK\x05\x06"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ZIP archives are not accepted. Upload a single plain SKILL.md Markdown file."
        )
    if file_bytes.startswith(b"\x7fELF") or file_bytes.startswith(b"\xca\xfe\xba\xbe") or file_bytes.startswith(b"MZ"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Binary executables are not accepted as skills."
        )

    # Null byte check
    if b"\x00" in file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Binary content detected. SKILL.md must be a valid UTF-8 text file."
        )

    # Decode UTF-8
    try:
        content = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encoding error: SKILL.md must be valid UTF-8 text."
        )

    # Content length check
    if len(content.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SKILL.md content is too short. Please provide meaningful skill instructions."
        )

    return "SKILL.md", content
