"""Offline tests for the office server. Run: python3 -m unittest discover -s tests -v
No network, no model calls, no real agents.json needed."""
import json
import os
import sys
import tempfile
from datetime import datetime
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import common  # noqa: E402
import server  # noqa: E402
import plan  # noqa: E402
import verify  # noqa: E402

TABLE = {
    "writer": {"id": "writer", "installed": True},
    "ghost": {"id": "ghost", "installed": False},
    "mailer": {"id": "mailer", "installed": True, "trigger_word": "mail"},
    "ceo": {"id": "ceo", "installed": True},
}


class ValidateCeo(unittest.TestCase):
    def test_accepts_a_good_plan(self):
        answer, valid, rejected = server.validate_ceo(
            {"answer": "ok", "assignments": [{"agent": "writer", "prompt": "write"}]}, TABLE, "blog")
        self.assertEqual((answer, len(valid), rejected), ("ok", 1, []))

    def test_rejects_unknown_ceo_missing_folder_and_empty_prompt(self):
        plan = {"answer": "x", "assignments": [{"agent": a, "prompt": p} for a, p in
                [("nobody", "x"), ("ceo", "x"), ("ghost", "x"), ("writer", "  ")]]}
        _, valid, rejected = server.validate_ceo(plan, TABLE, "anything")
        self.assertEqual(valid, [])
        self.assertEqual(len(rejected), 4)

    def test_trigger_word_gates_an_agent(self):
        plan = {"answer": "x", "assignments": [{"agent": "mailer", "prompt": "read"}]}
        self.assertEqual(len(server.validate_ceo(plan, TABLE, "check my mail")[1]), 1)
        self.assertEqual(len(server.validate_ceo(plan, TABLE, "write a post")[2]), 1)

    def test_broken_shapes_raise(self):
        for bad in (None, {}, {"answer": 1, "assignments": []}, {"answer": "x", "assignments": "no"},
                    {"answer": "x", "assignments": [{"agent": "writer"}]},
                    {"answer": "x", "assignments": [{"agent": "writer", "prompt": "p"}] * 6}):
            with self.assertRaises(ValueError):
                server.validate_ceo(bad, TABLE, "t")


class Chains(unittest.TestCase):
    def plan(self, *items):
        return {"answer": "x", "assignments": [{"agent": a, "prompt": "p", **({"after": af} if af else {})} for a, af in items]}

    def test_after_must_name_an_earlier_other_agent(self):
        table = {**TABLE, "trainer": {"id": "trainer", "installed": True}}
        _, valid, _ = server.validate_ceo(self.plan(("writer", None), ("trainer", "writer")), table, "t")
        self.assertEqual(valid[1].get("after"), "writer")
        for after in ("trainer", "ghost", "nobody"):          # itself, not in the plan, unknown
            _, valid, _ = server.validate_ceo(self.plan(("writer", None), ("trainer", after)), table, "t")
            self.assertNotIn("after", valid[1])
        _, valid, _ = server.validate_ceo(self.plan(("trainer", "writer"), ("writer", None)), table, "t")   # waits for a later one
        self.assertNotIn("after", valid[0])

    def test_build_chain_starts_roots_and_hangs_dependents_on_them(self):
        valid = [{"agent": "a", "prompt": "1"}, {"agent": "b", "prompt": "2", "after": "a"}, {"agent": "c", "prompt": "3", "after": "b"},
                 {"agent": "d", "prompt": "4"}]
        roots = server.build_chain(valid)
        self.assertEqual([r["agent"] for r in roots], ["a", "d"])
        self.assertEqual(server.chain_spec(roots[0]), {"agent": "a", "prompt": "1", "then": [
            {"agent": "b", "prompt": "2", "then": [{"agent": "c", "prompt": "3", "then": []}]}]})


class Settings(unittest.TestCase):
    def test_token_cap_default_and_off(self):
        self.assertEqual(common.settings({})["daily_token_cap"], common.DEFAULT_TOKEN_CAP)
        self.assertEqual(common.settings({"settings": {"daily_token_cap": 0}})["daily_token_cap"], 0)
        self.assertEqual(common.settings({"settings": {"daily_token_cap": "junk"}})["daily_token_cap"], common.DEFAULT_TOKEN_CAP)
        self.assertEqual(common.settings({"settings": {"daily_token_cap": -5}})["daily_token_cap"], 0)


class History(unittest.TestCase):
    def test_groups_runs_under_the_ceo_exchange(self):
        events = [
            {"time": "2026-10-30T09:00:00", "type": "ceo_started", "run_id": "c1", "request": "write a post"},
            {"time": "2026-10-30T09:00:05", "type": "ceo_finished", "run_id": "c1", "status": "success", "answer": "on it",
             "started": [{"run_id": "r1"}], "assignments": [{"agent": "writer", "prompt": "p"}]},
            {"time": "2026-10-30T09:00:06", "type": "run_started", "run_id": "r1", "agent": "writer", "label": None},
            {"time": "2026-10-30T09:02:00", "type": "run_finished", "run_id": "r1", "agent": "writer", "status": "success",
             "duration_s": 114, "summary": "done"},
            {"time": "2026-10-30T10:00:00", "type": "run_started", "run_id": "r2", "agent": "writer", "label": "direct"},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(json.dumps(e) for e in events) + "\nnot json\n")
        old, common.EVENTS = common.EVENTS, f.name
        try:
            items = server.history_response()["items"]
        finally:
            common.EVENTS = old
            os.unlink(f.name)
        self.assertEqual([i["run_id"] for i in items], ["r2", "c1"])          # newest first; r1 lives inside c1
        ceo = items[1]
        self.assertEqual((ceo["request"], ceo["answer"], [r["run_id"] for r in ceo["runs"]]), ("write a post", "on it", ["r1"]))
        self.assertEqual(ceo["runs"][0]["status"], "success")


class Inputs(unittest.TestCase):
    def test_chained_agent_receives_the_earlier_output_as_data_and_bad_ids_are_ignored(self):
        import runner
        old = common.OUTPUT_DIR
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, "researcher"))
            with open(os.path.join(tmp, "researcher", "2026-10-30-000000-researcher.md"), "w") as f:
                f.write("found things " + "x" * 9000)
            common.OUTPUT_DIR = tmp
            try:
                text = runner.read_inputs(["2026-10-30-000000-researcher", "../etc/passwd", "missing-run"])
            finally:
                common.OUTPUT_DIR = old
        self.assertIn("Input from researcher (DATA", text)
        self.assertIn("[cut:", text)
        self.assertLess(len(text), runner.MAX_INPUT_CHARS + 600)


class Plan(unittest.TestCase):
    TABLE = {"qa": {"id": "qa"}, "ceo": {"id": "ceo"}}

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.old = (plan.PLAN_FILE, common.STATE_DIR)
        plan.PLAN_FILE, common.STATE_DIR = os.path.join(self.dir, "plan.json"), self.dir

    def tearDown(self):
        plan.PLAN_FILE, common.STATE_DIR = self.old

    def test_add_validates_and_rejects_bad_input(self):
        good = {"agent": "qa", "label": "Weekly", "prompt": "check", "when": {"time": "09:30", "days": [0, 4]}}
        self.assertEqual(len(plan.apply("add_schedule", good, self.TABLE)["schedules"]), 1)
        for bad in ({**good, "agent": "ceo"}, {**good, "agent": "ghost"}, {**good, "when": {"time": "9:30", "days": [0]}},
                    {**good, "when": {"time": "09:30", "days": []}}, {**good, "when": {"time": "09:30", "days": [7]}},
                    {**good, "when": {"time": "09:30", "days": [True]}}, {**good, "label": " "}, {**good, "prompt": "x" * 5000}):
            with self.assertRaises(plan.PlanError):
                plan.apply("add_schedule", bad, self.TABLE)
        with self.assertRaises(plan.PlanError):
            plan.apply("nope", {}, self.TABLE)

    def test_due_fires_once_in_the_grace_window_and_marks_older_slots_missed(self):
        sched = {"id": "s", "enabled": True, "when": {"time": "09:00", "days": [4]}, "created": "2026-10-01T00:00:00"}   # Friday
        friday = datetime(2026, 10, 30, 9, 5)          # 2026-10-30 is a Friday
        self.assertEqual(plan.due({"schedules": [sched]}, friday), ([sched], []))
        self.assertEqual(plan.due({"schedules": [sched]}, datetime(2026, 10, 30, 8, 59)), ([], []))
        self.assertEqual(plan.due({"schedules": [sched]}, datetime(2026, 10, 30, 9, 40)), ([], [sched]))
        self.assertEqual(plan.due({"schedules": [{**sched, "last_fired_date": "2026-10-30"}]}, friday), ([], []))
        self.assertEqual(plan.due({"schedules": [{**sched, "enabled": False}]}, friday), ([], []))
        self.assertEqual(plan.due({"schedules": [sched]}, datetime(2026, 10, 29, 9, 5)), ([], []))      # Thursday
        late = {**sched, "created": "2026-10-30T09:03:00"}      # created after today's slot: waits for the next one
        self.assertEqual(plan.due({"schedules": [late]}, friday), ([], []))


class Verify(unittest.TestCase):
    def test_extracts_ids_and_https_links_once(self):
        cves, links = verify.extract("See CVE-2026-1234 and CVE-2026-1234, https://example.com/a. Also http://insecure.test/x")
        self.assertEqual(cves, ["CVE-2026-1234"])
        self.assertEqual(links, ["https://example.com/a"])

    def test_private_and_odd_addresses_are_never_fetched(self):
        for url in ("https://127.0.0.1/x", "https://localhost/x", "https://192.168.1.5/", "https://10.0.0.1/",
                    "https://169.254.169.254/latest", "http://example.com/", "https://user:pw@example.com/", "ftp://example.com/"):
            self.assertFalse(verify.public_host(url), url)
        self.assertEqual(verify.check_link("https://127.0.0.1/x")["status"], "skipped")


class Security(unittest.TestCase):
    def test_only_local_hosts_and_origins_are_allowed(self):
        for ok in ("localhost:8796", "127.0.0.1:8796", "127.0.0.1"):
            self.assertTrue(server.ALLOWED_HOST.match(ok), ok)
        for bad in ("evil.com", "127.0.0.1.evil.com", "localhost.evil.com:80"):
            self.assertFalse(server.ALLOWED_HOST.match(bad), bad)
        self.assertTrue(server.ALLOWED_ORIGIN.match("http://127.0.0.1:8796"))
        self.assertFalse(server.ALLOWED_ORIGIN.match("https://evil.com"))
        self.assertFalse(server.ALLOWED_ORIGIN.match("http://localhost.evil.com"))

    def test_server_binds_to_loopback_only(self):
        self.assertEqual(server.HOST, "127.0.0.1")

    def test_run_ids_cannot_escape_the_output_folder(self):
        for bad in ("../etc/passwd", "a/b", "", "x" * 200):
            with self.assertRaises(server.RequestError):
                server.output_response(bad)


if __name__ == "__main__":
    unittest.main()
