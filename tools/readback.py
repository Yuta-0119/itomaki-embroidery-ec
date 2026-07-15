# -*- coding: utf-8 -*-
"""PES/DST の pyembroidery 読み戻し検証。

使い方:  py -X utf8 tools/readback.py <ディレクトリ or ファイル...>
  - *.pes / *.dst を読み込み、針数・色数・寸法を表示
  - 同名の *.plan.json があれば針数・寸法の一致を検査する

pyembroidery が無い場合:  py -m pip install --user pyembroidery
"""
import json
import os
import sys

import pyembroidery


def inspect(path):
    pat = pyembroidery.read(path)
    if pat is None:
        return None
    stitches = sum(1 for s in pat.stitches if s[2] == pyembroidery.STITCH)
    trims = sum(1 for s in pat.stitches if s[2] == pyembroidery.TRIM)
    colors = sum(1 for s in pat.stitches if s[2] == pyembroidery.COLOR_CHANGE) + 1
    ext = pat.extents()  # (min_x, min_y, max_x, max_y) 0.1mm
    return {
        "stitches": stitches,
        "trims": trims,
        "colorBlocks": colors,
        "threads": len(pat.threadlist),
        "wMm": round((ext[2] - ext[0]) / 10.0, 1),
        "hMm": round((ext[3] - ext[1]) / 10.0, 1),
    }


def main(argv):
    targets = []
    for a in argv:
        if os.path.isdir(a):
            targets += [
                os.path.join(a, f)
                for f in sorted(os.listdir(a))
                if f.lower().endswith((".pes", ".dst"))
            ]
        else:
            targets.append(a)
    if not targets:
        print("対象ファイルがありません")
        return 1

    failures = 0
    for t in targets:
        info = inspect(t)
        name = os.path.basename(t)
        if info is None:
            print(f"[NG] {name}: 読み込み失敗")
            failures += 1
            continue
        line = (
            f"[ok] {name}: 針数 {info['stitches']}, トリム {info['trims']}, "
            f"色ブロック {info['colorBlocks']}, {info['wMm']}x{info['hMm']}mm"
        )
        # plan.json との突き合わせ
        planPath = os.path.splitext(t)[0] + ".plan.json"
        if os.path.exists(planPath):
            with open(planPath, encoding="utf-8") as f:
                plan = json.load(f)
            # 止め縫いの3針は plan.stats.stitches に計上済み
            expST = plan["stats"]["stitches"]
            okST = abs(info["stitches"] - expST) <= max(4, expST * 0.002)
            okSZ = (
                abs(info["wMm"] - plan["size"]["wMm"]) <= 0.3
                and abs(info["hMm"] - plan["size"]["hMm"]) <= 0.3
            )
            okCO = info["colorBlocks"] == len(plan["blocks"])
            if not (okST and okSZ and okCO):
                failures += 1
                line += (
                    f"  <=> plan: 針数 {expST} ({'ok' if okST else 'NG'}), "
                    f"{plan['size']['wMm']}x{plan['size']['hMm']}mm ({'ok' if okSZ else 'NG'}), "
                    f"色 {len(plan['blocks'])} ({'ok' if okCO else 'NG'})"
                )
                line = line.replace("[ok]", "[NG]", 1)
            else:
                line += "  <=> plan一致"
        print(line)
    print("readback: " + ("全ファイル OK" if failures == 0 else f"{failures} 件 NG"))
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
