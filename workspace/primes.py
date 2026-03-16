import math

def is_prime(n):
    """判断一个数是否为质数"""
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(math.sqrt(n)) + 1, 2):
        if n % i == 0:
            return False
    return True

def main():
    limit = 1000000
    primes = []
    
    print("开始计算 1 到 1000000 之间的所有质数...")
    
    for num in range(1, limit + 1):
        if is_prime(num):
            primes.append(num)
        
        # 每计算 10000 个数字打印一次进度
        if num % 10000 == 0:
            print(f"进度：已计算 {num}/{limit} 个数字，当前找到 {len(primes)} 个质数")
    
    # 保存到文件
    output_file = "/Users/zengxinyue/.openclaw/workspace/primes.txt"
    with open(output_file, "w") as f:
        for prime in primes:
            f.write(str(prime) + "\n")
    
    print(f"\n✅ 计算完成！")
    print(f"总共找到 {len(primes)} 个质数")
    print(f"结果已保存到: {output_file}")
    
    return len(primes)

if __name__ == "__main__":
    main()
