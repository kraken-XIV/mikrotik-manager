#!/usr/bin/env python3
"""Real-scanner boundary tests: deliberately synthetic, temporary findings only."""
import ast
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from types import SimpleNamespace

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


    def test_scorecard_publisher_has_one_scorecard_job(self):
        publisher = (ROOT / '.github/workflows/scorecard.yml').read_text()
        preview = (ROOT / '.github/workflows/scorecard-preview.yml').read_text()
        # Public service chooses a single Scorecard job. Two such jobs cause it
        # to reject the other job's necessary OIDC grant even with valid GitHub CI.
        self.assertEqual(publisher.count('uses: ossf/scorecard-action@'), 1)
        self.assertEqual(len(re.findall(r'(?m)^  [a-z][a-z0-9_-]*:\s*$', publisher.split('jobs:', 1)[1])), 1)
        self.assertNotIn('pull_request:', publisher)
        self.assertIn('publish_results: true', publisher)
        self.assertIn('id-token: write', publisher)
        self.assertIn('pull_request:', preview)
        self.assertIn('publish_results: false', preview)
        self.assertNotIn('id-token:', preview)
        self.assertNotIn('security-events:', preview)


class PublishingTrustBoundaries(unittest.TestCase):
    def test_actual_event_condition_rejects_untrusted_sources(self):
        workflow = (ROOT / '.github/workflows/publish.yml').read_text()
        block = workflow.split('  verify-source:', 1)[1].split('    permissions:', 1)[0]
        expression = ' '.join(block.split('    if: >-', 1)[1].split())
        expression = expression.replace('&&', 'and').replace('||', 'or')
        tree = ast.parse(expression, mode='eval')
        allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare,
                   ast.Eq, ast.Attribute, ast.Name, ast.Load, ast.Constant)
        self.assertTrue(all(isinstance(node, allowed) for node in ast.walk(tree)))
        cases = [
            ('workflow_run', 'push', 'owner/repo', 'main', 'success', 'refs/heads/feature/untrusted', True),
            ('workflow_run', 'pull_request', 'owner/repo', 'main', 'success', 'refs/heads/feature/untrusted', False),
            ('workflow_run', 'push', 'attacker/repo', 'main', 'success', 'refs/heads/feature/untrusted', False),
            ('workflow_run', 'push', 'owner/repo', 'feature', 'success', 'refs/heads/feature/untrusted', False),
            ('workflow_run', 'push', 'owner/repo', 'main', 'failure', 'refs/heads/feature/untrusted', False),
            ('workflow_dispatch', 'push', 'owner/repo', 'main', 'success', 'refs/heads/main', True),
            ('workflow_dispatch', 'push', 'owner/repo', 'main', 'success', 'refs/heads/feature', False),
        ]
        for event, trigger, repository, branch, conclusion, ref, expected in cases:
            github = SimpleNamespace(event_name=event, ref=ref, repository='owner/repo',
                event=SimpleNamespace(workflow_run=SimpleNamespace(event=trigger,
                    conclusion=conclusion, head_branch=branch,
                    head_repository=SimpleNamespace(full_name=repository))))
            actual = eval(compile(tree, '<workflow-condition>', 'eval'), {'__builtins__': {}}, {'github': github})
            self.assertEqual(actual, expected, (event, trigger, repository, branch, ref))

    def test_actual_read_only_verifier_fails_closed(self):
        import textwrap
        workflow = (ROOT / '.github/workflows/publish.yml').read_text()
        block = workflow.split('  verify-source:', 1)[1].split('  publish-backend:', 1)[0]
        script = textwrap.dedent(block.split('        run: |', 1)[1])
        with tempfile.TemporaryDirectory(prefix='mtm-publish-trust-') as tmp:
            tmp = Path(tmp)
            gh = tmp / 'gh'
            gh.write_text('#!/bin/sh\nprintf "%s\\n" "$MTM_COMPARE_STATUS"\nexit "${MTM_COMPARE_EXIT:-0}"\n')
            gh.chmod(0o700)
            output = tmp / 'output'
            for status, api_exit, sha, accepted in [
                ('identical', '0', 'a' * 40, True),
                ('behind', '0', 'b' * 40, True),
                ('ahead', '0', 'a' * 40, False),
                ('diverged', '0', 'a' * 40, False),
                ('', '1', 'a' * 40, False),
                ('identical', '0', '../../untrusted', False),
            ]:
                output.write_text('')
                env = dict(os.environ, PATH=str(tmp) + os.pathsep + os.environ['PATH'],
                           MTM_COMPARE_STATUS=status, MTM_COMPARE_EXIT=api_exit,
                           GITHUB_REPOSITORY='owner/repo', GITHUB_OUTPUT=str(output), CANDIDATE_SHA=sha)
                result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script],
                                        env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode == 0, accepted, (status, api_exit, sha))
                self.assertEqual(output.read_text(), f'sha={sha}\n' if accepted else '')


if __name__ == '__main__':
    for tool in ['gitleaks', 'trivy']:
        if not shutil.which(tool):
            raise SystemExit(f'Missing required scanner: {tool}')
    unittest.main(verbosity=2)
