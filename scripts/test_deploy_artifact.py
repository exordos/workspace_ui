import importlib.util
import sys
import types
import unittest
from pathlib import Path

if "requests" not in sys.modules:
    sys.modules["requests"] = types.SimpleNamespace(Session=object)

MODULE_PATH = Path(__file__).with_name("deploy-artifact.py")
spec = importlib.util.spec_from_file_location("deploy_artifact", MODULE_PATH)
deploy_artifact = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(deploy_artifact)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url.endswith("/jobs") and kwargs.get("params", {}).get("page") != 1:
            return FakeResponse([])
        for suffix, payload in self.responses.items():
            if url.endswith(suffix):
                return FakeResponse(payload)
        raise AssertionError(f"Unexpected URL: {url}")


class LatestJobIdTests(unittest.TestCase):
    def test_skips_tag_artifacts_and_selects_protected_branch_head_job(self):
        session = FakeSession({
            "/repository/branches/master": {
                "protected": True,
                "commit": {"id": "branch-head-sha"},
            },
            "/jobs": [
                {
                    "id": 9001,
                    "name": "build-web",
                    "ref": "master",
                    "tag": True,
                    "commit": {"id": "attacker-tag-sha"},
                    "pipeline": {"id": 91},
                },
                {
                    "id": 1000,
                    "name": "build-web",
                    "ref": "master",
                    "tag": False,
                    "commit": {"id": "branch-head-sha"},
                    "pipeline": {"id": 10},
                },
            ],
            "/pipelines/10": {"source": "push"},
        })

        job_id = deploy_artifact._latest_job_id(
            session,
            "https://gitlab.example",
            "group/project",
            "master",
        )

        self.assertEqual(job_id, 1000)
        requested_urls = [url for url, _kwargs in session.calls]
        self.assertIn(
            "https://gitlab.example/api/v4/projects/group%2Fproject/repository/branches/master",
            requested_urls,
        )
        self.assertIn(
            "https://gitlab.example/api/v4/projects/group%2Fproject/pipelines/10",
            requested_urls,
        )

    def test_rejects_unprotected_branch(self):
        session = FakeSession({
            "/repository/branches/master": {
                "protected": False,
                "commit": {"id": "branch-head-sha"},
            },
        })

        with self.assertRaisesRegex(RuntimeError, "not a protected GitLab branch"):
            deploy_artifact._latest_job_id(
                session,
                "https://gitlab.example",
                "group/project",
                "master",
            )

    def test_rejects_untrusted_pipeline_source(self):
        session = FakeSession({
            "/repository/branches/master": {
                "protected": True,
                "commit": {"id": "branch-head-sha"},
            },
            "/jobs": [
                {
                    "id": 1000,
                    "name": "build-web",
                    "ref": "master",
                    "tag": False,
                    "commit": {"id": "branch-head-sha"},
                    "pipeline": {"id": 10},
                },
            ],
            "/pipelines/10": {"source": "trigger"},
        })

        with self.assertRaisesRegex(RuntimeError, "No trusted successful"):
            deploy_artifact._latest_job_id(
                session,
                "https://gitlab.example",
                "group/project",
                "master",
            )


if __name__ == "__main__":
    unittest.main()
