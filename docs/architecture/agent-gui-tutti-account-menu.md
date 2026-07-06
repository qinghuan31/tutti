# AgentGUI Tutti Agent 账号与商业信息面板设计

## 背景

AgentGUI 左侧栏当前存在两个容易被误认为 `Tutti Agent` 的入口：

- `tutti-agent`：当前一方 Agent 入口，默认应该出现在 provider rail 中，标题为 `Tutti Agent`。
- `nexight`：历史 Tutti provider 标识，默认状态下不应该再被合成到新会话 provider rail。它只保留为历史会话、显式 host target、运行时兼容入口。

这次设计要解决两个问题：

1. 左侧栏默认只展示一个 `Tutti Agent`，不再展示下方历史 `Tutti` disabled placeholder。
2. 在 AgentGUI 左下角增加登录态账号入口，展示用户头像、昵称、会员档位、积分余额，并提供跳转到 Tutti Web 账号中心的入口。

## 现有代码事实

### AgentGUI provider rail

`packages/agent/gui/providerTargets.ts` 已经把默认 provider 目标收敛为：

```ts
["codex", "claude-code", "tutti-agent", "cursor", "hermes", "openclaw"];
```

其中 `nexight` 不在默认 provider targets 中，`agentGUIDisabledPlaceholderProviders` 也不再包含 `nexight`。

`packages/agent/gui/agent-gui/agentGuiNode/AgentGUINodeView.tsx` 仍保留显式 `nexight` rail order 和 disabled provider 支持，这是为了旧会话和 host 显式注入 target 的兼容。默认新会话不应该通过 view 层再次合成 `nexight`。

结论：

- 默认 provider catalog 和默认 placeholder 都不应包含 `nexight`。
- `createLocalAgentGUIProviderTarget("nexight")` 仍可保留，避免旧会话 unreadable。
- 如果用户没有显式传入 `nexight` target，AgentGUI 不应该在 rail 中渲染历史 `Tutti` 图标。

### Desktop 账号登录链路

`services/tuttid/service/account` 负责账号业务：

- `StartLogin`
- `LoginStatus`
- `GetUserInfo`
- `Logout`

`packages/auth/bridge-go` 读取本地 `auth.json`，字段包括：

- `session_id`
- `cookie`
- `user_id`
- `name`
- `avatar`
- `email`

daemon 通过 `/v1/account/user_info` 暴露用户信息。Desktop renderer 侧的 `IAccountService` 已经封装：

- `refreshUserInfo`
- `startLogin`
- `logout`

`DesktopAgentGUIWorkbenchBody` 已经在 `tutti-agent` 登录动作上使用 `accountService.startLogin()`，并在登录完成后刷新 provider readiness。

结论：

- AgentGUI package 不应该直接请求 Tutti Web 或 Commerce。
- Desktop host 应继续通过 daemon account service 获取账号态，再把状态作为 props 传入 AgentGUI。
- 账号 cookie 不应该进入 renderer 或 AgentGUI package。

### Commerce 和 Web 会员/积分链路

`tsh-commerce` 的核心模型：

- `ProductTypeSubscription = "membership_subscription"`
- `ProductTypeCreditsPack = "credits_pack"`
- `Membership.tier_key`: `basic | pro | ultra`
- `Membership.billing_period`: `month | year`
- `UserInfo.available_credits`
- `CreditsOverview.available_credits`

`tsh-commerce` 公开接口：

- `GET /v1/user-info`
- `GET /v1/products?product_type=membership_subscription`
- `GET /v1/credits/overview`

`tsh-web` 的 Commerce app 入口：

- `/profile/plan`
- `/profile/usage`
- `/profile/settings`

`tsh-web` 的展示映射：

- `basic` 显示为 `Lite`
- `pro` 显示为 `Pro`
- `ultra` 显示为 `Ultra`

结论：

- AgentGUI 账号入口的会员展示应复用 `Lite / Pro / Ultra` 命名。
- 没有 active membership 时展示 `Free`。
- 积分余额以 `/v1/credits/overview.available_credits` 为准；`/v1/user-info.available_credits` 可以作为 daemon 聚合时的降级来源。

## 目标体验

### 左侧栏 provider 入口

默认新会话左侧栏 provider rail：

- 显示 `Tutti Agent`，对应 `tutti-agent`。
- 不显示历史 `Tutti` disabled placeholder，除非 host 显式传入 `nexight` target 或正在打开旧会话。

验收标准：

- 新开 AgentGUI 时，rail 中只出现一个 Tutti 相关入口。
- 旧的 `nexight` 会话仍可打开、显示和继续读历史内容。
- 桌面 Tutti Agent switch 关闭时，`local:tutti-agent` 不进入新会话 targets、dock、launchpad、provider rail、mention candidates；已有会话仍可读。

### 左下角账号入口

未登录：

- 显示默认头像或 Tutti Agent 图标。
- 主文案：`Tutti Agent`
- 副文案：`登录`
- 点击后展示菜单，主要动作是登录。

已登录：

- 显示用户头像；无头像时显示昵称或邮箱首字母。
- 主文案展示昵称，缺省顺序：`name -> email -> user_id`。
- 副文案展示会员档位：`Lite / Pro / Ultra / Free`。
- 如果是会员，可在副文案或菜单会员行展示会员徽标。

菜单结构：

| 行       | 展示                                                     | 点击行为                           |
| -------- | -------------------------------------------------------- | ---------------------------------- |
| 会员     | `Lite / Pro / Ultra`，非会员为 `Free`，右侧可展示 `升级` | 打开 `/profile/plan`               |
| 积分余额 | 展示格式化后的 `available_credits`，打开菜单时刷新       | 打开 `/profile/usage`              |
| 账号中心 | 固定入口                                                 | 打开 `/profile/settings`           |
| 退出登录 | 仅已登录展示，可选                                       | 调用现有 `accountService.logout()` |

菜单打开时不阻塞渲染：

- 如果已有缓存，先展示缓存值，同时刷新积分和会员信息。
- 如果没有缓存，积分行展示 loading 状态。
- 刷新失败时保留旧值，并在该行展示非阻塞错误状态。

## 数据模型

建议在 daemon 和 desktop renderer 间新增一个聚合响应，避免 renderer 直接组合多个远端 Commerce 请求。

```ts
interface AccountProductSummary {
  user: {
    userId: string;
    name?: string;
    email?: string;
    avatar?: string;
  } | null;
  membership: {
    tierKey: string;
    displayName: string;
    billingPeriod?: "month" | "year" | string;
    status?: string;
    accessStatus?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  } | null;
  credits: {
    availableCredits: number | null;
    expiringCreditsWithin24h?: number;
    nextExpireAt?: string;
    refreshedAt: string;
  } | null;
  links: {
    planUrl: string;
    usageUrl: string;
    settingsUrl: string;
  };
}
```

会员状态判断：

- `membership == null`：展示 `Free`。
- `access_status === "active"`：展示对应档位。
- `status` 表示取消但仍在有效期内时，继续展示当前档位，并可在菜单中展示到期状态。
- 其他状态展示 `Free`，但保留 plan 跳转入口。

积分展示：

- 以 `credits.availableCredits` 为准。
- 使用当前 locale 的整数格式化，不展示小数。
- 值为 `null` 且 loading 时展示 loading；值为 `null` 且非 loading 时展示 `--`。

## Daemon API 设计

先更新 `services/tuttid/api/openapi/tuttid.v1.yaml`，再生成客户端。

建议新增：

```http
GET /v1/account/product_summary
```

职责：

- 读取本地 account session cookie。
- 请求 Commerce API：
  - `GET {commerceBaseURL}/v1/user-info`
  - `GET {commerceBaseURL}/v1/credits/overview`
- 聚合用户、会员、积分和 profile links。
- 不把 cookie、session id、远端原始响应泄露给 renderer。

未登录时：

- 返回 `200`，`user = null`、`membership = null`、`credits = null`。
- 这和现有 `/v1/account/user_info` 的 nullable user 语义一致，renderer 不需要把未登录当成错误。

远端失败时：

- 如果用户信息可读、积分失败，返回用户和会员信息，`credits = null`，并带一个可选的 `partial_error`。
- 如果 Commerce 全部失败，daemon 返回可恢复错误，desktop service 保留旧缓存。

安全和可靠性：

- Commerce 请求使用短超时，建议 5 秒以内。
- 限制响应体大小。
- 使用 daemon 的 HTTP client 注入，便于测试。
- 日志中不打印 cookie、session id、邮箱等敏感信息。

## Base URL 设计

新增或复用 durable runtime 配置：

| 配置                      | 默认值                          | 用途                       |
| ------------------------- | ------------------------------- | -------------------------- |
| `TUTTI_COMMERCE_BASE_URL` | `https://tutti.sh/api/commerce` | daemon 请求 Commerce API   |
| `TUTTI_WEB_BASE_URL`      | `https://tutti.sh`              | renderer 打开 profile 页面 |

Profile links 由 daemon 或 desktop service 使用 `new URL(path, base)` 生成：

```ts
const planUrl = new URL("/profile/plan", webBaseUrl).toString();
const usageUrl = new URL("/profile/usage", webBaseUrl).toString();
const settingsUrl = new URL("/profile/settings", webBaseUrl).toString();
```

对应入口：

- 会员：`https://tutti.sh/profile/plan`
- 积分余额：`https://tutti.sh/profile/usage`
- 账号中心：`https://tutti.sh/profile/settings`

如果新增 runtime/env override，需要同步更新对应 convention 文档。

## Desktop 集成设计

### Account service

扩展 `IAccountService`：

```ts
interface AccountStoreState {
  user: AccountUserInfo | null;
  productSummary: AccountProductSummary | null;
  productSummaryLoading: boolean;
  productSummaryError: string | null;
}

interface IAccountService {
  refreshUserInfo(): Promise<void>;
  refreshProductSummary(options?: { force?: boolean }): Promise<void>;
  startLogin(): Promise<void>;
  logout(): Promise<void>;
}
```

刷新策略：

- AgentGUI 挂载时可以读取一次缓存，但不强制远端刷新。
- 账号菜单每次打开时调用 `refreshProductSummary({ force: true })`。
- 同一时刻只允许一个 product summary 请求在飞。
- 可加 10 到 15 秒短 TTL，避免用户快速开关菜单导致重复请求。
- 登录完成后立即刷新 user info 和 product summary。
- 登出后清空 user、product summary、错误和 loading。

### AgentGUI props

在 `packages/agent/gui` 新增 host-supplied account menu 状态，不在 AgentGUI package 内请求网络：

```ts
interface AgentGUIAccountMenuState {
  user: AccountUserInfo | null;
  membershipLabel: string;
  creditsLabel: string | null;
  loading: boolean;
  error: string | null;
  links: {
    planUrl: string;
    usageUrl: string;
    settingsUrl: string;
  };
  onOpenChange(open: boolean): void;
  onLogin(): void;
  onLogout?(): void;
  onOpenExternal(url: string): void;
}
```

`DesktopAgentGUIWorkbenchBody` 负责：

- 从 `useAccountService()` 取账号状态。
- 把 product summary 映射成 AgentGUI 所需的 label 和 link。
- 在 `onOpenChange(true)` 调用 `accountService.refreshProductSummary({ force: true })`。
- 使用 `hostFilesApi.openExternal` 打开 profile links。

### AgentGUINodeView

新增一个 rail footer account trigger：

- 放在 provider rail 底部，视觉上类似截图中的头像 + username + tier。
- 不属于 provider filter，不改变当前选中的 provider。
- 宽度收窄时只展示头像和会员状态 tooltip。
- 使用现有设计 token、8px 以内 radius、lucide 图标。
- 所有 user-visible copy 走 AgentGUI i18n。

现有“环境检测 / usage & environment check”入口可以保留，但不应继续占用账号入口的位置。它更适合放在：

- provider scoped config menu 内；
- 或 account menu 的独立设置分组中，但点击仍打开现有 AgentGUI config panel。

## i18n

需要新增文案 key：

- `accountMenu.member`
- `accountMenu.upgrade`
- `accountMenu.creditsBalance`
- `accountMenu.accountCenter`
- `accountMenu.free`
- `accountMenu.signIn`
- `accountMenu.signOut`
- `accountMenu.loading`
- `accountMenu.unavailable`

任何用户可见文案都不能硬编码在 view 中。

## 测试计划

AgentGUI package：

- provider targets 单测：
  - 默认 target 不包含 `local:nexight`。
  - disabled placeholder 默认不包含 `nexight`。
  - 显式 `nexight` target 仍可创建。
- view 测试：
  - 默认 rail 只出现一个 `Tutti Agent`。
  - account trigger 能渲染头像、昵称、`Free`。
  - member summary 能渲染 `Lite / Pro / Ultra`。
  - 打开菜单会调用 `onOpenChange(true)`。

Desktop renderer：

- account service 测试：
  - `refreshProductSummary` single-flight。
  - 打开菜单强制刷新。
  - 失败时保留旧 product summary。
  - 登出清空 product summary。
  - profile links 使用 base URL 拼接。

Daemon：

- OpenAPI 生成结果检查。
- account product summary handler 测试：
  - 未登录返回 nullable summary。
  - 已登录时带 cookie 请求 Commerce。
  - Commerce user-info 和 credits-overview 映射正确。
  - Commerce 部分失败不泄露敏感信息。

建议验证命令：

```sh
pnpm check:i18n
pnpm --filter @tutti-os/agent-gui test
pnpm --filter @tutti-os/desktop typecheck
cd services/tuttid && go test ./...
```

## 实施顺序

1. 固化 provider rail 行为：默认不合成 `nexight`，补齐测试，避免两个 Tutti 入口回归。
2. 新增 daemon `account product_summary` contract 和 Commerce client 聚合。
3. 扩展 desktop `IAccountService`，实现 product summary 缓存、刷新和错误保留。
4. 给 AgentGUI package 增加 account menu props、i18n 和 view。
5. 在 `DesktopAgentGUIWorkbenchBody` 接线账号状态、菜单刷新、外链打开。
6. 跑 targeted checks，并根据新增 env override 更新 durable convention 文档。

## 决策

- `basic` 会员在 AgentGUI 中显示为 `Lite`，与 `tsh-web` 保持一致。
- 非会员展示 `Free`，不是空会员状态。
- 积分余额打开菜单时刷新，但菜单先打开；缓存优先，loading 非阻塞。
- AgentGUI package 不直接访问 Commerce，不持有 cookie。
- Profile 跳转使用 web base URL 拼接 path，不在 UI 中散落硬编码完整 URL。
