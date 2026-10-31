#!/usr/bin/env python3
"""Local Xcode 26 probe pipe workaround; compilation arguments remain unchanged.

SwiftBuild on this host reads probe stdout then stderr. Drain clang stderr to a
temporary file while stdout streams, then close stdout before replaying stderr.
Ordinary compilation execs the real compiler directly.
"""
import os
import subprocess
import sys
import tempfile

compiler = subprocess.check_output(['xcrun', '--find', 'clang'], text=True).strip()
arguments = sys.argv[1:]
if all(flag in arguments for flag in ['-v', '-E', '-dM']):
    with tempfile.TemporaryFile() as errors:
        result = subprocess.run([compiler, *arguments], stderr=errors)
        os.close(1)
        errors.seek(0)
        while True:
            chunk = errors.read(65536)
            if not chunk:
                break
            os.write(2, chunk)
        sys.exit(result.returncode)
os.execv(compiler, [compiler, *arguments])
