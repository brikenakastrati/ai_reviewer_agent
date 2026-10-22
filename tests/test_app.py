import io
import json
import tarfile
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

import app


class RepositoryValidationTests(unittest.TestCase):
    def test_valid_repository(self):
        self.assertEqual(app.ReviewService.validate_repository("student-lab/final_project"), ("student-lab", "final_project"))

    def test_rejects_repository_path_traversal_and_url(self):
        for value in ("../private/repo", "owner/../private", "owner/name?x=1", "https://github.com/owner/repo"):
            with self.subTest(value=value), self.assertRaises(app.AppError):
                app.ReviewService.validate_repository(value)

    def test_branch_validation(self):
        self.assertIsNone(app.ReviewService.validate_branch(""))
        self.assertEqual(app.ReviewService.validate_branch("feature/model-v2"), "feature/model-v2")
        for value in ("-flag", "../escape", "branch..name", "branch name", "branch/"):
            with self.subTest(value=value), self.assertRaises(app.AppError):
                app.ReviewService.validate_branch(value)


class EvidenceTests(unittest.TestCase):
    def test_flattens_paginated_repository_results(self):
        repos = app.flatten_pages([[{"full_name": "a/one"}], [{"full_name": "b/two"}]])
        self.assertEqual([repo["full_name"] for repo in repos], ["a/one", "b/two"])

    def test_commit_history_is_evidence_only(self):
        commits = app.ReviewService.history_summary(
            [{"sha": "a" * 40, "commit": {"author": {"date": "2025-01-01"}, "message": "Feature: add model\n\nDetails"}}]
        )
        self.assertEqual(commits, [{"sha": "a" * 12, "date": "2025-01-01", "message": "Feature: add model"}])

    def test_scc_summary_excludes_heuristic_cost_fields(self):
        service = app.ReviewService()
        service.scc = "scc"
        response = json.dumps([{"Name": "Python", "Count": 3, "Lines": 20, "Code": 14, "Comment": 2, "Blank": 4, "Cost": 999}])
        with patch.object(service, "run", return_value=type("Result", (), {"stdout": response})()):
            summary = service.scc_summary(Path("."))
        self.assertEqual(summary, [{"language": "Python", "files": 3, "lines": 20, "code": 14, "comments": 2, "blank": 4}])

    def test_evidence_only_report_has_no_score_and_marks_similarity_unassessed(self):
        report = app.ReviewService.create_report(
            {"full_name": "student/project", "default_branch": "main"},
            {"sha": "b" * 40, "commit": {}},
            [],
            [],
            None,
            None,
        )
        self.assertEqual(report["status"], "evidence_only")
        self.assertIsNone(report["scoring"])
        self.assertEqual(report["similarity"]["status"], "not_assessed")


class StructuredReportTests(unittest.TestCase):
    def complete_review(self):
        categories = [
            {"id": key, "status": "scored", "earned": points - 1, "possible": points, "evidence": f"{key} evidence"}
            for key, (_, points) in app.RUBRIC.items()
        ]
        return json.dumps(
            {
                "review_status": "complete",
                "summary": "Provat u shqyrtuan; testet nuk u ekzekutuan.",
                "confidence": "medium",
                "categories": categories,
                "strengths": ["Clear structure"],
                "findings": [
                    {
                        "severity": "medium",
                        "title": "Missing edge case",
                        "evidence": "src/main.py:12",
                        "impact": "Unexpected input is not handled.",
                        "recommendation": "Add validation.",
                    }
                ],
                "ai_ml": "A model was evaluated.",
                "next_steps": ["Add the missing test."],
            }
        )

    def test_complete_report_recalculates_score_and_limits_fields(self):
        review = self.complete_review()
        report = app.ReviewService.create_report(
            {"full_name": "student/project", "html_url": "https://github.com/student/project", "default_branch": "main", "review_ref": "main"},
            {"sha": "b" * 40},
            [],
            [],
            review,
            None,
        )
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["scoring"]["earned"], 93)
        self.assertEqual(report["scoring"]["normalized"], 93)
        self.assertEqual(report["scoring"]["confidence"], "medium")
        self.assertEqual(len(report["findings"]), 1)
        self.assertEqual(report["similarity"]["status"], "not_assessed")
        self.assertEqual(report["verification"]["tests"], "Not run (read-only review).")

    def test_incomplete_file_access_response_never_receives_a_score(self):
        report = app.ReviewService.create_report(
            {"full_name": "student/project"},
            {"sha": "b" * 40},
            [],
            [],
            json.dumps(
                {
                    "review_status": "incomplete",
                    "summary": "Nuk u lexuan skedarët e projektit.",
                    "confidence": "low",
                    "categories": [],
                    "strengths": [],
                    "findings": [],
                    "ai_ml": "",
                    "next_steps": [],
                }
            ),
            None,
        )
        self.assertEqual(report["status"], "incomplete")
        self.assertIsNone(report["scoring"])
        self.assertIn("Nuk u lexuan", report["summary"])

    def test_invalid_ai_output_is_incomplete_not_a_scored_report(self):
        report = app.ReviewService.create_report(
            {"full_name": "student/project"}, {"sha": "b" * 40}, [], [], "Review complete: 100/100", None
        )
        self.assertEqual(report["status"], "incomplete")
        self.assertIsNone(report["scoring"])
        self.assertTrue(report["limitations"])

    def test_copilot_gets_file_read_search_permissions_only(self):
        service = app.ReviewService()
        service.copilot = "copilot"
        command = service.copilot_command("review prompt", Path("C:/temporary/review"))
        self.assertIn("--available-tools=view,grep,glob", command)
        self.assertIn("--allow-tool=view,grep,glob", command)
        self.assertIn("--no-ask-user", command)
        self.assertTrue(command[-1].startswith("--add-dir="))
        self.assertFalse(any("shell" in item or "write" in item or "execute" in item for item in command))
        self.assertNotIn("--allow-all-tools", command)

    def test_legacy_markdown_is_presented_as_archived_unscored_data(self):
        markdown = """# Project review: student/project
- Repository: https://github.com/student/project
- Branch requested: `main`
- Default branch: `main`
- Pinned commit: `abc123`
- Captured: 2026-10-21T17:23:35Z

## Recent commits
- `abc123456789` 2026-10-21T16:20:27Z: Add validation

## scc code statistics
| Language | Files | Lines | Code | Comments | Blank |
|---|---:|---:|---:|---:|---:|
| Python | 2 | 100 | 80 | 5 | 15 |

## Përmbledhje
- **Kufizimet kryesore:** Skedarët nuk mund të lexoheshin.
- **Qëllimi:** Përpunim të dhënash.
- Përmbajtja nuk mund të verifikohet.

## Gjetjet kryesore
- **Skedarët nuk u lexuan**
  - **Prova:** Skedari README nuk ishte i disponueshëm.
  - **Ndikimi:** Vlerësimi mbetet i paplotë.
  - **Rekomandimi:** Ekzekutoje përsëri shqyrtimin.
"""
        report = app.legacy_report(markdown)
        self.assertTrue(report["legacy"])
        self.assertEqual(report["status"], "incomplete")
        self.assertIsNone(report["scoring"])
        self.assertEqual(report["repository"]["full_name"], "student/project")
        self.assertIn("Skedarët nuk mund të lexoheshin.", report["summary"])
        self.assertEqual(report["verification"]["scc"][0]["lines"], 100)
        self.assertEqual(report["verification"]["commits"][0]["message"], "Add validation")
        self.assertEqual(report["findings"][0]["evidence"], "Skedari README nuk ishte i disponueshëm.")
        self.assertTrue(report["limitations"])


class ArchiveTests(unittest.TestCase):
    def make_tar(self, root: Path, name: str, content: bytes) -> Path:
        archive = root / "snapshot.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            info = tarfile.TarInfo(name)
            info.size = len(content)
            bundle.addfile(info, io.BytesIO(content))
        return archive

    def test_extracts_only_files_inside_the_snapshot_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = self.make_tar(root, "owner-repo-sha/README.md", b"hello")
            destination = root / "extracted"
            self.assertEqual(app.ReviewService.extract_archive(archive, destination), 1)
            self.assertEqual((destination / "README.md").read_bytes(), b"hello")

    def test_rejects_archive_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = self.make_tar(root, "owner-repo/../outside.txt", b"nope")
            with self.assertRaises(app.AppError):
                app.ReviewService.extract_archive(archive, root / "extracted")
            self.assertFalse((root / "outside.txt").exists())


class ReviewLifecycleTests(unittest.TestCase):
    def test_review_pins_commit_and_removes_temporary_checkout(self):
        sha = "c" * 40
        service = app.ReviewService()
        service.copilot = None
        service.repo_metadata = lambda _: {"full_name": "student/project", "default_branch": "main", "html_url": "https://github.com/student/project"}
        service.commit_metadata = lambda *_: {"sha": sha, "commit": {"message": "Initial"}}
        service.commit_history = lambda *_: []
        service.scc_summary = lambda _: [{"language": "Python", "files": 1, "lines": 2, "code": 1, "comments": 0, "blank": 1}]

        def snapshot(_full_name, _sha, target):
            target.mkdir(parents=True)
            (target / "README.md").write_text("safe fixture", encoding="utf-8")

        service.download_snapshot = snapshot
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspaces = root / "workspace"
            reports = root / "reports"
            with patch.object(app, "WORKSPACES", workspaces), patch.object(app, "REPORTS", reports):
                result = service.run_review("student/project", None)
            self.assertEqual(result["sha"], sha)
            self.assertFalse(result["aiReview"])
            self.assertEqual(result["report"]["status"], "evidence_only")
            self.assertIsNone(result["report"]["scoring"])
            self.assertEqual(list(workspaces.iterdir()), [])
            self.assertTrue((reports / result["reportName"]).is_file())
            self.assertEqual(Path(result["reportName"]).suffix, ".json")

    def test_review_runs_with_snapshot_as_data_and_never_scores_an_incomplete_response(self):
        response = json.dumps(
            {
                "review_status": "incomplete",
                "summary": "Could not read the project files.",
                "confidence": "low",
                "categories": [],
                "strengths": [],
                "findings": [],
                "ai_ml": "",
                "next_steps": [],
            }
        )
        service = app.ReviewService()
        service.copilot = "copilot"
        service.repo_metadata = lambda _: {"full_name": "student/project", "default_branch": "main", "html_url": "https://github.com/student/project"}
        service.commit_metadata = lambda *_: {"sha": "e" * 40, "commit": {"message": "Initial"}}
        service.commit_history = lambda *_: []
        service.scc_summary = lambda _: []
        service.download_snapshot = lambda _full_name, _sha, target: target.mkdir(parents=True)
        captured = {}

        def run(command, **_kwargs):
            captured["command"] = command
            return type("Result", (), {"stdout": response})()

        service.run = run
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(app, "WORKSPACES", root / "workspace"), patch.object(app, "REPORTS", root / "reports"):
                result = service.run_review("student/project", None)
        command = captured["command"]
        self.assertIn("--allow-tool=view,grep,glob", command)
        self.assertNotIn("--allow-all-tools", command)
        prompt = command[command.index("-p") + 1]
        self.assertIn("snapshot", prompt)
        self.assertEqual(result["report"]["status"], "incomplete")
        self.assertIsNone(result["report"]["scoring"])
        self.assertFalse(result["aiReview"])


class LocalHttpTests(unittest.TestCase):
    def setUp(self):
        self.server = app.LocalServer((app.HOST, 0), app.RequestHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, path, *, host=None, origin=None):
        connection = HTTPConnection(app.HOST, self.server.server_port, timeout=3)
        connection.putrequest("GET", path, skip_host=True)
        connection.putheader("Host", host or f"{app.HOST}:{self.server.server_port}")
        if origin:
            connection.putheader("Origin", origin)
        connection.endheaders()
        response = connection.getresponse()
        result = response.status, response.getheader("Content-Security-Policy"), response.read()
        connection.close()
        return result

    def post_json(self, path, payload):
        connection = HTTPConnection(app.HOST, self.server.server_port, timeout=3)
        connection.request("POST", path, json.dumps(payload), {"Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_serves_dashboard_with_a_content_security_policy(self):
        status, policy, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"Project Reviewer", body)
        self.assertIn("default-src 'self'", policy)

    def test_rejects_foreign_hosts_and_origins_on_other_ports(self):
        status, _, _ = self.request("/", host="example.com")
        self.assertEqual(status, 403)
        status, _, _ = self.request("/", origin="http://localhost:3000")
        self.assertEqual(status, 403)

    def test_review_endpoint_validates_input_before_starting_a_job(self):
        status, body = self.post_json("/api/reviews", {"repository": "owner/../private", "branch": ""})
        self.assertEqual(status, 400)
        self.assertIn("owner/name", body["error"])

    def test_review_endpoint_returns_a_pollable_async_job(self):
        service = app.ReviewService()
        service.run_review = lambda full_name, branch: {
            "repository": full_name,
            "branch": branch or "main",
            "sha": "d" * 40,
            "reportName": "student__project__dddddddddddd.json",
            "report": {"status": "evidence_only", "scoring": None},
            "aiReview": False,
            "scc": [],
            "commits": [],
        }
        with patch.object(app, "SERVICE", service):
            status, body = self.post_json("/api/reviews", {"repository": "student/project", "branch": ""})
            self.assertEqual(status, 202)
            job_id = body["jobId"]
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                _, _, response = self.request(f"/api/jobs/{job_id}")
                job = json.loads(response)
                if job["status"] != "running":
                    break
                time.sleep(0.01)
            self.assertEqual(job["status"], "complete")
            self.assertEqual(job["sha"], "d" * 40)

    def test_saved_reports_are_structured_json(self):
        report = {"status": "incomplete", "summary": "No score assigned."}
        with tempfile.TemporaryDirectory() as temporary:
            reports = Path(temporary)
            (reports / "student__project__abc.json").write_text(json.dumps(report), encoding="utf-8")
            (reports / "legacy.md").write_text("old report", encoding="utf-8")
            with patch.object(app, "REPORTS", reports):
                status, _, body = self.request("/api/reports")
                self.assertEqual(status, 200)
                self.assertEqual(
                    {item["name"] for item in json.loads(body)["reports"]},
                    {"student__project__abc.json", "legacy.md"},
                )
                status, _, body = self.request("/api/reports/student__project__abc.json")
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["report"], report)
                status, _, body = self.request("/api/reports/legacy.md")
                self.assertEqual(status, 200)
                archived = json.loads(body)["report"]
                self.assertTrue(archived["legacy"])
                self.assertIsNone(archived["scoring"])


if __name__ == "__main__":
    unittest.main()
