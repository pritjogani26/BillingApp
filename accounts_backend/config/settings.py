# config\settings.py
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = 'django-insecure-gcefzcoxjldym==7x!s1j0$bk#bf3*jxdc1f(r^53bs6gjbfo1'
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]


DJANGO_APPS = [
    "django.contrib.sessions",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "drf_yasg",
]

LOCAL_APPS = ["accounts"]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = 'config.urls'

JWT_SECRET       = os.environ.get('JWT_SECRET', 'django-insecure-gcefzcoxjldym==7x!s1j0$bk#bf3*jxdc1f(r^53bs6gjbfo1')
JWT_EXPIRY_HOURS = 168

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "joganiaccounts",
        "USER": "postgres",
        "PASSWORD": "admin",
        "HOST": "localhost",
        "PORT": "5432",
    }
}

# CORS_ALLOWED_ORIGINS  = ['http://localhost:5173']
CORS_ALLOW_ALL_ORIGINS  = True
CORS_ALLOW_CREDENTIALS = True
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SAMESITE = 'Lax'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_PERMISSION_CLASSES':     [],
}


AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
USE_TZ = True
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'accounts' / 'static']
BACKUP_DIR = BASE_DIR / "backups" 

MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'