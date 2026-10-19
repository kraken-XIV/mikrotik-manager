#!/usr/bin/env python3
"""Real-scanner boundary tests: deliberately synthetic, temporary findings only."""
import json
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_PATH = 'backend/src/services/platformBackup/__tests__/roundtrip.pg.test.ts'
# Assemble fixtures at runtime so test source is not a second allowlisted location.
KEY_A = 'e2e-' + 'key-a-' + '0123456789abcdef0123456789'
KEY_B = 'e2e-' + 'key-b-' + 'fedcba9876543210fedcba9876'
PLACEHOLDER = 'mtm_' + 'your_token_here'
NEW_VALUE = '91c0a4d73f2e8b6597ac0356d4e1b802'


def command(args, cwd, expected=(0,)):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=180)
    if result.returncode not in expected:
        # All Gitleaks invocations redact; do not print fixture report bodies.
        raise AssertionError(f'{args[0]} exit {result.returncode}: {result.stderr[-2500:]}')
    return result


class SecretBoundaries(unittest.TestCase):
    def scan_pair(self, path, content, rule, ignored):
        with tempfile.TemporaryDirectory(prefix='mtm-secret-boundary-') as tmp:
            tmp = Path(tmp)
            source = tmp / 'source'
            source.mkdir()
            target = source / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
            baseline = tmp / 'default.toml'
            baseline.write_text('[extend]\nuseDefault = true\n')
            for label, config, expected in [
                ('baseline', baseline, True),
                ('scoped', ROOT / '.gitleaks.toml', not ignored),
            ]:
                report = tmp / f'{label}.json'
                result = command([
                    'gitleaks', 'dir', '--no-banner', '--redact',
                    '--config', str(config), '--report-format', 'json',
                    '--report-path', str(report), '.',
                ], source, (0, 1))
                findings = json.loads(report.read_text())
                present = any(f['RuleID'] == rule for f in findings)
                self.assertEqual(present, expected, f'{label}: {path}, {rule}')
                self.assertEqual(result.returncode, 1 if findings else 0)

    def test_verified_fixture_a(self):
        self.scan_pair(FIXTURE_PATH, f"const KEY_A = '{KEY_A}';\n", 'generic-api-key', True)

    def test_verified_fixture_b(self):
        self.scan_pair(FIXTURE_PATH, f"const KEY_B = '{KEY_B}';\n", 'generic-api-key', True)

    def test_other_secret_in_same_fixture_file(self):
        self.scan_pair(FIXTURE_PATH, f"const api_key = '{NEW_VALUE}';\n", 'generic-api-key', False)

    def test_same_value_in_unrelated_file(self):
        self.scan_pair('backend/unrelated.ts', f"const api_key = '{KEY_A}';\n", 'generic-api-key', False)

    def test_path_suffix_is_not_allowed(self):
        self.scan_pair(FIXTURE_PATH + '.copy', f"const api_key = '{KEY_A}';\n", 'generic-api-key', False)

    def test_path_prefix_is_not_allowed(self):
        self.scan_pair('other/' + FIXTURE_PATH, f"const api_key = '{KEY_A}';\n", 'generic-api-key', False)

    def test_other_rule_in_same_fixture_file(self):
        # Gitleaks' GitHub-token rule, not generic-api-key.
        token = 'gh' + 'p_' + 'Ab9cD2eF5gH8iJ1kL4mN7oP0qR3sT6uV9wX2'
        self.scan_pair(FIXTURE_PATH, token + '\n', 'github-pat', False)

    def test_documentation_placeholder(self):
        self.scan_pair('docs/api.md', f'curl https://localhost -H "Authorization: Bearer {PLACEHOLDER}"\n', 'curl-auth-header', True)

    def test_new_token_in_same_document(self):
        self.scan_pair('docs/api.md', f'curl https://localhost -H "Authorization: Bearer {NEW_VALUE}"\n', 'curl-auth-header', False)

    def test_placeholder_in_unrelated_document(self):
        self.scan_pair('docs/other.md', f'curl https://localhost -H "Authorization: Bearer {PLACEHOLDER}"\n', 'curl-auth-header', False)

    def test_placeholder_with_suffix_is_not_allowed(self):
        self.scan_pair('docs/api.md', f'curl https://localhost -H "Authorization: Bearer {PLACEHOLDER}{NEW_VALUE}"\n', 'curl-auth-header', False)


class ContainerBoundaries(unittest.TestCase):
    def test_exact_component_and_check_only(self):
        with tempfile.TemporaryDirectory(prefix='mtm-trivy-boundary-') as tmp:
            tmp = Path(tmp)
            source = tmp / 'source'
            # Copy the actual nginx component, not an imitation of ignore semantics.
            dockerfile = (ROOT / 'nginx/Dockerfile').read_text()
            for path in ['nginx/Dockerfile', 'backend/Dockerfile', 'other/nginx/Dockerfile']:
                target = source / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(dockerfile + '\nRUN apt-get install curl\n')
            reports = []
            for label, ignore in [('baseline', ''), ('scoped', str(ROOT / '.trivyignore.yaml'))]:
                report = tmp / f'{label}.json'
                result = command([
                    'trivy', 'config', '--severity', 'HIGH,CRITICAL',
                    '--ignorefile', ignore, '--exit-code', '1', '--format', 'json',
                    '--output', str(report), str(source),
                ], source, (1,))
                data = json.loads(report.read_text())
                found = {(r['Target'], m['ID']) for r in data['Results'] for m in r.get('Misconfigurations', [])}
                reports.append(found)
            baseline, scoped = reports
            for path in ['nginx/Dockerfile', 'backend/Dockerfile', 'other/nginx/Dockerfile']:
                self.assertIn((path, 'DS-0002'), baseline)
                self.assertIn((path, 'DS-0021'), baseline)  # Non-interactive package installation is independently actionable.
                self.assertIn((path, 'DS-0021'), scoped)
            self.assertNotIn(('nginx/Dockerfile', 'DS-0002'), scoped)
            self.assertIn(('backend/Dockerfile', 'DS-0002'), scoped)
            self.assertIn(('other/nginx/Dockerfile', 'DS-0002'), scoped)
            self.assertEqual(baseline - scoped, {('nginx/Dockerfile', 'DS-0002')})


class VulnerabilityBoundaries(unittest.TestCase):
    def test_misconfiguration_exception_does_not_hide_package_advisories(self):
        with tempfile.TemporaryDirectory(prefix='mtm-cve-boundary-') as tmp:
            tmp = Path(tmp)
            source = tmp / 'source'
            lock = {'name': 'synthetic-regression', 'lockfileVersion': 3,
                    'packages': {'': {'dependencies': {'lodash': '4.17.20'}},
                                 'node_modules/lodash': {'version': '4.17.20'}}}
            for component in ['nginx', 'backend']:
                target = source / component / 'package-lock.json'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(lock))
            reports = []
            for label, ignore in [('baseline', ''), ('scoped', str(ROOT / '.trivyignore.yaml'))]:
                report = tmp / f'{label}.json'
                command(['trivy', 'fs', '--scanners', 'vuln', '--include-dev-deps',
                         '--severity', 'HIGH,CRITICAL', '--ignore-unfixed',
                         '--ignorefile', ignore, '--exit-code', '1', '--format', 'json',
                         '--output', str(report), '--no-progress', '.'], source, (1,))
                findings = {(r['Target'], v['VulnerabilityID'])
                            for r in json.loads(report.read_text())['Results']
                            for v in r.get('Vulnerabilities', [])}
                reports.append(findings)
            baseline, scoped = reports
            for component in ['nginx', 'backend']:
                self.assertTrue(any(path == f'{component}/package-lock.json' for path, _ in baseline))
            self.assertEqual(baseline, scoped)


class WorkflowPolicy(unittest.TestCase):
    def test_all_external_actions_are_immutable_and_no_blanket_write_tokens(self):
        for workflow in (ROOT / '.github/workflows').glob('*.yml'):
            text = workflow.read_text()
            for action in re.findall(r'(?m)^\s*-?\s*uses:\s*(\S+)', text):
                self.assertRegex(action, r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}$', str(workflow))
            self.assertNotRegex(text, r'permissions:\s*(read-all|write-all)')
            self.assertNotRegex(text, r'continue-on-error:\s*true')
            self.assertNotIn('pull_request_target:', text)


if __name__ == '__main__':
    for tool in ['gitleaks', 'trivy']:
        if not shutil.which(tool):
            raise SystemExit(f'Missing required scanner: {tool}')
    unittest.main(verbosity=2)
