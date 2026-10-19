#!/usr/bin/env bash
# Reviewed Linux x86_64 release assets; verify BEFORE extracting/executing.
set -euo pipefail
[[ "$(uname -s)/$(uname -m)" == Linux/x86_64 ]] || { echo 'Linux x86_64 required' >&2; exit 1; }
tool=${1:?usage: install-security-tools.sh gitleaks|trivy|all DESTINATION}
dest=${2:?destination required}
mkdir -p "$dest"
dest=$(cd "$dest" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
install_tool() {
  local name=$1 url=$2 checksum=$3
  curl --fail --silent --show-error --location --retry 3 "$url" -o "$tmp/$name.tar.gz"
  printf '%s  %s\n' "$checksum" "$tmp/$name.tar.gz" | sha256sum --check --strict
  tar -xzf "$tmp/$name.tar.gz" -C "$tmp" "$name"
  install -m 0755 "$tmp/$name" "$dest/$name"
}
case "$tool" in
  gitleaks|trivy|all) ;;
  *) echo 'Unknown scanner' >&2; exit 1 ;;
esac
if [[ "$tool" == gitleaks || "$tool" == all ]]; then
  install_tool gitleaks https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
fi
if [[ "$tool" == trivy || "$tool" == all ]]; then
  install_tool trivy https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_Linux-64bit.tar.gz e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7
fi
