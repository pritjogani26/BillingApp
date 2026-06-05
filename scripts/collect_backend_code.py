import os
import argparse
from datetime import datetime

DEFAULT_EXTENSIONS = {".py", ".txt", ".md", ".json", ".yaml", ".yml", ".env", ".sql"}
DEFAULT_EXCLUDES = {
    "venv",
    "env",
    "__pycache__",
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "migrations",
    ".pytest_cache",
}


def should_skip_dir(dirname: str, excludes: set) -> bool:
    return dirname in excludes


def should_include_file(filename: str, extensions: set, excludes: set) -> bool:
    if filename in excludes:
        return False
    return os.path.splitext(filename)[1] in extensions


def collect_code(root_dir: str, output_file: str, extensions=None, excludes=None):
    extensions = extensions or DEFAULT_EXTENSIONS
    excludes = excludes or DEFAULT_EXCLUDES
    if not os.path.exists(root_dir):
        raise FileNotFoundError(f"Directory not found: {root_dir}")
    total_files = 0
    with open(output_file, "w", encoding="utf-8") as outfile:
        outfile.write("=" * 80 + "\n")
        outfile.write(f"PROJECT CODE EXPORT\n")
        outfile.write(f"Root Directory: {root_dir}\n")
        outfile.write(f"Generated At : {datetime.now()}\n")
        outfile.write("=" * 80 + "\n\n")
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if not should_skip_dir(d, excludes)]
            files.sort()
            for file in files:
                if not should_include_file(file, extensions, excludes):
                    continue
                file_path = os.path.join(root, file)
                try:
                    rel_path = os.path.relpath(file_path, root_dir)
                    outfile.write("\n" + "-" * 80 + "\n")
                    outfile.write(f"FILE: {rel_path}\n")
                    outfile.write("-" * 80 + "\n\n")
                    with open(file_path, "r", encoding="utf-8") as infile:
                        outfile.write(infile.read())
                    outfile.write("\n\n")
                    total_files += 1
                except Exception as e:
                    print(f"⚠️ Skipping {file_path}: {e}")
    print(f"\n✅ {total_files} files collected successfully.")
    print(f"📁 Output file: {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Collect project code into a single file."
    )
    parser.add_argument("root", help="Root project directory")
    parser.add_argument("output", help="Output file name")
    root_dir = os.getcwd()
    print(root_dir)
    root_dir = r"E:\BillingApp\BillingApp"
    output_file = r"E:\BillingApp\scripts\backend_full_code.txt"
    collect_code(root_dir, output_file)
