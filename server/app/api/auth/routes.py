import httpx
import logging
from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.schemas.auth import GitHubAuthRequest, GitHubAuthResponse, GitHubUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post(
    "/github", 
    response_model=GitHubAuthResponse, 
    status_code=status.HTTP_200_OK
)
async def exchange_github_code(request: GitHubAuthRequest):
    """
    Exchanges the temporary GitHub authorization code for a access token,
    then retrieves the user profile details.
    """
    code = request.code
    
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        logger.error("GitHub Client ID or Secret is not configured in settings.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GitHub OAuth is not configured on this server."
        )

    redirect_uri = request.redirect_uri or settings.GITHUB_REDIRECT_URI
    token_payload = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
        "code": code,
    }
    if redirect_uri:
        token_payload["redirect_uri"] = redirect_uri

    # 1. Exchange temporary code for access token
    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data=token_payload,
                timeout=10.0
            )
        except httpx.RequestError as exc:
            logger.error(f"Network error exchanging code with GitHub: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to connect to GitHub auth servers."
            )

        if token_response.status_code != 200:
            logger.error(f"GitHub token exchange returned status {token_response.status_code}: {token_response.text}")
            raise HTTPException(
                status_code=token_response.status_code,
                detail="Failed to exchange authorization code."
            )

        token_data = token_response.json()
        
        # Check if GitHub returned an OAuth error (e.g. invalid code)
        if "error" in token_data:
            error_name = token_data.get("error")
            error_desc = token_data.get("error_description", error_name)
            logger.warning(f"GitHub OAuth error during exchange: {error_name} - {error_desc}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"GitHub OAuth Error ({error_name}): {error_desc}"
            )
            
        access_token = token_data.get("access_token")
        if not access_token:
            logger.error(f"No access token in response from GitHub: {token_data}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to retrieve access token from GitHub."
            )

        # 2. Retrieve user profile details using the access token
        try:
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {access_token}",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "AI-Sandbox-Auth-Service"
                },
                timeout=10.0
            )
        except httpx.RequestError as exc:
            logger.error(f"Network error fetching user profile from GitHub: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to connect to GitHub API to fetch user profile."
            )

        if user_response.status_code != 200:
            logger.error(f"GitHub user profile fetch failed with status {user_response.status_code}: {user_response.text}")
            raise HTTPException(
                status_code=user_response.status_code,
                detail="Failed to fetch user profile details from GitHub."
            )

        user_data = user_response.json()
        
        # Optionally try to get user's primary public email if it's private/null in profile
        email = user_data.get("email")
        if not email:
            try:
                emails_response = await client.get(
                    "https://api.github.com/user/emails",
                    headers={
                        "Accept": "application/vnd.github+json",
                        "Authorization": f"Bearer {access_token}",
                        "X-GitHub-Api-Version": "2022-11-28",
                        "User-Agent": "AI-Sandbox-Auth-Service"
                    },
                    timeout=5.0
                )
                if emails_response.status_code == 200:
                    emails = emails_response.json()
                    # Find primary email
                    primary_email = next((e.get("email") for e in emails if e.get("primary")), None)
                    if primary_email:
                        email = primary_email
            except Exception as email_err:
                logger.warning(f"Failed to fetch detailed emails from GitHub: {email_err}")

        # Construct the response
        user_profile = GitHubUser(
            id=user_data.get("id"),
            login=user_data.get("login"),
            name=user_data.get("name") or user_data.get("login"),
            email=email,
            avatar_url=user_data.get("avatar_url")
        )

        return GitHubAuthResponse(
            access_token=access_token,
            user=user_profile
        )
