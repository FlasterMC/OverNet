import datetime
import json
import socket
import ssl
import subprocess
import sys

RETENTION_DAYS = 30


def fetch_certificate(host):
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, 443), timeout=15) as connection:
        with context.wrap_socket(connection, server_hostname=host) as tls:
            return tls.getpeercert(binary_form=True)


def describe_certificate(der, host):
    result = subprocess.run(
        ["openssl", "x509", "-inform", "DER", "-noout", "-issuer", "-enddate", "-fingerprint", "-sha256", "-checkhost", host],
        input=der,
        capture_output=True,
        check=True,
    )
    lines = result.stdout.decode().splitlines()
    issuer = next(line for line in lines if line.startswith("issuer="))
    expires = next(line for line in lines if line.startswith("notAfter=")).split("=", 1)[1]
    fingerprint = next(line for line in lines if "Fingerprint=" in line).split("=", 1)[1].upper()
    matches = any(line.endswith("does match certificate") for line in lines)
    expires_at = datetime.datetime.strptime(expires, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
    return issuer, expires_at, fingerprint, matches


def collect(config, previous, now):
    previous_sites = {site["id"]: site for site in previous.get("sites", [])}
    sites = []
    for site in config["sites"]:
        certificates = {
            fingerprint: entry
            for fingerprint, entry in previous_sites.get(site["id"], {}).get("certificates", {}).items()
            if datetime.date.fromisoformat(entry["expires"]) > now.date()
            and now.date() - datetime.date.fromisoformat(entry["seen"]) < datetime.timedelta(days=RETENTION_DAYS)
        }
        for host in site["hosts"]:
            try:
                issuer, expires_at, fingerprint, matches = describe_certificate(fetch_certificate(host), host)
            except Exception as error:
                print(f"{host}: {error}", file=sys.stderr)
                continue
            print(f"{host}: {issuer}")
            if "Russian Trusted" in issuer and matches and expires_at > now:
                certificates[fingerprint] = {
                    "expires": expires_at.date().isoformat(),
                    "seen": now.date().isoformat(),
                }
        sites.append({"id": site["id"], "hosts": site["hosts"], "certificates": dict(sorted(certificates.items()))})
    return {"sites": sites}


def main():
    config_path, output_path = sys.argv[1:3]
    with open(config_path) as file:
        config = json.load(file)
    try:
        with open(output_path) as file:
            previous = json.load(file)
    except FileNotFoundError:
        previous = {}
    now = datetime.datetime.now(datetime.timezone.utc)
    result = collect(config, previous, now)
    with open(output_path, "w") as file:
        json.dump(result, file, ensure_ascii=False, indent=1)
        file.write("\n")


if __name__ == "__main__":
    main()
