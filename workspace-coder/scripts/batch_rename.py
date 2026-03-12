#!/usr/bin/env python3
"""
批量文件重命名脚本
支持：前缀添加、后缀添加、序号编号
"""

import os
import re
import argparse
from pathlib import Path


def batch_rename(directory, prefix="", suffix="", start_num=1, dry_run=False):
    """
    批量重命名文件
    
    Args:
        directory: 目标目录
        prefix: 文件名前缀
        suffix: 文件名后缀
        start_num: 起始编号
        dry_run: 是否只预览不执行
    """
    path = Path(directory)
    if not path.exists():
        print(f"❌ 目录不存在: {directory}")
        return
    
    files = [f for f in path.iterdir() if f.is_file()]
    files.sort()
    
    print(f"📁 目录: {directory}")
    print(f"📄 找到 {len(files)} 个文件")
    print(f"🔧 前缀: '{prefix}', 后缀: '{suffix}', 起始编号: {start_num}")
    print("-" * 50)
    
    for i, file in enumerate(files, start=start_num):
        # 保留原扩展名
        ext = file.suffix
        name_without_ext = file.stem
        
        # 构建新文件名
        new_name = f"{prefix}{name_without_ext}{suffix}{i:03d}{ext}"
        new_path = path / new_name
        
        if dry_run:
            print(f"[预览] {file.name} -> {new_name}")
        else:
            file.rename(new_path)
            print(f"✅ {file.name} -> {new_name}")
    
    print("-" * 50)
    if dry_run:
        print("💡 这是预览模式，实际未执行。去掉 --dry-run 执行重命名")
    else:
        print("✨ 重命名完成！")


def main():
    parser = argparse.ArgumentParser(description="批量文件重命名工具")
    parser.add_argument("directory", help="目标目录路径")
    parser.add_argument("--prefix", "-p", default="", help="文件名前缀")
    parser.add_argument("--suffix", "-s", default="", help="文件名后缀")
    parser.add_argument("--start-num", "-n", type=int, default=1, help="起始编号")
    parser.add_argument("--dry-run", "-d", action="store_true", help="预览模式，不实际执行")
    
    args = parser.parse_args()
    
    batch_rename(
        directory=args.directory,
        prefix=args.prefix,
        suffix=args.suffix,
        start_num=args.start_num,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
