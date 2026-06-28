# server.py
import os
import sys
import django
from django.core.management import call_command

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Set base directory to work after PyInstaller bundles it
BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE_DIR)

def ensure_database_exists():
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
        from config.settings import DATABASES
        
        db_config = DATABASES['default']
        db_name = db_config['NAME']
        db_user = db_config['USER']
        db_password = db_config['PASSWORD']
        db_host = db_config['HOST']
        db_port = db_config['PORT']
        
        # Connect to default 'postgres' database to check if the app database exists
        conn = psycopg2.connect(
            dbname='postgres',
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s;", [db_name])
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Database '{db_name}' does not exist. Auto-creating database...")
            cursor.execute(f"CREATE DATABASE {db_name};")
            print(f"Database '{db_name}' created successfully.")
        else:
            print(f"Database '{db_name}' already exists.")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Database auto-check failed: {e}. Attempting Django start anyway...", file=sys.stderr)

# Ensure database exists before Django initialization
ensure_database_exists()

django.setup()
call_command('migrate', '--run-syncdb')
call_command('runserver', '127.0.0.1:8000', '--noreload')