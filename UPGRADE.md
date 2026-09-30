# 升级说明 · Upgrade notes

## 这是什么

本包是 `dsh-plugin-whale-pet` 的分支：行为一致，角色换成鲸鱼女仆。请把它当作**一个独立的新插件**，而不是原来鲸鱼插件的原地升级。

## 与原插件共存

两个插件的注册名不同，可以同时安装：

| | 原插件 | 本包 |
| --- | --- | --- |
| 包名 | `dsh-plugin-whale-pet` | `dsh-plugin-whale-maid` |
| 配置条目 ID | `whale-pet` | `whale-maid` |
| Host 服务 / Remote 命名空间 | `whalePet` | `whaleMaid` |
| 浏览器本地偏好键 | `dsh-plugin-whale-pet:v1` | `dsh-plugin-whale-maid:v1` |

命名空间与偏好键都不同，两个角色各自保留位置、大小和设置。只想留一个时，在 DSH 插件管理器里停用或卸载另一个即可。

## 迁移旧的条目覆盖配置

DSH 按条目 ID 匹配用户覆盖配置。`tools/entry-id-migration.mjs` 只规划本包历史 ID（`dsh-plugin-whale-maid`、`whalePet`）到 `whale-maid` 的改名，不会动其它配置：

```js
import { planEntryIdMigration } from './tools/entry-id-migration.mjs';
const updated = planEntryIdMigration(profilePatchRows); // 请人工确认后再应用
```

当已经存在新 ID 的行、旧行指向了别的模块名、或旧 ID 出现在分组插入里时，它会拒绝猜测并要求人工处理。本包在安装时**不会**改动你的任何配置文件。

## 更新已安装的本包

1. 等待正在运行的任务结束。
2. 完全退出 DSH（只关窗口可能不会退出应用）。
3. 安装新包（或替换目录），重新打开 DSH。

只要偏好键不变，浏览器本地设置会保留。
