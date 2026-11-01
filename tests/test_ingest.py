"""Offline tests for the external ingestion layer."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import ingest  # noqa: E402

TABLE = {"writer": {"id": "writer", "room": "writing"}, "engineer": {"id": "engineer", "room": "code"}}


class Ingest(unittest.TestCase):
    def setUp(self):
        ingest.reset()
        self.events = []
        self.write = mock.patch("ingest.common.write_event", side_effect=self.events.append)
        self.agents = mock.patch("ingest._agents", return_value=TABLE)
        self.write.start()
        self.agents.start()

    def tearDown(self):
        self.agents.stop()
        self.write.stop()
        ingest.reset()

    def test_tool_event_for_an_explicit_agent(self):
        ingest.handle({"event": "tool", "agent": "writer", "session": "s1",
                       "session_name": "Claude \u00b7 test", "tool": "Read", "target": "README.md"})
        self.assertEqual(len(self.events), 1)
        event = self.events[0]
        self.assertEqual(event["type"], "terminal_tool")
        self.assertEqual(event["agent"], "writer")
        self.assertEqual(event["room"], "writing")
        self.assertEqual((event["tool"], event["detail"]), ("Read", "README.md"))

    def test_cwd_mapping_is_used_when_no_agent_is_given(self):
        with mock.patch("ingest.mapping.resolve", return_value=("engineer", "code")):
            ingest.handle({"event": "started", "session": "s2", "cwd": "/tmp/project"})
        self.assertEqual(self.events[0]["type"], "terminal_status")
        self.assertEqual(self.events[0]["agent"], "engineer")
        self.assertEqual(self.events[0]["status"], "working")

    def test_finished_moves_the_session_to_done(self):
        ingest.handle({"event": "started", "agent": "writer", "session": "s3"})
        ingest.handle({"event": "finished", "agent": "writer", "session": "s3"})
        self.assertEqual(self.events[-1]["type"], "terminal_status")
        self.assertEqual(self.events[-1]["status"], "done")
        sessions = ingest.list_sessions()
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["status"], "done")

    def test_closed_removes_the_session_from_the_list(self):
        ingest.handle({"event": "started", "agent": "writer", "session": "s4"})
        ingest.handle({"event": "finished", "status": "closed", "agent": "writer", "session": "s4"})
        self.assertEqual(ingest.list_sessions(), [])

    def test_unknown_agent_and_missing_session_raise(self):
        with self.assertRaises(ValueError):
            ingest.handle({"event": "tool", "agent": "nobody", "session": "s5"})
        with self.assertRaises(ValueError):
            ingest.handle({"event": "tool", "agent": "writer"})

    def test_target_is_clipped(self):
        ingest.handle({"event": "tool", "agent": "writer", "session": "s6",
                       "tool": "Read", "target": "x" * 200})
        self.assertLessEqual(len(self.events[0]["detail"]), 80)


if __name__ == "__main__":
    unittest.main()
