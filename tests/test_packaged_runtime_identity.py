from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "electron" / "runtime-identity.js"


def run_case(observed: dict, expected: dict) -> bool:
    assert MODULE.exists(), "packaged Runtime identity helper is missing"
    node = r'''
const { runtimeIdentityMatches } = require(process.argv[1]);
const observed = JSON.parse(process.argv[2]);
const expected = JSON.parse(process.argv[3]);
process.stdout.write(JSON.stringify(Boolean(runtimeIdentityMatches(observed, expected))));
'''
    result = subprocess.run(
        ["node", "-e", node, str(MODULE), json.dumps(observed), json.dumps(expected)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def valid_observed(pid: int, instance: str = "owned-runtime-instance") -> dict:
    return {
        "statusCode": 200,
        "schema": "lumi.runtime.v1",
        "instance": instance,
        "pid": pid,
    }


def test_packaged_runtime_accepts_authenticated_child_pid() -> None:
    expected = {
        "expectedSchema": "lumi.runtime.v1",
        "expectedInstance": "owned-runtime-instance",
        "expectedPid": 4100,
        "allowChildPid": True,
    }
    assert run_case(valid_observed(4200), expected) is True


def test_source_runtime_still_requires_spawned_pid() -> None:
    expected = {
        "expectedSchema": "lumi.runtime.v1",
        "expectedInstance": "owned-runtime-instance",
        "expectedPid": 4100,
        "allowChildPid": False,
    }
    assert run_case(valid_observed(4200), expected) is False
    assert run_case(valid_observed(4100), expected) is True


def test_runtime_instance_mismatch_is_always_rejected() -> None:
    expected = {
        "expectedSchema": "lumi.runtime.v1",
        "expectedInstance": "owned-runtime-instance",
        "expectedPid": 4100,
        "allowChildPid": True,
    }
    assert run_case(valid_observed(4200, instance="different-runtime"), expected) is False
