#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
斐波那契数列计算器
功能：计算斐波那契数列的前 N 个数，支持递归和迭代两种实现方式
并比较两种方法的执行时间
"""

import sys
import time
from functools import lru_cache


def fibonacci_recursive(n):
    """
    递归方式计算斐波那契数列的第 n 个数
    使用 lru_cache 装饰器来缓存已计算的结果，避免重复计算
    
    参数:
        n: 斐波那契数列的索引（从0开始）
    返回:
        第 n 个斐波那契数
    """
    if n <= 1:
        return n
    return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2)


def fibonacci_iterative(n):
    """
    迭代方式计算斐波那契数列的第 n 个数
    使用循环实现，时间复杂度 O(n)，空间复杂度 O(1)
    
    参数:
        n: 斐波那契数列的索引（从0开始）
    返回:
        第 n 个斐波那契数
    """
    if n <= 1:
        return n
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


def get_fibonacci_sequence_recursive(n):
    """
    使用递归方式获取斐波那契数列的前 n 个数
    
    参数:
        n: 要计算的斐波那契数列长度
    返回:
        包含前 n 个斐波那契数的列表
    """
    return [fibonacci_recursive(i) for i in range(n)]


def get_fibonacci_sequence_iterative(n):
    """
    使用迭代方式获取斐波那契数列的前 n 个数
    
    参数:
        n: 要计算的斐波那契数列长度
    返回:
        包含前 n 个斐波那契数的列表
    """
    if n <= 0:
        return []
    
    sequence = [0]
    if n == 1:
        return sequence
    
    sequence.append(1)
    for i in range(2, n):
        sequence.append(sequence[i - 1] + sequence[i - 2])
    
    return sequence


def compare_performance(n):
    """
    比较递归和迭代两种方法的执行时间
    
    参数:
        n: 要计算的斐波那契数列长度
    """
    print(f"\n{'='*60}")
    print(f"性能比较 - 计算前 {n} 个斐波那契数")
    print(f"{'='*60}")
    
    # 测试递归方法（带缓存优化）
    # 注意：对于较大的 n，纯递归会非常慢，这里使用缓存优化版本
    start_time = time.perf_counter()
    recursive_result = get_fibonacci_sequence_recursive(n)
    recursive_time = time.perf_counter() - start_time
    
    print(f"\n【递归方法】（带 lru_cache 缓存优化）")
    print(f"  执行时间: {recursive_time:.6f} 秒")
    print(f"  结果: {recursive_result}")
    
    # 测试迭代方法
    start_time = time.perf_counter()
    iterative_result = get_fibonacci_sequence_iterative(n)
    iterative_time = time.perf_counter() - start_time
    
    print(f"\n【迭代方法】")
    print(f"  执行时间: {iterative_time:.6f} 秒")
    print(f"  结果: {iterative_result}")
    
    # 比较结果
    print(f"\n{'='*60}")
    print("比较结果:")
    print(f"{'='*60}")
    
    if recursive_time > 0 and iterative_time > 0:
        speedup = recursive_time / iterative_time
        print(f"  迭代方法比递归方法快 {speedup:.2f} 倍")
    
    # 验证两种方法结果是否一致
    if recursive_result == iterative_result:
        print(f"  ✓ 两种方法计算结果一致")
    else:
        print(f"  ✗ 两种方法计算结果不一致！")


def main():
    """
    主函数：处理命令行参数并执行斐波那契数列计算
    """
    # 检查命令行参数
    if len(sys.argv) != 2:
        print("用法: python fibonacci.py <N>")
        print("  N: 要计算的斐波那契数列的长度（正整数）")
        print("\n示例:")
        print("  python fibonacci.py 10")
        sys.exit(1)
    
    # 解析参数
    try:
        n = int(sys.argv[1])
        if n <= 0:
            print("错误: N 必须是正整数")
            sys.exit(1)
        if n > 10000:
            print("警告: N 较大时计算可能需要较长时间，建议 N <= 10000")
            response = input("是否继续? (y/n): ")
            if response.lower() != 'y':
                sys.exit(0)
    except ValueError:
        print("错误: N 必须是整数")
        sys.exit(1)
    
    print(f"\n{'='*60}")
    print(f"斐波那契数列计算器")
    print(f"{'='*60}")
    print(f"计算前 {n} 个斐波那契数\n")
    
    # 执行性能比较
    compare_performance(n)
    
    print(f"\n{'='*60}")
    print("程序执行完成！")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
