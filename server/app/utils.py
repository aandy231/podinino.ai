import re
import secrets
import string

def generate_secure_password(length: int = 16) -> str:
    """
    Generates a secure, random alphanumeric password for code-server authentication.
    """
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

def sanitize_workspace_id(workspace_id: str) -> str:
    """
    Sanitizes a workspace ID to make it compatible with Kubernetes resource naming conventions:
    - Lowercase alphanumeric characters or '-'
    - Starts and ends with an alphanumeric character
    - Max 48 characters (leaving room for prefixes/suffixes like -service, -ingress, -pvc)
    """
    # Convert to lowercase
    cleaned = workspace_id.lower()
    # Replace non-alphanumeric/hyphen characters with hyphen
    cleaned = re.sub(r"[^a-z0-9\-]", "-", cleaned)
    # Remove leading/trailing hyphens
    cleaned = cleaned.strip("-")
    # Truncate if necessary
    return cleaned[:48]


def encrypt_password(password: str) -> str:
    """
    Encrypts a plain text password using symmetric encryption (Fernet).
    """
    from cryptography.fernet import Fernet
    from app.config import settings
    f = Fernet(settings.ENCRYPTION_KEY.encode())
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """
    Decrypts a cipher text password back to plain text.
    """
    from cryptography.fernet import Fernet
    from app.config import settings
    f = Fernet(settings.ENCRYPTION_KEY.encode())
    return f.decrypt(encrypted_password.encode()).decode()

