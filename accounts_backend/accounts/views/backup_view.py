import os
import gzip
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from rest_framework import generics, status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from google.oauth2 import service_account
    from googleapiclient.errors import HttpError
    GOOGLE_DRIVE_AVAILABLE = True
except ImportError:
    GOOGLE_DRIVE_AVAILABLE = False

# ─── Constants ────────────────────────────────────────────────────────────────

BACKUP_DIR  = Path(settings.BASE_DIR) / "backups"
CONFIG_FILE = Path(settings.BASE_DIR) / "backup_config.json"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_config(config: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def _get_drive_service(credentials_info: dict):
    creds = service_account.Credentials.from_service_account_info(
        credentials_info, scopes=DRIVE_SCOPES
    )
    return build("drive", "v3", credentials=creds)


def _human_size(size_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# ─── Views ────────────────────────────────────────────────────────────────────

class CreateBackupView(generics.GenericAPIView):
    """
    POST /backups/create/
    Dumps the PostgreSQL database with pg_dump, compresses it with gzip,
    saves it locally, and — if Google Drive is configured — uploads it there.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        sql_name  = f"backup_{timestamp}.sql"
        gz_name   = f"backup_{timestamp}.sql.gz"
        sql_path  = BACKUP_DIR / sql_name
        gz_path   = BACKUP_DIR / gz_name

        db  = settings.DATABASES["default"]
        env = os.environ.copy()
        env["PGPASSWORD"] = db.get("PASSWORD", "")

        # ── 1. pg_dump ────────────────────────────────────────────────────────
        try:
            result = subprocess.run(
                [
                    "pg_dump",
                    "-h", db.get("HOST", "localhost"),
                    "-p", str(db.get("PORT", 5432)),
                    "-U", db["USER"],
                    "-d", db["NAME"],
                    "--format=plain",
                    f"--file={sql_path}",
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except FileNotFoundError:
            return Response(
                {"error": "pg_dump not found. Make sure PostgreSQL bin directory is in PATH."},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {"error": "Backup timed out (exceeded 10 minutes)."},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if result.returncode != 0:
            return Response(
                {"error": f"pg_dump failed: {result.stderr.strip()}"},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # ── 2. Compress ───────────────────────────────────────────────────────
        try:
            with open(sql_path, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
            sql_path.unlink()  # remove uncompressed copy
        except Exception as e:
            return Response(
                {"error": f"Compression failed: {e}"},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        file_size = gz_path.stat().st_size

        # ── 3. Google Drive upload (optional) ─────────────────────────────────
        drive_status  = "not_configured"
        drive_file_id = None
        drive_link    = None
        config        = _load_config()

        if config.get("credentials") and config.get("folder_id"):
            if not GOOGLE_DRIVE_AVAILABLE:
                drive_status = "libraries_missing"
            else:
                try:
                    service       = _get_drive_service(config["credentials"])
                    file_metadata = {"name": gz_name, "parents": [config["folder_id"]]}
                    media         = MediaFileUpload(str(gz_path), mimetype="application/gzip", resumable=True)
                    uploaded      = service.files().create(
                        body=file_metadata, media_body=media, fields="id,webViewLink"
                    ).execute()
                    drive_file_id = uploaded.get("id")
                    drive_link    = uploaded.get("webViewLink")
                    drive_status  = "uploaded"
                except HttpError as e:
                    drive_status = f"upload_failed: {e}"
                except Exception as e:
                    drive_status = f"upload_failed: {e}"

        return Response({
            "success":       True,
            "filename":      gz_name,
            "size":          file_size,
            "size_readable": _human_size(file_size),
            "created_at":    timestamp,
            "drive_status":  drive_status,
            "drive_file_id": drive_file_id,
            "drive_link":    drive_link,
        })


class ListBackupsView(generics.GenericAPIView):
    """
    GET /backups/
    Returns a list of local backup files, newest first.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        backups = []
        for f in sorted(BACKUP_DIR.glob("backup_*.sql.gz"), reverse=True):
            stat = f.stat()
            backups.append({
                "filename":      f.name,
                "size":          stat.st_size,
                "size_readable": _human_size(stat.st_size),
                "created_at":    datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            })

        return Response({"backups": backups, "backup_dir": str(BACKUP_DIR)})


class DeleteBackupView(generics.GenericAPIView):
    """
    DELETE /backups/<filename>/
    Deletes a single local backup file.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, filename: str, *args, **kwargs):
        if (
            not filename.startswith("backup_")
            or not filename.endswith(".sql.gz")
            or "/" in filename
            or "\\" in filename
        ):
            return Response(
                {"error": "Invalid filename."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        file_path = BACKUP_DIR / filename
        if not file_path.exists():
            return Response(
                {"error": "File not found."},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        file_path.unlink()
        return Response({"success": True, "deleted": filename})


class ConfigureDriveView(generics.GenericAPIView):
    """
    POST /backups/drive/configure/
    Validates and saves a Google Drive service-account configuration.

    Body:
        credentials  – parsed JSON object from the service-account key file
        folder_id    – Google Drive folder ID (from the folder URL)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not GOOGLE_DRIVE_AVAILABLE:
            return Response(
                {
                    "error": (
                        "Google API libraries are not installed. "
                        "Run: pip install google-api-python-client google-auth google-auth-httplib2"
                    )
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        credentials = request.data.get("credentials")
        folder_id   = (request.data.get("folder_id") or "").strip()

        if not credentials or not folder_id:
            return Response(
                {"error": "Both 'credentials' (JSON object) and 'folder_id' are required."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # Validate by making a real API call
        try:
            service = _get_drive_service(credentials)
            service.files().list(
                q=f"'{folder_id}' in parents",
                pageSize=1,
                fields="files(id)",
            ).execute()
        except HttpError as e:
            return Response(
                {"error": f"Google Drive rejected the request: {e}"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"error": f"Could not connect to Google Drive: {e}"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        config = _load_config()
        config["credentials"] = credentials
        config["folder_id"]   = folder_id
        _save_config(config)

        return Response({
            "success":               True,
            "message":               "Google Drive configured successfully.",
            "service_account_email": credentials.get("client_email", "unknown"),
            "folder_id":             folder_id,
        })

    def delete(self, request, *args, **kwargs):
        config = _load_config()
        config.pop("credentials", None)
        config.pop("folder_id", None)
        _save_config(config)
        return Response({"success": True, "message": "Google Drive configuration removed."})


class DriveStatusView(generics.GenericAPIView):
    """
    GET /backups/drive/status/
    Returns the current Google Drive configuration status.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        config        = _load_config()
        is_configured = bool(config.get("credentials") and config.get("folder_id"))

        payload = {"configured": is_configured}
        if is_configured:
            payload["folder_id"]             = config.get("folder_id", "")
            payload["service_account_email"] = config.get("credentials", {}).get("client_email", "")

        return Response(payload)