# server.py
import os
import sys
import django
from django.core.management import call_command

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Set base directory to work after PyInstaller bundles it
BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE_DIR)

django.setup()
call_command('migrate', '--run-syncdb')
call_command('runserver', '127.0.0.1:8000', '--noreload')