"""Fetch official Android build tools and an Eclipse Temurin JDK for local builds."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / '.build' / 'android-tools'
BUILD.mkdir(parents=True, exist_ok=True)


def fetch(url, target, checksum=None, algorithm='sha1'):
    if not target.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Haven-local-build'})
        with urllib.request.urlopen(request, timeout=90) as response, target.open('wb') as output:
            while data := response.read(1024 * 1024):
                output.write(data)
    if checksum and hashlib.new(algorithm, target.read_bytes()).hexdigest() != checksum:
        raise ValueError('Checksum mismatch: ' + target.name)


def unpack(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        for entry in source.namelist():
            if not (destination / entry).resolve().is_relative_to(destination.resolve()):
                raise ValueError('Unsafe archive entry')
        source.extractall(destination)


def sdk(name, filename, checksum):
    archive = BUILD / filename
    fetch('https://dl.google.com/android/repository/' + filename, archive, checksum)
    destination = BUILD / name
    unpack(archive, destination)
    print('Ready: ' + name, flush=True)


def jdk():
    releases = json.loads(subprocess.check_output(['gh', 'api', 'repos/adoptium/temurin17-binaries/releases?per_page=10']))
    release = next(release for release in releases if not release['prerelease'] and any(item['name'].startswith('OpenJDK17U-jdk_x64_windows_hotspot_') and item['name'].endswith('.zip') for item in release['assets']))
    asset = next(item for item in release['assets'] if item['name'].startswith('OpenJDK17U-jdk_x64_windows_hotspot_') and item['name'].endswith('.zip'))
    checksum_asset = next(item for item in release['assets'] if item['name'] == asset['name'] + '.sha256.txt')
    checksum = urllib.request.urlopen(checksum_asset['browser_download_url']).read().decode().strip().split()[0]
    archive = BUILD / asset['name']
    fetch(asset['browser_download_url'], archive, checksum, 'sha256')
    unpack(archive, BUILD / 'jdk')
    print('Ready: JDK 17', flush=True)


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(sdk, 'platform', 'platform-35_r02.zip', '0bb560a90a7a2cbd0dd8348224d518b638fe7949'),
                   pool.submit(sdk, 'build-tools', 'build-tools_r34-windows.zip', '62cfde1b6fcc3ad12a4d2ba1b537e752768bfd47'),
                   pool.submit(jdk)]
        for future in futures:
            future.result()
