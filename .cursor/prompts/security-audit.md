# Security Audit

```
Perform a security audit on <PATH_OR_SCOPE>.

Check for:
1. XSS: dangerouslySetInnerHTML without sanitizeHtml()
2. URL injection: user URLs not validated with isValidUrl() / guard.url()
3. Code injection: eval(), new Function(), document.write()
4. Auth: credentials exposed in logs, URLs, or localStorage
5. CSRF: API requests without proper auth headers
6. Input validation: file uploads, email, usernames not sanitized
7. CSP: Content Security Policy headers in Electron and Vite
8. Dependencies: npm audit for known vulnerabilities
9. Secrets: hardcoded API keys, tokens, passwords in code
10. Permissions: role checks with hasPermission() for admin actions

Fix all Critical/High. Report Medium/Low.
Run: npm audit && npx tsc --noEmit && npx vitest run
```
