#!/usr/bin/env python3
"""用户主动运行后，将构建好的插件注册到 Codex 个人 marketplace。"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description='注册 ProjectFlow 到个人插件目录；不启动任务，不删除用户项目数据。')
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--helper', type=Path, default=Path.home()/'.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py')
args = parser.parse_args()
source = Path(__file__).resolve().parents[1]
target_parent = Path.home()/'.agents/plugins/plugins'
target = target_parent/'projectflow'
for name in ['.codex-plugin/plugin.json','dist/server.mjs','node_modules/@modelcontextprotocol/sdk/package.json']:
    if not (source/name).is_file():
        sys.exit('缺少运行文件：'+name+'。请先 npm ci 并 npm run build，或使用完整分发包。')
if not args.helper.is_file():
    sys.exit('找不到 Codex plugin-creator 脚手架。请在 Codex 中使用 plugin-creator 安装此目录，或用 --helper 指定官方脚手架位置。')
if args.dry_run:
    print(json.dumps({'source':str(source),'destination':str(target),'marketplace':str(Path.home()/'.agents/plugins/marketplace.json'),'will_install':False},ensure_ascii=False,indent=2))
    sys.exit(0)
if target.exists():
    sys.exit('目标插件目录已存在。为避免覆盖，本脚本停止；请使用 Codex 的插件更新流程。')
subprocess.run([sys.executable,str(args.helper),'projectflow','--path',str(target_parent),'--with-marketplace'],check=True)
for name in ['.codex-plugin','.mcp.json','skills','references','templates','assets','dist','node_modules','package.json','package-lock.json','README.md']:
    src=source/name
    if src.is_dir():shutil.copytree(src,target/name,dirs_exist_ok=True)
    else:shutil.copy2(src,target/name)
print('已注册到个人 marketplace。请在 Codex 插件页面选择 ProjectFlow 安装，然后新开任务加载工具。')
print('插件目录：'+str(target))
