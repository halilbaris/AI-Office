"""Offline tests for the office server. Run: python3 -m unittest discover -s tests -v
No network, no model calls, no real agents.json needed."""
import json
import os
import sys
import tempfile
from datetime import datetime
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import common  # noqa: E402
import server  # noqa: E402
import briefcheck  # noqa: E402
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


class Projects(unittest.TestCase):
    TABLE = {"researcher": {"id": "researcher", "name": "Researcher", "reviewed_by": None}, "trainer": {"id": "trainer", "name": "Trainer"},
             "ceo": {"id": "ceo"}}

    def raw(self, **over):
        base = {"title": "Course", "steps": [{"id": "a", "agent": "researcher", "title": "Research", "prompt": "p"},
                                              {"id": "b", "agent": "trainer", "title": "Lesson", "prompt": "p", "after": "a"}]}
        return {**base, **over}

    def test_make_project_validates(self):
        self.assertEqual(len(plan.make_project(self.raw(), self.TABLE)["steps"]), 2)
        steps = self.raw()["steps"]
        for bad in (self.raw(steps=steps[:1]), self.raw(steps=[steps[0], {**steps[1], "after": "zz"}]),
                    self.raw(steps=[steps[0], {**steps[1], "agent": "ceo"}]),
                    self.raw(steps=steps * 7), self.raw(title=""), None):
            with self.assertRaises(plan.PlanError):
                plan.make_project(bad, self.TABLE)

    def test_messy_model_ids_are_normalised_and_still_linked(self):
        raw = self.raw(steps=[{"id": "step_1: Research", "agent": "researcher", "title": "R", "prompt": "p"},
                              {"id": "Step 2", "agent": "trainer", "title": "T", "prompt": "p", "after": "step_1: Research"},
                              {"id": "Step 2", "agent": "trainer", "title": "T2", "prompt": "p", "after": 2}])
        steps = plan.make_project(raw, self.TABLE)["steps"]
        self.assertEqual(len({s["id"] for s in steps}), 3)                 # duplicates get their own id
        self.assertEqual(steps[1]["after"], steps[0]["id"])
        self.assertEqual(steps[2]["after"], steps[1]["id"])                # "after": 2 means the 2nd step

    def test_steps_default_to_following_the_previous_one_unless_marked_independent(self):
        raw = self.raw(steps=[{"id": "a", "agent": "researcher", "title": "R", "prompt": "p"},
                              {"id": "b", "agent": "trainer", "title": "T", "prompt": "p"},
                              {"id": "c", "agent": "trainer", "title": "T2", "prompt": "p", "after": "none"},
                              {"id": "d", "agent": "trainer", "title": "T3", "prompt": "p", "after": "a"}])
        after = [s["after"] for s in plan.make_project(raw, self.TABLE)["steps"]]
        self.assertEqual(after, [None, "a", None, "a"])

    def test_a_step_is_ready_only_when_the_one_it_waits_for_is_done(self):
        project = plan.make_project(self.raw(), self.TABLE)
        ids = lambda st: [s["id"] for s in plan.ready_steps(project, st)]
        self.assertEqual(ids({}), ["a"])                 # not started yet: ready
        project["steps"][0]["run_id"] = "r1"             # started: no longer ready, b waits for it
        self.assertEqual(ids({"a": "running"}), [])
        self.assertEqual(ids({"a": "reviewing"}), [])
        self.assertEqual(ids({"a": "hold"}), [])
        self.assertEqual(ids({"a": "failed"}), [])
        self.assertEqual(ids({"a": "done"}), ["b"])
        self.assertEqual(plan.project_summary(project, {"a": "done", "b": "done"})["complete"], True)


class Budgets(unittest.TestCase):
    DATA = ({"settings": {"daily_token_cap": 1000}}, {"qa": {"id": "qa", "name": "QA", "daily_token_budget": 300}, "writer": {"id": "writer", "name": "Writer"}})

    def check(self, agent, used):
        with mock.patch.object(common, "load_agents", return_value=self.DATA), \
                mock.patch.object(server, "fresh_tokens_by_agent", return_value=used):
            server.check_budget(agent)

    def test_budget_value_is_a_plain_number(self):
        self.assertEqual(common.agent_budget({"daily_token_budget": 250}), 250)
        for junk in (None, "x", -4, {}):
            self.assertEqual(common.agent_budget({"daily_token_budget": junk}), 0)

    def test_an_agent_stops_at_its_own_budget_but_others_keep_working(self):
        self.check("qa", {"qa": 299})
        with self.assertRaises(server.RequestError) as e:
            self.check("qa", {"qa": 300})
        self.assertEqual(e.exception.code, 429)
        self.check("writer", {"qa": 300})            # the writer has no budget of its own

    def test_the_office_cap_still_wins(self):
        with self.assertRaises(server.RequestError):
            self.check("writer", {"qa": 200, "writer": 900})


class Goals(unittest.TestCase):
    TABLE = {"qa": {"id": "qa"}, "ceo": {"id": "ceo"}}

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.old = (plan.PLAN_FILE, common.STATE_DIR)
        plan.PLAN_FILE, common.STATE_DIR = os.path.join(self.dir, "plan.json"), self.dir

    def tearDown(self):
        plan.PLAN_FILE, common.STATE_DIR = self.old

    def goal(self):
        return plan.apply("add_goal", {"title": "Launch the SOC course", "why": "first paying students"}, self.TABLE)["goals"][0]["id"]

    def test_goal_is_validated_and_carried_by_work(self):
        gid = self.goal()
        done = plan.apply("add_task", {"title": "Quiz", "agent": "qa", "goal": gid, "auto": True}, self.TABLE)
        self.assertEqual((done["tasks"][0]["goal"], done["tasks"][0]["auto"]), (gid, True))
        with self.assertRaises(plan.PlanError):
            plan.apply("add_task", {"title": "x", "agent": "qa", "goal": "g-nope"}, self.TABLE)
        with self.assertRaises(plan.PlanError):
            plan.apply("add_goal", {"title": " "}, self.TABLE)

    def test_deleting_a_goal_keeps_the_work(self):
        gid = self.goal()
        plan.apply("add_task", {"title": "Quiz", "agent": "qa", "goal": gid}, self.TABLE)
        left = plan.apply("delete_goal", {"id": gid}, self.TABLE)
        self.assertEqual((left["goals"], len(left["tasks"]), "goal" in left["tasks"][0]), ([], 1, False))

    def test_goal_text_reaches_the_agent_and_a_missing_goal_does_not(self):
        gid = self.goal()
        self.assertEqual(plan.goal_context(plan.load(), gid)["title"], "Launch the SOC course")
        self.assertIsNone(plan.goal_context(plan.load(), "g-gone"))


class Queue(unittest.TestCase):
    TABLE = {"qa": {"id": "qa"}, "writer": {"id": "writer"}, "ceo": {"id": "ceo"}}

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.old = (plan.PLAN_FILE, common.STATE_DIR)
        plan.PLAN_FILE, common.STATE_DIR = os.path.join(self.dir, "plan.json"), self.dir

    def tearDown(self):
        plan.PLAN_FILE, common.STATE_DIR = self.old

    def add(self, title, agent, auto=True):
        plan.apply("add_task", {"title": title, "agent": agent, "auto": auto}, self.TABLE)

    def tasks(self):
        return {t["title"]: t for t in plan.load()["tasks"]}

    def test_a_free_agent_takes_its_oldest_item_one_per_tick(self):
        self.add("first", "qa"); self.add("second", "qa"); self.add("manual", "writer", auto=False)
        calls = []
        def fake(agent, **kw):
            calls.append((agent, kw["label"], kw["source"]))
            return {"run_id": "r-" + kw["label"]}
        with mock.patch.object(server, "start_task", side_effect=fake):
            server.queue_tick()
        self.assertEqual(calls, [("qa", "first", "queue")])          # not the second, not the manual one
        self.assertEqual(self.tasks()["first"]["run_id"], "r-first")
        self.assertNotIn("run_id", self.tasks()["second"])

    def test_a_busy_agent_waits_but_a_refusal_stops_the_item_and_says_why(self):
        self.add("busy", "qa"); self.add("capped", "writer")
        def fake(agent, **kw):
            raise server.RequestError(409 if agent == "qa" else 429, "no")
        with mock.patch.object(server, "start_task", side_effect=fake):
            server.queue_tick()
        t = self.tasks()
        self.assertTrue(t["busy"]["auto"])
        self.assertFalse(t["capped"]["auto"])
        self.assertIn("not started by itself", t["capped"]["note"])

    def test_queue_never_asks_for_shipping(self):
        self.add("job", "qa")
        with mock.patch.object(server, "start_task", return_value={"run_id": "r"}) as m:
            server.queue_tick()
        self.assertNotIn("ship", m.call_args.kwargs)


class Briefs(unittest.TestCase):
    def brief(self, **over):
        return {"id": "b1", "title": "Phishing with QR code", "scenario_context": "A finance employee receives a mail with a QR code that leads to a lookalike Microsoft 365 sign-in page; the proxy logs show the redirect chain and the identity provider logs a sign-in from an unusual country a few minutes later. The analyst must decide whether the account is compromised.",
                "sector_code": "FINANCE", "difficulty": "Intermediate", "campaign_pack": "phishing", "count": 3,
                "verdict_mix": {"true_positive": 2, "false_positive": 1, "benign": 0}, "severity_counts": {"Low": 0, "Medium": 1, "High": 2, "Critical": 0},
                "mitre": ["T1566.001"], "incident_refs": [{"url": "https://example.com/report", "date": "2026-10-12", "what": "x"}], **over}

    def test_good_brief_passes_inside_a_fenced_block(self):
        out = briefcheck.check_text("Summary...\n```json\n" + json.dumps({"briefs": [self.brief()]}) + "\n```\n")
        self.assertEqual((out["found"], len(out["briefs"]), out["problems"]), (True, 1, []))

    def test_problems_reject_the_brief_with_a_reason(self):
        cases = {"ip": {"scenario_context": self.brief()["scenario_context"] + " Source 10.0.30.5."},
                 "short": {"scenario_context": "too short"}, "sector": {"sector_code": "SPACE"}, "difficulty": {"difficulty": "Easy"},
                 "pack": {"campaign_pack": "zero-day"}, "count": {"count": 11}, "mix": {"verdict_mix": {"true_positive": 1, "false_positive": 1}},
                 "sev": {"severity_counts": {"Low": 1, "Urgent": 2}}, "mitre": {"mitre": ["phishing"]},
                 "nosource": {"incident_refs": []}, "http": {"incident_refs": [{"url": "http://x.test", "date": "2026-10-12"}]}}
        for name, over in cases.items():
            out = briefcheck.check_text(json.dumps({"briefs": [self.brief(**over)]}))
            self.assertEqual((name, len(out["briefs"]), len(out["problems"])), (name, 0, 1))

    def test_no_json_or_no_briefs_key_is_reported_as_not_found(self):
        self.assertFalse(briefcheck.check_text("just prose")["found"])
        self.assertFalse(briefcheck.check_text('{"other": 1}')["found"])

    def test_duplicate_ids_and_the_12_brief_limit(self):
        out = briefcheck.check_text(json.dumps({"briefs": [self.brief(), self.brief()]}))
        self.assertEqual((len(out["briefs"]), len(out["problems"])), (1, 1))
        many = briefcheck.check_text(json.dumps({"briefs": [self.brief(id=f"b{i}") for i in range(14)]}))
        self.assertEqual(len(many["briefs"]), 12)


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
