---
summary: "`openclaw secrets` CLI 参考（重新加载、审计、配置、应用）"
read_when:
  - 运行时重新解析 secret 引用
  - 审计明文残留和未解析的引用
  - 配置 SecretRef 并应用单向清理变更
title: "secrets"
---

# `openclaw secrets`

使用 `openclaw secrets` 将凭据从明文迁移到 SecretRef，并保持活动 secrets 运行时健康。

命令角色：

- `reload`: Gateway RPC (`secrets.reload`)，仅在完全成功时重新解析引用并交换运行时快照（不写入配置）。
- `audit`: 对配置 + 认证存储 + 遗留残留（`.env`, `auth.json`）进行只读扫描，查找明文、未解析的引用和优先级漂移。
- `configure`: 用于提供商设置 + 目标映射 + 预检的交互式规划器（需要 TTY）。
- `apply`: 执行已保存的计划（`--dry-run` 仅用于验证），然后清理已迁移的明文残留。

推荐的操作循环：

```bash
openclaw secrets audit --check
openclaw secrets configure
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json
openclaw secrets audit --check
openclaw secrets reload
```

CI/门禁的退出码说明：

- `audit --check` 在发现问题时返回 `1`，在引用未解析时返回 `2`。

相关：

- Secrets 指南：[Secrets Management](/gateway/secrets)
- 安全指南：[Security](/gateway/security)

## 重新加载运行时快照

重新解析 secret 引用并原子性地交换运行时快照。

```bash
openclaw secrets reload
openclaw secrets reload --json
```

说明：

- 使用 Gateway RPC 方法 `secrets.reload`。
- 如果解析失败，Gateway 会保留最后已知的良好快照并返回错误（不会部分激活）。
- JSON 响应包含 `warningCount`。

## 审计

扫描 OpenClaw 状态以查找：

- 明文 secret 存储
- 未解析的引用
- 优先级漂移（`auth-profiles` 遮蔽配置引用）
- 遗留残留（`auth.json`, OAuth 超出范围说明）

```bash
openclaw secrets audit
openclaw secrets audit --check
openclaw secrets audit --json
```

退出行为：

- `--check` 在发现问题时以非零值退出。
- 未解析的引用以更高优先级的非零代码退出。

报告形状亮点：

- `status`: `clean | findings | unresolved`
- `summary`: `plaintextCount`, `unresolvedRefCount`, `shadowedRefCount`, `legacyResidueCount`
- 发现代码：
  - `PLAINTEXT_FOUND`
  - `REF_UNRESOLVED`
  - `REF_SHADOWED`
  - `LEGACY_RESIDUE`

## 配置（交互式助手）

交互式构建提供商 + SecretRef 变更，运行预检，并可选应用：

```bash
openclaw secrets configure
openclaw secrets configure --plan-out /tmp/openclaw-secrets-plan.json
openclaw secrets configure --apply --yes
openclaw secrets configure --providers-only
openclaw secrets configure --skip-provider-setup
openclaw secrets configure --json
```

流程：

- 首先是提供商设置（`add/edit/remove` `secrets.providers` 别名）。
- 其次是凭据映射（选择字段并分配 `{source, provider, id}` 引用）。
- 最后是预检和可选应用。

标志：

- `--providers-only`: 仅配置 `secrets.providers`，跳过凭据映射。
- `--skip-provider-setup`: 跳过提供商设置，将凭据映射到现有提供商。

说明：

- 需要交互式 TTY。
- 不能将 `--providers-only` 与 `--skip-provider-setup` 组合使用。
- `configure` 目标是 `openclaw.json` 中包含 secret 的字段。
- 包含你打算迁移的所有包含 secret 的字段（例如 `models.providers.*.apiKey` 和 `skills.entries.*.apiKey`），以便审计可以达到干净状态。
- 它在应用之前执行预检解析。
- 生成的计划默认启用清理选项（`scrubEnv`, `scrubAuthProfilesForProviderTargets`, `scrubLegacyAuthJson` 全部启用）。
- 应用路径对于已迁移的明文值是单向的。
- 没有 `--apply` 时，CLI 仍会在预检后提示 `Apply this plan now?`。
- 使用 `--apply`（但没有 `--yes`）时，CLI 会提示额外的不可逆迁移确认。

Exec 提供商安全说明：

- Homebrew 安装通常会在 `/opt/homebrew/bin/*` 下暴露符号链接二进制文件。
- 仅在需要时设置 `allowSymlinkCommand: true` 用于受信任的包管理器路径，并与 `trustedDirs` 配对使用（例如 `["/opt/homebrew"]`）。

## 应用已保存的计划

应用或预检之前生成的计划：

```bash
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --json
```

计划合约详情（允许的目标路径、验证规则和失败语义）：

- [Secrets Apply Plan Contract](/gateway/secrets-plan-contract)

`apply` 可能更新的内容：

- `openclaw.json` (SecretRef 目标 + 提供商 增/删)
- `auth-profiles.json` (提供商目标清理)
- 遗留 `auth.json` 残留
- `~/.openclaw/.env` 已知 secret 密钥（其值已迁移）

## 为什么没有回滚备份

`secrets apply` 故意不写入包含旧明文值的回滚备份。

安全性来自严格的预检 + 原子化应用，以及在失败时尽力恢复内存。

## 示例

```bash
# 先审计，然后配置，然后确认干净：
openclaw secrets audit --check
openclaw secrets configure
openclaw secrets audit --check
```

如果在部分迁移后 `audit --check` 仍然报告明文发现，请验证你是否也迁移了技能密钥（`skills.entries.*.apiKey`）和任何其他报告的目标路径。
