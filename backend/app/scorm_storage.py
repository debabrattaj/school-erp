"""Unpacking and storing SCORM packages.

A SCORM package is a zip of ordinary web content plus an imsmanifest.xml at
its root saying which file starts it. It is extracted once on upload and
then served as static files, because that is the only way the content's own
relative links, scripts and media resolve.

Kept separate from routes/uploads.py's UPLOAD_DIR: that directory holds
single files uploaded by a person, this one holds whole extracted trees, and
they need different limits and different cleanup.

Two hostile-archive defences matter here, both cheap:
  - path traversal ("zip slip"): a member named ../../etc/cron.d/x would be
    written outside the target directory. Every member path is resolved and
    checked to still be inside the package directory before anything is
    written.
  - decompression bombs: a few KB of zip can expand to gigabytes. Total
    uncompressed size and member count are capped, and the declared sizes are
    checked before extraction rather than after filling the disk.
"""

import os
import shutil
import uuid
import zipfile
from xml.etree import ElementTree

SCORM_CONTENT_DIR = os.getenv("SCORM_CONTENT_DIR", "./uploads/scorm")
MAX_PACKAGE_MB = int(os.getenv("MAX_SCORM_PACKAGE_MB", "80"))
MAX_UNCOMPRESSED_MB = int(os.getenv("MAX_SCORM_UNCOMPRESSED_MB", "400"))
MAX_MEMBERS = int(os.getenv("MAX_SCORM_MEMBERS", "5000"))
# The manifest is parsed with the stdlib XML parser, which does not resolve
# external entities but will happily expand nested internal ones. A manifest
# is a few KB of metadata; anything vastly larger is not a manifest.
MAX_MANIFEST_BYTES = 2 * 1024 * 1024

MANIFEST_NAME = "imsmanifest.xml"

# Namespaces differ between SCORM versions and authoring tools, so elements
# are matched on local name instead (see _local).
ADLCP_NAMESPACES = ("adlcp", "adl")


class ScormError(Exception):
    """A package we will not accept, with a reason fit to show a teacher."""


def _safe_account_segment(account_code: str) -> str:
    return "".join(c for c in (account_code or "") if c.isalnum() or c in ("-", "_")) or "default"


def _local(tag: str) -> str:
    """Strip any XML namespace, leaving the local element name."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _find_all(node, name: str):
    return [child for child in node.iter() if _local(child.tag) == name]


def _attr(node, name: str):
    """Read an attribute by local name, ignoring whatever namespace prefix
    the authoring tool used for it."""
    for key, value in node.attrib.items():
        if _local(key) == name:
            return value
    return None


def _is_within(base: str, target: str) -> bool:
    base = os.path.realpath(base)
    target = os.path.realpath(target)
    return target == base or target.startswith(base + os.sep)


def _check_archive(archive: zipfile.ZipFile) -> None:
    infos = archive.infolist()
    if len(infos) > MAX_MEMBERS:
        raise ScormError(
            f"Package has too many files ({len(infos)}); the limit is {MAX_MEMBERS}."
        )

    total = sum(info.file_size for info in infos)
    if total > MAX_UNCOMPRESSED_MB * 1024 * 1024:
        raise ScormError(
            f"Package expands to {total // (1024 * 1024)} MB, over the "
            f"{MAX_UNCOMPRESSED_MB} MB limit."
        )

    for info in infos:
        name = info.filename
        if name.startswith("/") or name.startswith("\\") or ".." in name.replace("\\", "/").split("/"):
            raise ScormError(f"Package contains an unsafe path: {name}")


def _manifest_member(archive: zipfile.ZipFile) -> str:
    """The manifest at the archive root, or the shallowest one if the package
    was zipped with a wrapping folder (which authoring tools do constantly)."""
    candidates = [
        info.filename
        for info in archive.infolist()
        if os.path.basename(info.filename).lower() == MANIFEST_NAME
    ]
    if not candidates:
        raise ScormError(
            "No imsmanifest.xml found — this does not look like a SCORM package."
        )
    return min(candidates, key=lambda name: name.count("/"))


def parse_manifest(manifest_bytes: bytes) -> dict:
    """Pull out what the LMS needs: version, identifier, entry point, mastery
    score. Everything else in a manifest describes sequencing we do not
    implement, and is ignored rather than half-honoured."""
    if len(manifest_bytes) > MAX_MANIFEST_BYTES:
        raise ScormError("imsmanifest.xml is implausibly large; refusing to parse it.")

    try:
        root = ElementTree.fromstring(manifest_bytes)
    except ElementTree.ParseError as exc:
        raise ScormError(f"imsmanifest.xml is not valid XML: {exc}") from exc

    schema_version = ""
    for node in _find_all(root, "schemaversion"):
        schema_version = (node.text or "").strip()
        break
    # Everything that is not explicitly 2004 is treated as 1.2, including a
    # missing schemaversion: 1.2's API is the one virtually every authoring
    # tool still emits, and guessing 2004 wrongly breaks the runtime outright.
    version = "2004" if "2004" in schema_version else "1.2"

    # resources: identifier -> href, so an organization item can be resolved
    # to the file it actually launches.
    resources = {}
    for node in _find_all(root, "resource"):
        identifier = _attr(node, "identifier")
        href = _attr(node, "href")
        if identifier:
            resources[identifier] = href

    launch_url = None
    mastery_score = None

    # The default organization's first item that points at a resource is the
    # entry point. Multi-SCO packages are launched at their first SCO; we do
    # not implement the rollup that would make later SCOs meaningful.
    organizations = _find_all(root, "organizations")
    default_org_id = _attr(organizations[0], "default") if organizations else None

    org_nodes = _find_all(root, "organization")
    ordered = sorted(
        org_nodes,
        key=lambda node: 0 if _attr(node, "identifier") == default_org_id else 1,
    )
    for org in ordered:
        for item in _find_all(org, "item"):
            ref = _attr(item, "identifierref")
            if not ref or ref not in resources or not resources[ref]:
                continue
            launch_url = resources[ref]
            for score_node in _find_all(item, "masteryscore"):
                try:
                    mastery_score = float((score_node.text or "").strip())
                except (TypeError, ValueError):
                    mastery_score = None
                break
            break
        if launch_url:
            break

    # Some packages carry no organizations at all; fall back to the first
    # resource with an href rather than rejecting content that would run.
    if not launch_url:
        for href in resources.values():
            if href:
                launch_url = href
                break

    if not launch_url:
        raise ScormError(
            "The manifest names no launchable file, so there is nothing to open."
        )

    return {
        "scorm_version": version,
        "identifier": _attr(root, "identifier"),
        "launch_url": launch_url.split("?")[0].lstrip("/"),
        "launch_parameters": launch_url.split("?", 1)[1] if "?" in launch_url else None,
        "mastery_score": mastery_score,
    }


def store_package(account_code: str, contents: bytes) -> dict:
    """Validate, extract and keep a package. Returns its manifest facts plus
    the storage_key the content is served under."""
    if len(contents) > MAX_PACKAGE_MB * 1024 * 1024:
        raise ScormError(f"Package is larger than the {MAX_PACKAGE_MB} MB limit.")

    import io

    try:
        archive = zipfile.ZipFile(io.BytesIO(contents))
    except zipfile.BadZipFile as exc:
        raise ScormError("That file is not a readable zip archive.") from exc

    with archive:
        _check_archive(archive)

        manifest_member = _manifest_member(archive)
        manifest = parse_manifest(archive.read(manifest_member))

        # Where the manifest sat is the package root: a zip with a wrapping
        # folder must not become a package whose every path is off by one.
        root_prefix = os.path.dirname(manifest_member)
        if root_prefix:
            root_prefix += "/"

        storage_key = uuid.uuid4().hex
        target_dir = os.path.join(
            SCORM_CONTENT_DIR, _safe_account_segment(account_code), storage_key
        )
        os.makedirs(target_dir, exist_ok=True)

        try:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                name = info.filename
                if root_prefix:
                    if not name.startswith(root_prefix):
                        continue
                    name = name[len(root_prefix):]
                if not name:
                    continue

                destination = os.path.join(target_dir, name)
                if not _is_within(target_dir, destination):
                    raise ScormError(f"Package contains an unsafe path: {info.filename}")

                os.makedirs(os.path.dirname(destination), exist_ok=True)
                with archive.open(info) as source, open(destination, "wb") as out:
                    shutil.copyfileobj(source, out)
        except Exception:
            # Never leave half a package on disk: it would serve broken
            # content under a storage_key that looks perfectly valid.
            shutil.rmtree(target_dir, ignore_errors=True)
            raise

    launch_path = os.path.join(target_dir, manifest["launch_url"])
    if not os.path.isfile(launch_path):
        shutil.rmtree(target_dir, ignore_errors=True)
        raise ScormError(
            f"The manifest points at '{manifest['launch_url']}', which is not in the package."
        )

    manifest["storage_key"] = storage_key
    manifest["package_bytes"] = len(contents)
    return manifest


def delete_package(account_code: str, storage_key: str) -> bool:
    """Best-effort removal of an extracted package; True if it was there."""
    if not storage_key:
        return False
    target_dir = os.path.join(
        SCORM_CONTENT_DIR, _safe_account_segment(account_code), storage_key
    )
    if not os.path.isdir(target_dir):
        return False
    shutil.rmtree(target_dir, ignore_errors=True)
    return True


def content_path(account_code: str, storage_key: str, relative_path: str) -> str | None:
    """Absolute path of one file inside a package, or None if the path
    escapes the package (a request, unlike a zip, is attacker-controlled on
    every load)."""
    base = os.path.join(SCORM_CONTENT_DIR, _safe_account_segment(account_code), storage_key)
    candidate = os.path.join(base, relative_path)
    if not _is_within(base, candidate) or not os.path.isfile(candidate):
        return None
    return candidate
