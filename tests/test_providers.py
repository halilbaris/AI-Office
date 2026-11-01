"""Offline tests for the provider parsers and cwd mapping."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from providers import mapping  # noqa: E402
from providers.generic_log import parse_line  # noqa: E402
from providers.opencode import model_name, tool_from_message, tool_from_part  # noqa: E402


class GenericParser(unittest.TestCase):
    def test_claude_tool_use(self):
        line = json.dumps({"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {"file_path": "/tmp/a.py"}}]}})
        self.assertEqual(parse_line(line)[:2], ("Read", "/tmp/a.py"))

    def test_opencode_tool_part(self):
        line = json.dumps({"type": "tool", "tool": "bash", "state": {"input": {"command": "ls"}}})
        self.assertEqual(parse_line(line)[:2], ("bash", "ls"))

    def test_codex_function_call(self):
        line = json.dumps({"type": "response_item", "payload": {
            "type": "function_call", "name": "shell", "arguments": "{\"command\":\"pwd\"}"}})
        self.assertEqual(parse_line(line)[:2], ("shell", "pwd"))

    def test_generic_object_and_non_json(self):
        self.assertEqual(parse_line(json.dumps({"tool": "read", "input": {"path": "a"}}))[:2],
                         ("read", "a"))
        self.assertIsNone(parse_line("plain text output"))
        self.assertIsNone(parse_line("{bad json"))


class OpenCodeParser(unittest.TestCase):
    def test_tool_and_target(self):
        part = {"type": "tool", "tool": "read", "state": {"input": {"filePath": "/a/b.md"}}}
        self.assertEqual(tool_from_part(part), ("read", "/a/b.md"))

    def test_v2_message_tool(self):
        message = {"content": [
            {"type": "reasoning", "text": "thinking"},
            {"type": "tool", "id": "call_1", "name": "shell",
             "state": {"input": {"command": "npm test"}}},
        ]}
        self.assertEqual(tool_from_message(message), ("call_1", "shell", "npm"))

    def test_non_tool_part_is_ignored(self):
        self.assertIsNone(tool_from_part({"type": "text", "text": "hello"}))

    def test_model_json(self):
        self.assertEqual(model_name('{"id":"gpt-5","providerID":"openai"}'), "gpt-5")
        self.assertIsNone(model_name(None))


class Mapping(unittest.TestCase):
    def test_nearest_parent_wins(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "bridge.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"cwd": {root: "writer", os.path.join(root, "sub"): "engineer"},
                           "default": "writer"}, handle)
            with mock.patch.object(mapping, "MAP_FILE", path):
                agents = {"writer": {"room": "writing"}, "engineer": {"room": "code"}}
                self.assertEqual(mapping.resolve(os.path.join(root, "sub", "x"), agents),
                                 ("engineer", "code"))
                self.assertEqual(mapping.resolve("/elsewhere", agents), ("writer", "writing"))

    def test_hide_and_skip(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "bridge.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"cwd": {root: "writer"}, "hide": ["secret"],
                           "skip_cwd": [os.path.join(root, "skip")]}, handle)
            with mock.patch.object(mapping, "MAP_FILE", path):
                agents = {"writer": {"room": "writing"}}
                self.assertEqual(mapping.resolve(os.path.join(root, "secret", "x"), agents),
                                 (None, None))
                self.assertEqual(mapping.resolve(os.path.join(root, "skip"), agents), (None, None))

    def test_ceo_mapping_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "bridge.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"cwd": {root: "ceo"}, "default": "engineer"}, handle)
            with mock.patch.object(mapping, "MAP_FILE", path):
                agents = {"ceo": {"room": "ceo"}, "engineer": {"room": "code"}}
                self.assertEqual(mapping.resolve(root, agents), ("engineer", "code"))


if __name__ == "__main__":
    unittest.main()
