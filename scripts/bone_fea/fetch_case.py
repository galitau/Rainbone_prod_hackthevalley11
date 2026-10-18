"""Fetch one public HFValid case using ZIP byte ranges, without the 3 GB archive."""
import io
import argparse
import json
import struct
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://amsacta.unibo.it/id/eprint/8431/31/HFValid_Collection_v3.zip'


class RemoteZip(io.RawIOBase):
    def __init__(self, length=None, base=0):
        self.base = base
        if length is None:
            request = urllib.request.Request(URL, headers={'Range': 'bytes=0-0'})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 206:
                    raise RuntimeError('Server does not support ranged download.')
                length = int(response.headers['Content-Range'].split('/')[-1])
        self.length = length
        self.position = 0

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else (self.position if whence == 1 else self.length) + offset
        return self.position

    def read(self, size=-1):
        if size < 0:
            size = self.length - self.position
        size = min(size, self.length - self.position)
        if size <= 0:
            return b''
        request = urllib.request.Request(URL, headers={'Range': f'bytes={self.base + self.position}-{self.base + self.position + size - 1}'})
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status != 206:
                raise RuntimeError('Server ignored range.')
            data = response.read()
        if len(data) != size:
            raise RuntimeError(f'Incomplete range: {len(data)} != {size}')
        self.position += len(data)
        return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True, help='Directory for downloaded source files')
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(RemoteZip()) as archive:
        names = archive.namelist()
        (output / 'archive-index.json').write_text(json.dumps([
            {'name': info.filename, 'bytes': info.file_size, 'compressed_bytes': info.compress_size}
            for info in archive.infolist()], indent=2))
        (output / 'README.md').write_bytes(archive.read('HFValid_Collection_v3/README.md'))
        info = archive.getinfo('HFValid_Collection_v3/Subjects.zip')
        assert info.compress_type == zipfile.ZIP_STORED
        archive.fp.seek(info.header_offset)
        header = archive.fp.read(30)
        name_length, extra_length = struct.unpack('<HH', header[26:30])
        start = info.header_offset + 30 + name_length + extra_length
        with zipfile.ZipFile(RemoteZip(info.file_size, start)) as subjects:
            (output / 'subjects-index.json').write_text(json.dumps([
                {'name': entry.filename, 'bytes': entry.file_size, 'compressed_bytes': entry.compress_size}
                for entry in subjects.infolist()], indent=2))
            selected = [name for name in subjects.namelist() if '/Pat001/' in name]
            print('Selected:', selected, flush=True)
            for name in selected:
                if name.endswith('/'):
                    continue
                data = subjects.read(name)
                path = output / Path(name).name
                path.write_bytes(data)
                print('Downloaded', path.name, len(data), flush=True)
