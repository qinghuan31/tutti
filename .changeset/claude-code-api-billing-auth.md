---
"@tutti-os/desktop": patch
---

Treat Claude Code API Usage Billing as authenticated in the environment wizard. When Claude Code is configured with an Anthropic API key or a custom API endpoint, the provider status probe now reports the provider as ready instead of blocking on "未登录", since no Anthropic Console login session is required. The login step label now also distinguishes between a Console OAuth session ("已登录账号") and API Usage Billing ("已配置 API 计费").
