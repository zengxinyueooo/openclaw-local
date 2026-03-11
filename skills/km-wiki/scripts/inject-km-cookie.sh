#!/bin/bash

# 学城(KM) SSO Cookie 注入脚本
# 用法: bash inject-km-cookie.sh <misId>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDENTIFIER=$(bash "${SCRIPT_DIR}/read-env.sh")

# ===== 配置 =====
if [ -z "$1" ]; then
    echo "❌ 错误：请提供登录者 misId"
    echo ""
    echo "使用方式："
    echo "  bash $0 <misId>"
    echo ""
    echo "示例："
    echo "  bash $0 qigaoxiang"
    exit 1
fi
LOGIN_HINT="$1"
BASE_URL="https://supabase.cloud.test.sankuai.com"
COOKIE_OUTPUT="${SCRIPT_DIR}/cookies.json"

# 检查 IDENTIFIER 是否以 ERROR 开头
if [[ "$IDENTIFIER" == ERROR* ]]; then
    echo "❌  IDENTIFIER 错误: $IDENTIFIER"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀  开始获取 Token"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "login_hint: $LOGIN_HINT"
echo ""

# ===== 步骤 1：获取 auth_req_id =====
echo "📌  步骤 1：获取 auth_req_id..."

BC_RESPONSE=$(curl --noproxy "*" -s -X POST "${BASE_URL}/api/sandbox/sso/ciba-auth" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\": \"${IDENTIFIER}\",\"misId\": \"${LOGIN_HINT}\"}")

echo "响应: $BC_RESPONSE"

# 解析响应（优先从 authReqId 获取，如果没有则从 existingAuthReqId 获取）
AUTH_REQ_ID=$(echo "$BC_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); d=data.get('data',{}) if data.get('code')==0 else {}; print(d.get('authReqId','') or d.get('existingAuthReqId',''))" 2>/dev/null)

if [ -z "$AUTH_REQ_ID" ]; then
    ERROR_DESC=$(echo "$BC_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('data',{}).get('errorDescription','') or data.get('message','未知错误'))" 2>/dev/null)
    echo "❌  auth_req_id 获取失败: $ERROR_DESC"
    exit 1
fi

echo "✅  auth_req_id: $AUTH_REQ_ID"
echo ""

# ===== 步骤 2：轮询获取 access_token =====
echo "📌  步骤 2：轮询获取 access_token（每 5s 一次，最多 3 分钟）..."

MAX_RETRY=36
RETRY=0
ACCESS_TOKEN=""

while [ $RETRY -lt $MAX_RETRY ]; do
    RETRY=$((RETRY + 1))
    echo "  第 ${RETRY}/${MAX_RETRY} 次轮询..."

    TOKEN_RESPONSE=$(curl --noproxy "*" -s -X POST "${BASE_URL}/api/sandbox/sso/ciba-token" \
      -H 'Content-Type: application/json' \
      -d "{\"authReqId\": \"${AUTH_REQ_ID}\"}")

    echo "  响应: ${TOKEN_RESPONSE:0:100}..."

    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('data',{}).get('accessToken','') if data.get('code')==0 else '')" 2>/dev/null)
    
    if [ -n "$ACCESS_TOKEN" ]; then
        echo "✅  access_token 获取成功"
        break
    fi

    # 检查是否有错误
    ERROR_DESC=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('data',{}).get('errorDescription','') or data.get('message','未知错误'))" 2>/dev/null)
    if [ -n "$ERROR_DESC" ] && [ "$ERROR_DESC" != "null" ]; then
        echo "  错误: $ERROR_DESC"
    fi

    echo "  等待 5s..."
    sleep 5
done

if [ -z "$ACCESS_TOKEN" ]; then
    echo "❌  轮询超时，未获取到 access_token"
    exit 1
fi

echo ""

# ===== 步骤 3：换票 =====
echo "📌  步骤 3：换票获取最终 cookie..."

EXCHANGE_RESPONSE=$(curl --noproxy "*" -s -X POST "${BASE_URL}/api/sandbox/sso/exchange-token" \
  -H 'Content-Type: application/json' \
  -d "{\"accessToken\": \"${ACCESS_TOKEN}\",\"domain\": \"km.sankuai.com\"}")

echo "响应: $EXCHANGE_RESPONSE"

# 检查响应中的 data 字段
COOKIE_DATA=$(echo "$EXCHANGE_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(json.dumps(data.get('data',[])) if data.get('data') else '')" 2>/dev/null)

if [ -z "$COOKIE_DATA" ] || [ "$COOKIE_DATA" = "[]" ] || [ "$COOKIE_DATA" = "null" ]; then
    ERROR_MSG=$(echo "$EXCHANGE_RESPONSE" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('message','未知错误'))" 2>/dev/null)
    echo "❌  换票失败: $ERROR_MSG"
    exit 1
fi

echo "✅  换票成功"
echo ""

# ===== 步骤 4：生成 cookies.json =====
echo "📌  步骤 4：生成 cookies.json..."

python3 - << PYEOF
import json

exchange_response = """${EXCHANGE_RESPONSE}"""
output_path = "${COOKIE_OUTPUT}"

try:
    data = json.loads(exchange_response)
    cookie_data = data.get('data', [])
    
    if not cookie_data:
        print("❌  无法获取 cookie 数据")
        exit(1)
    
    with open(output_path, 'w') as f:
        json.dump(cookie_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅  cookies.json 已生成: {output_path}")
except Exception as e:
    print(f"❌  生成 cookies.json 失败: {e}")
    exit(1)
PYEOF

if [ $? -ne 0 ]; then
    exit 1
fi

echo ""

# ===== 步骤 5：运行 inject-cookie.py =====
echo "📌  步骤 5：注入 cookie 到浏览器..."

python3 "${SCRIPT_DIR}/inject-cookie.py"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
