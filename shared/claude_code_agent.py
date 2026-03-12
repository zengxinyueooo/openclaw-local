#!/usr/bin/env python3
"""
Claude Code 自主交互 Agent
实现与 Claude Code 的多轮自动对话，直到任务完成
"""

import subprocess
import sys
import os
import time
import json
import re
import threading
import queue
from pathlib import Path
from datetime import datetime

# 配置
CLAUDE_CODE_CMD = ["mc", "--code"]
SHARED_DIR = Path.home() / ".openclaw" / "shared"
PROGRESS_DIR = SHARED_DIR / "progress"


class ClaudeCodeSession:
    """
    Claude Code 会话管理器
    保持会话，实现多轮自动对话
    """
    
    def __init__(self, task_id: str, workspace: str = None):
        self.task_id = task_id
        self.workspace = workspace or str(Path.home() / ".openclaw" / "workspace-coder")
        self.process = None
        self.output_queue = queue.Queue()
        self.session_file = PROGRESS_DIR / f"coder-{task_id}-session.json"
        self.conversation_history = []
        self.round_count = 0
        self.max_rounds = 10  # 最大对话轮数
        
    def start_session(self):
        """启动 Claude Code 会话"""
        print(f"🍊 启动 Claude Code 会话: {self.task_id}")
        
        # 使用 pty 创建伪终端
        import pty
        import select
        
        master_fd, slave_fd = pty.openpty()
        
        self.process = subprocess.Popen(
            ["mc", "--code"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=self.workspace,
            preexec_fn=os.setsid
        )
        
        os.close(slave_fd)
        self.master_fd = master_fd
        
        # 设置非阻塞
        import fcntl
        fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
        fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
        
        # 等待初始化
        time.sleep(3)
        
    def _read_output(self):
        """后台读取输出"""
        import select
        while self.process and self.process.poll() is None:
            try:
                ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                if ready:
                    data = os.read(self.master_fd, 1024).decode('utf-8', errors='ignore')
                    if data:
                        self.output_queue.put(data)
                        print(data, end='')  # 实时显示
            except:
                break
                
    def get_output(self, timeout: float = 5.0) -> str:
        """获取输出（带超时）"""
        import select
        lines = []
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            # 先检查队列
            try:
                while True:
                    line = self.output_queue.get_nowait()
                    lines.append(line)
            except queue.Empty:
                pass
            
            # 再直接读取
            try:
                ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                if ready:
                    data = os.read(self.master_fd, 1024).decode('utf-8', errors='ignore')
                    if data:
                        lines.append(data)
                        print(data, end='')
            except:
                pass
                
            if lines and time.time() - start_time > 1:  # 有内容后等1秒
                break
                    
        return ''.join(lines)
        
    def send_input(self, text: str, wait: float = 2.0):
        """发送输入"""
        if self.process and self.process.poll() is None:
            os.write(self.master_fd, (text + '\n').encode('utf-8'))
            time.sleep(wait)
            
    def is_ready(self) -> bool:
        """检查是否就绪"""
        output = self.get_output(timeout=3.0)
        # 检测就绪标志
        ready_patterns = ['>', '>>>', '╭─', '╰─', 'claude', 'ready']
        return any(p in output.lower() for p in ready_patterns)
        
    def close(self):
        """关闭会话"""
        try:
            os.close(self.master_fd)
        except:
            pass
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except:
                self.process.kill()
                
    def save_session(self):
        """保存会话状态"""
        data = {
            "task_id": self.task_id,
            "round_count": self.round_count,
            "conversation": self.conversation_history,
            "timestamp": datetime.now().isoformat(),
            "status": "running" if self.process and self.process.poll() is None else "closed"
        }
        with open(self.session_file, 'w') as f:
            json.dump(data, f, indent=2)


class CodingAgent:
    """
    Coding Agent - 自主决策与 Claude Code 交互
    """
    
    def __init__(self, task_id: str, task_description: str, requirements: list = None):
        self.task_id = task_id
        self.task_description = task_description
        self.requirements = requirements or []
        self.session = None
        self.workspace = str(Path.home() / ".openclaw" / "workspace-coder")
        
    def run(self) -> dict:
        """
        运行完整任务流程
        返回多轮交互后的结果
        """
        print(f"\n{'='*60}")
        print(f"🍊 Coding Agent 启动: {self.task_id}")
        print(f"{'='*60}\n")
        
        # 初始化进度
        self._update_progress("started", 10, "启动 Claude Code 会话...")
        
        # 1. 启动会话
        self.session = ClaudeCodeSession(self.task_id, self.workspace)
        self.session.start_session()
        
        # 2. 处理协议
        self._handle_agreement()
        
        # 3. 多轮对话完成任务
        result = self._multi_round_conversation()
        
        # 4. 关闭会话
        self.session.close()
        
        return result
        
    def _handle_agreement(self):
        """处理协议同意"""
        print("\n📋 等待协议提示...")
        
        # 等待并检测协议提示
        for _ in range(30):  # 最多等30秒
            output = self.session.get_output(timeout=1.0)
            
            if any(word in output.lower() for word in ['agree', 'y/n', 'terms']):
                print("🤖 检测到协议，自动同意...")
                self.session.send_input("y", wait=2.0)
                self._update_progress("agreed", 20, "已同意协议")
                return
                
        print("⚠️ 未检测到协议提示，继续...")
        
    def _multi_round_conversation(self) -> dict:
        """
        多轮对话完成任务
        核心逻辑：发送需求 → 等待结果 → 判断 → 继续或结束
        """
        # 第一轮：发送初始任务
        initial_prompt = self._build_initial_prompt()
        print(f"\n📝 第1轮：发送初始任务...")
        self.session.send_input(initial_prompt, wait=5.0)
        self._update_progress("round_1", 30, "已发送初始需求")
        
        # 等待第一轮结果
        round_1_output = self._wait_for_completion(timeout=120)
        self.session.conversation_history.append({
            "round": 1,
            "input": initial_prompt,
            "output": round_1_output
        })
        
        # 评估第一轮结果
        evaluation = self._evaluate_result(round_1_output)
        
        # 根据评估决定后续动作
        if evaluation["complete"]:
            return self._finish_task(round_1_output, "任务已完成")
            
        # 需要继续对话
        for round_num in range(2, self.session.max_rounds + 1):
            print(f"\n📝 第{round_num}轮：{evaluation['reason']}...")
            
            # 构建后续提示
            follow_up = self._build_follow_up(evaluation, round_1_output)
            self.session.send_input(follow_up, wait=5.0)
            self._update_progress(f"round_{round_num}", 30 + round_num * 7, f"第{round_num}轮对话")
            
            # 等待结果
            round_output = self._wait_for_completion(timeout=120)
            self.session.conversation_history.append({
                "round": round_num,
                "input": follow_up,
                "output": round_output
            })
            
            # 重新评估
            evaluation = self._evaluate_result(round_output)
            
            if evaluation["complete"]:
                return self._finish_task(round_output, f"第{round_num}轮完成")
                
        # 达到最大轮数
        return self._finish_task(round_output, "达到最大对话轮数")
        
    def _build_initial_prompt(self) -> str:
        """构建初始任务提示"""
        req_text = "\n".join([f"- {r}" for r in self.requirements])
        return f"""请完成以下编程任务：

{self.task_description}

要求：
{req_text}

请按以下步骤执行：
1. 分析需求
2. 创建必要的文件
3. 编写完整代码
4. 测试运行验证
5. 报告完成状态

完成后请明确说"任务完成"，并列出创建的文件。"""

    def _build_follow_up(self, evaluation: dict, last_output: str) -> str:
        """构建后续提示"""
        if evaluation["missing_files"]:
            return f"请创建以下文件：{', '.join(evaluation['missing_files'])}"
        elif evaluation["needs_fix"]:
            return f"请修复以下问题：{evaluation['reason']}"
        else:
            return "请继续完善代码，确保所有要求都满足。"
            
    def _evaluate_result(self, output: str) -> dict:
        """
        评估 Claude Code 的输出结果
        判断是否完成，还需要什么
        """
        result = {
            "complete": False,
            "reason": "",
            "missing_files": [],
            "needs_fix": False
        }
        
        # 检查是否明确说完成
        if any(phrase in output.lower() for phrase in ['任务完成', '已完成', 'done', 'complete']):
            result["complete"] = True
            result["reason"] = "Claude Code 报告任务完成"
            return result
            
        # 检查是否创建了文件
        file_patterns = [
            r'创建文件[:：]\s*(\S+)',
            r'created[:\s]+(\S+)',
            r'\.py\b',
            r'\.json\b',
            r'\.md\b'
        ]
        
        found_files = []
        for pattern in file_patterns:
            matches = re.findall(pattern, output, re.IGNORECASE)
            found_files.extend(matches)
            
        if not found_files:
            result["missing_files"] = ["请创建实现文件"]
            result["reason"] = "未检测到文件创建"
        else:
            # 检查文件是否真的存在
            for f in found_files[:3]:  # 检查前3个
                file_path = Path(self.workspace) / f
                if not file_path.exists():
                    result["missing_files"].append(f)
                    
        if result["missing_files"]:
            result["reason"] = f"缺少文件: {', '.join(result['missing_files'])}"
            
        return result
        
    def _wait_for_completion(self, timeout: int = 120) -> str:
        """等待 Claude Code 完成当前任务"""
        print(f"⏳ 等待完成（最多{timeout}秒）...")
        
        all_output = []
        start_time = time.time()
        last_output_time = start_time
        
        while time.time() - start_time < timeout:
            output = self.session.get_output(timeout=2.0)
            
            if output:
                all_output.append(output)
                last_output_time = time.time()
                
                # 检测完成标志
                if any(marker in output.lower() for marker in [
                    '任务完成', '已完成', 'done', 'complete',
                    '文件已创建', '代码已编写'
                ]):
                    print("✅ 检测到完成标志")
                    break
                    
            # 如果10秒没有新输出，可能完成了
            if time.time() - last_output_time > 10 and all_output:
                print("⏹️  输出停止，假设完成")
                break
                
        return ''.join(all_output)
        
    def _finish_task(self, final_output: str, reason: str) -> dict:
        """完成任务"""
        print(f"\n✅ {reason}")
        
        # 保存会话
        self.session.save_session()
        
        # 更新最终进度
        self._update_progress("completed", 100, reason, {
            "output_length": len(final_output),
            "rounds": len(self.session.conversation_history),
            "reason": reason
        })
        
        return {
            "success": True,
            "task_id": self.task_id,
            "rounds": len(self.session.conversation_history),
            "output": final_output,
            "reason": reason
        }
        
    def _update_progress(self, status: str, progress: int, message: str, details: dict = None):
        """更新进度到文件"""
        progress_file = PROGRESS_DIR / f"coder-{self.task_id}.json"
        PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
        
        data = {
            "agent_id": "coder",
            "task_id": self.task_id,
            "status": status,
            "progress": progress,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        
        with open(progress_file, 'w') as f:
            json.dump(data, f, indent=2)
            
        print(f"📊 进度更新: {progress}% - {message}")


def main():
    """测试"""
    agent = CodingAgent(
        task_id="test-multi-round",
        task_description="写一个Python脚本，读取JSON文件并统计字段频率，生成柱状图",
        requirements=["有详细注释", "有错误处理", "命令行参数支持"]
    )
    
    result = agent.run()
    
    print(f"\n{'='*60}")
    print("任务结果:")
    print(f"  成功: {result['success']}")
    print(f"  对话轮数: {result['rounds']}")
    print(f"  原因: {result['reason']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
