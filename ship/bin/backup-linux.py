import json
import os
import stat
import sys

PROTOCOL_ID = "linux-fd-backup-v1"
SOURCE_FD = 3
DIRECTORY_FD = 4


def emit(nonce, target, status, error=None):
    payload = {
        "nonce": nonce,
        "count": 1,
        "id": PROTOCOL_ID,
        "status": status,
        "target": target,
    }
    if error is not None:
        payload["error"] = error
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n")
    sys.stdout.flush()


def fields(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def regular(value):
    return stat.S_ISREG(value.st_mode) and not stat.S_ISLNK(value.st_mode)


def matches(value, expected):
    return regular(value) and fields(value) == expected


def main():
    if len(sys.argv) != 9:
        return 2
    _, nonce, target, source, dev, ino, size, mtime_ns, ctime_ns = sys.argv
    if not nonce or not target or "/" in target or "\\" in target:
        return 2
    try:
        expected = (int(dev), int(ino), int(size), int(mtime_ns), int(ctime_ns))
    except ValueError:
        return 2

    tmp_fd = None

    def close_tmp():
        nonlocal tmp_fd
        if tmp_fd is None:
            return None
        fd = tmp_fd
        tmp_fd = None
        try:
            os.close(fd)
            return None
        except OSError as error:
            return error

    try:
        before_fd = os.fstat(SOURCE_FD)
        before_path = os.lstat(source)
        if not matches(before_fd, expected) or not matches(before_path, expected):
            close_error = close_tmp()
            emit(nonce, target, "error", "source-identity-before-copy" if close_error is None else "staging-close")
            return 1

        tmp_fd = os.open(".", os.O_TMPFILE | os.O_RDWR, 0o600, dir_fd=DIRECTORY_FD)
        tmp_stat = os.fstat(tmp_fd)
        if not regular(tmp_stat):
            close_error = close_tmp()
            emit(nonce, target, "error", "staging-not-regular" if close_error is None else "staging-close")
            return 1

        os.lseek(SOURCE_FD, 0, os.SEEK_SET)
        while True:
            chunk = os.read(SOURCE_FD, 1024 * 1024)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                written = os.write(tmp_fd, view)
                if written <= 0:
                    close_error = close_tmp()
                    emit(nonce, target, "error", "staging-write" if close_error is None else "staging-close")
                    return 1
                view = view[written:]
        os.fsync(tmp_fd)

        after_fd = os.fstat(SOURCE_FD)
        after_path = os.lstat(source)
        if not matches(after_fd, expected) or not matches(after_path, expected):
            close_error = close_tmp()
            emit(nonce, target, "error", "source-identity-after-copy" if close_error is None else "staging-close")
            return 1

        try:
            os.link(f"/proc/self/fd/{tmp_fd}", target, dst_dir_fd=DIRECTORY_FD, follow_symlinks=True)
        except FileExistsError:
            close_error = close_tmp()
            if close_error is not None:
                emit(nonce, target, "error", "staging-close")
                return 1
            emit(nonce, target, "collision")
            return 0

        published = os.stat(target, dir_fd=DIRECTORY_FD, follow_symlinks=False)
        linked = os.fstat(tmp_fd)
        if not regular(published) or fields(published)[:2] != fields(linked)[:2]:
            close_error = close_tmp()
            emit(nonce, target, "error", "published-identity" if close_error is None else "staging-close")
            return 1

        close_error = close_tmp()
        if close_error is not None:
            emit(nonce, target, "error", "published-close")
            return 1
        emit(nonce, target, "published")
        return 0
    except FileExistsError:
        close_error = close_tmp()
        if close_error is not None:
            emit(nonce, target, "error", "staging-close")
            return 1
        emit(nonce, target, "collision")
        return 0
    except (AttributeError, OSError) as error:
        close_error = close_tmp()
        detail = "staging-close" if close_error is not None else (getattr(error, "errno", None) or type(error).__name__)
        emit(nonce, target, "error", detail)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
