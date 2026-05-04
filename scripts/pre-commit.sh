#!/bin/sh
# Pre-commit hook: lint-staged + secret detection + large file check
# Called by simple-git-hooks

set -e

# 1. Lint-staged (ESLint fix + Prettier)
npx lint-staged

# 2. Block commits of sensitive files
SENSITIVE_PATTERNS=".env .env.local .env.*.local credentials.json .pem .key id_rsa"
for pattern in $SENSITIVE_PATTERNS; do
  staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E "(^|/)${pattern}$" || true)
  if [ -n "$staged" ]; then
    echo "❌ BLOCKED: Attempting to commit sensitive file: $staged"
    echo "   Add to .gitignore or use 'git reset HEAD <file>'"
    exit 1
  fi
done

# 3. Detect secrets in staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|json|yml|yaml|env)$' || true)
if [ -n "$STAGED_FILES" ]; then
  for file in $STAGED_FILES; do
    if git show ":$file" 2>/dev/null | grep -qiE '\b(api[_-]?key|password|secret|token)\b\s*[:=]\s*["\x27][^"\x27]{8,}'; then
      echo "❌ BLOCKED: Possible secret detected in $file"
      echo "   Review the file and remove credentials before committing"
      exit 1
    fi
  done
fi

# 4. Block dangerouslySetInnerHTML without sanitizeHtml
TSX_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.tsx$' || true)
if [ -n "$TSX_FILES" ]; then
  for file in $TSX_FILES; do
    if git show ":$file" 2>/dev/null | grep -q 'dangerouslySetInnerHTML'; then
      if ! git show ":$file" 2>/dev/null | grep -q 'sanitizeHtml'; then
        echo "❌ BLOCKED: dangerouslySetInnerHTML without sanitizeHtml in $file"
        echo "   Always use sanitizeHtml() from ~/shared/lib/html before setting inner HTML"
        exit 1
      fi
    fi
  done
fi

# 5. Block console.log (use logger instead)
CODE_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v 'test/' || true)
if [ -n "$CODE_FILES" ]; then
  for file in $CODE_FILES; do
    if git show ":$file" 2>/dev/null | grep -qE 'console\.(log|debug|info)\b'; then
      echo "⚠️  WARNING: console.log/debug/info in $file — use logger from ~/shared/lib/logger"
    fi
  done
fi

# 6. Block large files (>2MB)
LARGE_FILES=$(git diff --cached --name-only --diff-filter=ACM | while read f; do
  size=$(git cat-file -s ":$f" 2>/dev/null || echo 0)
  if [ "$size" -gt 2097152 ]; then
    echo "$f ($(( size / 1024 ))KB)"
  fi
done)
if [ -n "$LARGE_FILES" ]; then
  echo "❌ BLOCKED: Large files (>2MB) staged:"
  echo "$LARGE_FILES"
  echo "   Use Git LFS or add to .gitignore"
  exit 1
fi
