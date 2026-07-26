from __future__ import annotations

import argparse
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

TOOL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_DIR))

import compare_golden as golden  # noqa: E402


def write_png(path: Path, offset: int = 0) -> None:
    image = Image.new("RGB", (48, 32), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((8 + offset, 8, 15 + offset, 23), fill="black")
    draw.rectangle((27, 12, 35, 19), fill="black")
    image.save(path)


def make_args(root: Path, **overrides) -> argparse.Namespace:
    values = {
        "test_cases": str(root / "cases.txt"),
        "fixtures": str(root / "fixtures"),
        "output": str(root / "output"),
        "suite": "unit",
        "policy": None,
        "threshold": 0.30,
        "diff_dir": None,
        "diff_from": None,
        "diff_to": None,
        "prooftree_tolerant": False,
        "reference_dpr": 2.0,
        "output_dpr": 1.0,
        "skip_environment": True,
        "baseline_report": None,
        "max_case_regression": None,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


class GoldenComparatorTests(unittest.TestCase):
    def test_metrics_expose_alignment_and_crop_geometry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref = root / "ref.png"
            test = root / "test.png"
            write_png(ref)
            write_png(test, offset=2)
            metrics = golden.compute_ink_metrics(
                golden.load_image(ref), golden.load_image(test)
            )
            self.assertIsInstance(metrics["best_dx"], int)
            self.assertIsInstance(metrics["best_dy"], int)
            self.assertEqual(len(metrics["ref_crop"]), 2)
            self.assertEqual(len(metrics["test_crop"]), 2)
            self.assertGreater(metrics["score"], 0)

    def test_missing_cases_never_disappear_from_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "fixtures").mkdir()
            (root / "output").mkdir()
            (root / "cases.txt").write_text("a\nb\nc\n", encoding="utf-8")
            write_png(root / "fixtures" / "0001.png")
            write_png(root / "fixtures" / "0003.png")
            write_png(root / "output" / "0001.png")
            write_png(root / "output" / "0002.png")

            report, errors = golden.build_report(make_args(root))
            self.assertEqual([case["index"] for case in report["cases"]], [1, 2, 3])
            self.assertEqual(report["cases"][1]["status"], "missing_fixture")
            self.assertEqual(report["cases"][2]["status"], "missing_output")
            self.assertEqual(report["summary"]["report_case_count"], 3)
            self.assertTrue(errors)

    def test_manifests_and_policy_account_for_every_slot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures = root / "fixtures"
            output = root / "output"
            fixtures.mkdir()
            output.mkdir()
            formulas = ["a", "b", r"\includegraphics{x}"]
            (root / "cases.txt").write_text("\n".join(formulas) + "\n", encoding="utf-8")
            cases_sha256 = golden.sha256_file(root / "cases.txt")
            for index in range(1, 4):
                write_png(fixtures / f"{index:04d}.png")
            for index in range(1, 3):
                write_png(output / f"{index:04d}.png")
            (fixtures / "reference-manifest.json").write_text(
                json.dumps(
                    {
                        "case_count": 3,
                        "test_cases_sha256": cases_sha256,
                        "cases": [
                            {"index": index, "status": "rendered"}
                            for index in range(1, 4)
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (output / "render-manifest.json").write_text(
                json.dumps(
                    {
                        "case_count": 3,
                        "test_cases_sha256": cases_sha256,
                        "cases": [
                            {"index": 1, "status": "rendered"},
                            {"index": 2, "status": "rendered"},
                            {
                                "index": 3,
                                "status": "parse_error",
                                "reason": "unsupported command",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            policy = root / "policy.json"
            policy.write_text(
                json.dumps(
                    {
                        "cases": {
                            "3": {
                                "formula": formulas[2],
                                "status": "unsupported",
                                "reason": "documented extension exclusion",
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            report, errors = golden.build_report(
                make_args(root, policy=str(policy))
            )
            summary = report["summary"]
            self.assertFalse(errors)
            self.assertTrue(report["integrity"]["complete"])
            self.assertEqual(
                (
                    summary["formula_count"],
                    summary["fixture_count"],
                    summary["output_count"],
                    summary["report_case_count"],
                ),
                (3, 3, 3, 3),
            )
            self.assertEqual(report["cases"][2]["status"], "unsupported")
            self.assertEqual(summary["coverage"], 1.0)
            self.assertLess(summary["coverage_adjusted_mean"], summary["rendered_mean"])

    def test_json_csv_and_baseline_regression_are_machine_readable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "fixtures").mkdir()
            (root / "output").mkdir()
            (root / "cases.txt").write_text("x\n", encoding="utf-8")
            write_png(root / "fixtures" / "0001.png")
            write_png(root / "output" / "0001.png")
            report, _ = golden.build_report(make_args(root))

            json_path = root / "report.json"
            csv_path = root / "report.csv"
            golden.write_json_report(json_path, report)
            golden.write_csv_report(csv_path, report["cases"])
            loaded = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(loaded["cases"][0]["formula"], "x")
            with csv_path.open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["status"], "scored")

            baseline = json.loads(json_path.read_text(encoding="utf-8"))
            baseline["cases"][0]["score"] = report["cases"][0]["score"] + 0.1
            baseline_path = root / "baseline.json"
            baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
            comparison, errors = golden.compare_baseline(
                report, baseline_path, max_case_regression=0.05
            )
            self.assertFalse(errors)
            self.assertEqual(comparison["regression_count"], 1)


if __name__ == "__main__":
    unittest.main()
