import os
import shutil
import datetime
import subprocess
import tempfile

from django.conf import settings
from django.http import FileResponse
from django.db import connection
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from accounts.common.auth import JWTAuthentication


def _find_pg_dump():
    """
    Locate pg_dump. Critical for a PyInstaller-frozen app, since the
    target machine's PATH may not include PostgreSQL's bin folder.
    """
    # 1. Explicit override via .env — most reliable for a deployed .exe
    env_path = os.environ.get('PG_DUMP_PATH')
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Try PATH
    found = shutil.which('pg_dump')
    if found:
        return found

    # 3. Dynamic lookup in C:\Program Files\PostgreSQL (prefers newest version)
    pg_base_dir = r"C:\Program Files\PostgreSQL"
    if os.path.exists(pg_base_dir):
        try:
            # Sort subdirs (like ['18', '17']) numerically descending
            def subdir_sort_key(name):
                try:
                    return float(name)
                except ValueError:
                    return 0.0

            subdirs = sorted(os.listdir(pg_base_dir), key=subdir_sort_key, reverse=True)
            for subdir in subdirs:
                candidate = os.path.join(pg_base_dir, subdir, "bin", "pg_dump.exe")
                if os.path.exists(candidate):
                    return candidate
        except Exception as e:
            print(f"[pg_dump dynamic search error] {e}")

    # 4. Common Windows install locations fallback
    common_paths = [
        r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
    ]
    for path in common_paths:
        if os.path.exists(path):
            return path

    return None


class BackupDatabaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        db = settings.DATABASES['default']

        pg_dump_path = _find_pg_dump()
        if not pg_dump_path:
            return Response(
                {"error": "pg_dump executable not found. Set PG_DUMP_PATH in .env."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Use BACKUP_DIR from settings
        backup_dir = settings.BACKUP_DIR
        os.makedirs(backup_dir, exist_ok=True)

        # Cleanup old backups (older than 7 days) to prevent disk bloat
        try:
            now = datetime.datetime.now()
            for f in os.listdir(backup_dir):
                if f.startswith("backup_") and (f.endswith(".dump") or f.endswith(".sql.gz")):
                    fp = os.path.join(backup_dir, f)
                    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(fp))
                    if (now - mtime).days > 7:
                        os.remove(fp)
        except Exception as e:
            print(f"[Backup cleanup error] {e}")

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"backup_{db['NAME']}_{timestamp}.dump"
        filepath = os.path.join(backup_dir, filename)

        env = os.environ.copy()
        env['PGPASSWORD'] = db['PASSWORD']

        cmd = [
            pg_dump_path,
            '-h', db['HOST'],
            '-p', str(db['PORT']),
            '-U', db['USER'],
            '-F', 'c',          # custom format, compressed, usable with pg_restore
            '-f', str(filepath),
            db['NAME'],
        ]

        try:
            result = subprocess.run(
                cmd, env=env, capture_output=True, text=True, timeout=300
            )
        except subprocess.TimeoutExpired:
            return Response({"error": "Backup timed out."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except FileNotFoundError:
            return Response({"error": f"pg_dump not found at {pg_dump_path}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if result.returncode != 0:
            print(f"[pg_dump error] {result.stderr}")
            return Response(
                {"error": f"Backup failed: {result.stderr.strip()}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        try:
            response = FileResponse(
                open(filepath, 'rb'),
                as_attachment=True,
                filename=filename
            )
            return response
        except Exception as e:
            return Response(
                {"error": f"Failed to serve backup file: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RestoreDatabaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    parser_classes         = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        # Enforce SUPERADMIN role restriction (role_id = 1)
        if getattr(request.user, 'role', None) != 'SUPERADMIN':
            return Response(
                {"error": "Permission denied. Only Super Admins can restore the database."},
                status=status.HTTP_403_FORBIDDEN
            )

        if 'file' not in request.FILES:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        db = settings.DATABASES['default']

        pg_dump_path = _find_pg_dump()
        if not pg_dump_path:
            return Response(
                {"error": "pg_dump/pg_restore executables not found. Set PG_DUMP_PATH in .env."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        pg_restore_path = pg_dump_path.replace('pg_dump.exe', 'pg_restore.exe')
        if not os.path.exists(pg_restore_path):
            return Response(
                {"error": f"pg_restore executable not found at {pg_restore_path}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 1. Save uploaded file to a temporary location
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.dump') as temp_file:
                for chunk in uploaded_file.chunks():
                    temp_file.write(chunk)
                temp_filepath = temp_file.name
        except Exception as e:
            return Response(
                {"error": f"Failed to save uploaded file: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 2. Terminate other connections and drop/recreate public schema
        try:
            db_name = db['NAME']
            with connection.cursor() as cursor:
                # Terminate other connections to database to prevent lock issues
                cursor.execute(
                    """
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = %s
                      AND pid <> pg_backend_pid();
                    """,
                    [db_name]
                )
                # Clean drop of schema public and recreate
                cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
                cursor.execute("CREATE SCHEMA public;")
                cursor.execute("GRANT ALL ON SCHEMA public TO public;")
                cursor.execute("GRANT ALL ON SCHEMA public TO postgres;")
        except Exception as e:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
            return Response(
                {"error": f"Database preparation failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 3. Run pg_restore
        env = os.environ.copy()
        env['PGPASSWORD'] = db['PASSWORD']

        cmd = [
            pg_restore_path,
            '-h', db['HOST'],
            '-p', str(db['PORT']),
            '-U', db['USER'],
            '-d', db['NAME'],
            str(temp_filepath),
        ]

        try:
            result = subprocess.run(
                cmd, env=env, capture_output=True, text=True, timeout=300
            )
        except subprocess.TimeoutExpired:
            return Response({"error": "Restore operation timed out."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            # Clean up the temp file
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)

        # pg_restore exit status 0 (success) or 1 (success with warnings) is fine.
        # Exit status > 1 is fatal.
        if result.returncode > 1:
            print(f"[pg_restore error] {result.stderr}")
            return Response(
                {"error": f"Database restore failed: {result.stderr.strip()}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response({"success": True, "message": "Database restored successfully."})


class DatabaseNameView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        db_name = settings.DATABASES['default']['NAME']
        return Response({"database_name": db_name})