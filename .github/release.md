<!-- Owner: .github/workflows/release.yml, .github/workflows/ci.yml -->
# CI 与发布

CI 在 push、PR 和手动运行时执行测试、类型检查、WebUI 构建、扩展检查与打包审计。工作流使用 Node.js 24 和 package.json 声明的 pnpm 版本；扩展检查使用 release.yml 中 CORTICO_REF 指定的 Core，类型检查和构建使用包内的 Cortico 开发依赖。

## 版本 PR

从 main 手动运行 Release，选择 patch、minor 或 major。工作流增加包版本，运行检查，创建 release/v<版本> 分支和版本 PR，并显式触发该分支的 CI。合并前在 CHANGELOG.md 中补充该版本说明。

main 要求通过 Validate、分支与 main 同步、通过 PR 合并并解决讨论；管理员也适用。允许独立维护者在无额外审批的情况下合并。v* 标签创建后不能修改或删除。合并后的分支自动删除。

Actions 默认权限为只读；Release job 单独申请 contents、pull-requests、actions 和 id-token 写权限。仓库允许 Actions 创建 PR。

## 发布

版本 PR 合并后，从 main 运行 Release 并选择 publish。工作流检查和打包当前提交，创建 v<版本> 标签，通过 npm Trusted Publishing 发布，再根据 CHANGELOG.md 创建 GitHub Release 并附上安装包。

已有标签须指向当前提交。npm 已发布但工作流未完成核验时，选择 finish；它核对版本、latest 与重建安装包的 integrity，随后创建 GitHub Release，不重复发布 npm。

npm 包的 Trusted Publisher 配置：

| 字段 | 值 |
| --- | --- |
| Organization or user | DTMosken |
| Repository | cortico-provider-deepseek |
| Workflow filename | release.yml |
| Environment name | 留空 |
| Allowed actions | npm publish |

该绑定在 npm 包设置页配置，GitHub 工作流本身不会创建它。工作流不使用 NPM_TOKEN。

本地部署使用此源码目录时，在隔离副本中构建 WebUI。
