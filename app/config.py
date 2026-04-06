import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
    META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
    SHEET_ID = "1PGyE1TN5q1tEtoH5A-wxqS27DkONkNzp-hreL3OMJZw"
    API_VERSION = "v21.0"

settings = Settings()
