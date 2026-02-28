---
title: IRC
description: 将 OpenClaw 连接到 IRC 频道和私聊。
summary: "IRC 插件设置、访问控制和故障排除"
read_when:
  - 你想将 OpenClaw 连接到 IRC 频道或私聊
  - 你正在配置 IRC 白名单、群组策略或提及门控
---

当你想让 OpenClaw 进入经典频道（`#room`）和私聊时使用 IRC。
IRC 作为扩展插件提供，但在主配置中的 `channels.irc` 下配置。

## 快速开始

1. 在 `~/.openclaw/openclaw.json` 中启用 IRC 配置。
2. 至少设置：

```json
{
  "channels": {
    "irc": {
      "enabled": true,
      "host": "irc.libera.chat",
      "port": 6697,
      "tls": true,
      "nick": "openclaw-bot",
      "channels": ["#openclaw"]
    }
  }
}
```

3. 启动/重启网关：

```bash
openclaw gateway run
```

## 安全默认值

- `channels.irc.dmPolicy` 默认为 `"pairing"`。
- `channels.irc.groupPolicy` 默认为 `"allowlist"`。
- 使用 `groupPolicy="allowlist"` 时，设置 `channels.irc.groups` 定义允许的频道。
- 除非你有意接受明文传输，否则使用 TLS (`channels.irc.tls=true`)。

## 访问控制

IRC 频道有两个独立的"门"：

1. **频道访问** (`groupPolicy` + `groups`): 机器人是否接受来自该频道的消息。
2. **发送者访问** (`groupAllowFrom` / 每频道 `groups["#channel"].allowFrom`): 谁被允许在该频道内触发机器人。

配置键：

- 私聊白名单（私聊发送者访问）: `channels.irc.allowFrom`
- 群组发送者白名单（频道发送者访问）: `channels.irc.groupAllowFrom`
- 每频道控制（频道 + 发送者 + 提及规则）: `channels.irc.groups["#channel"]`
- `channels.irc.groupPolicy="open"` 允许未配置的频道（**默认仍提及门控**）

白名单条目应使用稳定的发送者身份 (`nick!user@host`)。
只有设置了 `channels.irc.dangerouslyAllowNameMatching: true` 时才启用裸昵称匹配（可变）。

### 常见问题: `allowFrom` 是用于私聊，不是频道

如果你看到类似日志：

- `irc: drop group sender alice!ident@host (policy=allowlist)`

…这意味着发送者不被允许发送**群组/频道**消息。通过以下方式修复：

- 设置 `channels.irc.groupAllowFrom`（所有频道的全局设置），或
- 设置每频道发送者白名单: `channels.irc.groups["#channel"].allowFrom`

示例（允许 `#tuirc-dev` 中的任何人跟机器人对话）：

```json5
{
  channels: {
    irc: {
      groupPolicy: "allowlist",
      groups: {
        "#tuirc-dev": { allowFrom: ["*"] },
      },
    },
  },
}
```

## 回复触发（提及）

即使频道被允许（通过 `groupPolicy` + `groups`）且发送者被允许，OpenClaw 在群组上下文中默认**提及门控**。

这意味着你可能会看到类似 `drop channel … (missing-mention)` 的日志，除非消息包含匹配机器人的提及模式。

要让机器人在 IRC 频道中**无需提及**就回复，禁用该频道的提及门控：

```json5
{
  channels: {
    irc: {
      groupPolicy: "allowlist",
      groups: {
        "#tuirc-dev": {
          requireMention: false,
          allowFrom: ["*"],
        },
      },
    },
  },
}
```

或者允许**所有** IRC 频道（无需每频道白名单）且仍然无需提及就回复：

```json5
{
  channels: {
    irc: {
      groupPolicy: "open",
      groups: {
        "*": { requireMention: false, allowFrom: ["*"] },
      },
    },
  },
}
```

## 安全说明（公共频道推荐）

如果你在公共频道允许 `allowFrom: ["*"]`，任何人都可以提示机器人。
为降低风险，限制该频道的工具。

### 频道内所有人使用相同工具

```json5
{
  channels: {
    irc: {
      groups: {
        "#tuirc-dev": {
          allowFrom: ["*"],
          tools: {
            deny: ["group:runtime", "group:fs", "gateway", "nodes", "cron", "browser"],
          },
        },
      },
    },
  },
}
```

### 不同发送者使用不同工具（所有者拥有更多权限）

使用 `toolsBySender` 对 `"*"` 应用更严格的策略，对你的昵称应用更宽松的策略：

```json5
{
  channels: {
    irc: {
      groups: {
        "#tuirc-dev": {
          allowFrom: ["*"],
          toolsBySender: {
            "*": {
              deny: ["group:runtime", "group:fs", "gateway", "nodes", "cron", "browser"],
            },
            "id:eigen": {
              deny: ["gateway", "nodes", "cron"],
            },
          },
        },
      },
    },
  },
}
```

说明：

- `toolsBySender` 键应使用 `id:` 表示 IRC 发送者身份值：
  `id:eigen` 或 `id:eigen!~eigen@174.127.248.171` 用于更强的匹配。
- 遗留的无前缀键仍被接受并仅作为 `id:` 匹配。
- 第一个匹配的发送者策略获胜；`"*"` 是通配符回退。

有关群组访问与提及门控的更多信息（以及它们如何交互），请参阅：[/channels/groups](/channels/groups)。

## NickServ

要在连接后向 NickServ 认证：

```json
{
  "channels": {
    "irc": {
      "nickserv": {
        "enabled": true,
        "service": "NickServ",
        "password": "your-nickserv-password"
      }
    }
  }
}
```

可选的连接时一次性注册：

```json
{
  "channels": {
    "irc": {
      "nickserv": {
        "register": true,
        "registerEmail": "bot@example.com"
      }
    }
  }
}
```

昵称注册后禁用 `register` 以避免重复的 REGISTER 尝试。

## 环境变量

默认账户支持：

- `IRC_HOST`
- `IRC_PORT`
- `IRC_TLS`
- `IRC_NICK`
- `IRC_USERNAME`
- `IRC_REALNAME`
- `IRC_PASSWORD`
- `IRC_CHANNELS` (逗号分隔)
- `IRC_NICKSERV_PASSWORD`
- `IRC_NICKSERV_REGISTER_EMAIL`

## 故障排除

- 如果机器人已连接但从不回复频道消息，验证 `channels.irc.groups` **以及** 提及门控是否正在丢弃消息 (`missing-mention`)。如果你想让它无需 ping 就回复，为该频道设置 `requireMention:false`。
- 如果登录失败，验证昵称可用性和服务器密码。
- 如果在自定义网络上 TLS 失败，验证主机/端口和证书设置。
