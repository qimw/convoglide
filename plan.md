# ConvoGlide 后续执行计划

这份计划只针对当前的 **ChatGPT Web** 公开 alpha 阶段，目标是把项目从“已经可用的实验性版本”继续推进到“更稳、更好装、更好验证、更像成熟开源项目”的状态。

## 一、范围说明

### 本计划明确要做

- 持续优化 ChatGPT 长对话性能
- 强化 benchmark、测试、CI、release 流程
- 优化非技术用户的安装和使用体验
- 继续打磨 README、安装文档、发布文档和 OSS 协作面

### 本计划明确不做

你已经明确说了第 6 项不做，所以这次先排除：

- `Gemini` 适配
- `Claude` 适配
- 通用多模型 adapter 架构

结论：

- **这轮只做 ChatGPT 这一条线**

## 二、当前项目状态

### 已完成

- 完成 `MilkGPT -> ConvoGlide` 的硬切换
- userscript 可安装
- extension 可侧载
- Optimization 1：首屏 payload trim 已完成
- Optimization 2：加载后 turn-level virtualization MVP 已完成
- Optimization 3：heavy block lazy activation MVP 已完成
- 已有真实长线程 benchmark
- 已有 benchmark lane / history / compare 工具
- 已有 CI、release asset workflow、基础测试
- README、中文 README、安装文档、benchmark 文档、架构文档、FAQ、贡献文档已建立

### 当前还没做完

- Optimization 2 还没调优到满意状态
- Optimization 3 还没调优到满意状态
- heap 表现还不够“漂亮”
- runtime 核心逻辑测试覆盖还不够
- release 资产虽然能打包，但“面向普通用户”的发布体验还没完全收口
- release checklist、store readiness checklist、可视化说明材料还要继续完善
- 文档虽然够用，但还没到“成熟开源项目首页”的最佳状态

### 刚完成的新进展

- 已补充 runtime 纯逻辑测试
- 已补充 release checklist 文档
- 已补充 browser store readiness checklist
- 已加入公开 runtime flow 示意图
- 已加入 docs consistency 与 alpha package verification 脚本
- 已完成一次带恢复交互改动后的 benchmark 回归确认
- 已补充 benchmark workflow 文档
- 已把 benchmark lane 加固为“空样本自动重试，空成功不落盘”
- 已做一轮 post-load 扫描调优，并完成回归 benchmark
- 已确认新的用户默认档位切到 `8` 更合适：它把当前 benchmark 对话压进了 `15 s` 以内，同时保住了长滚动 `smooth`
- 已补上合成长滚动测量：原始页面在滚动探测前就会失稳，优化后的 `8` 档和 `80` 档都能跑出 `smooth`
- 已补上用户视角对比指标：会话标题出现时间、主响应返回时间、主响应后的浏览器处理耗时
- 已新增重复 user-facing lane，可以直接算 plain vs optimized 的中位数结果
- 已让默认快开档位在当前 `n=2` 预实验中达到 `14.35 s` 的首次可见时间中位数，略快于原始页面的 `14.54 s`
- 已把默认 on-page badge 改成可选调试项，并把 post-load fallback 延后到 `30 s`，避免它们抢首屏路径
- 已补充用户视角可视化素材，README 里现在可以直接展示 repeated user-facing lane 结果
- 已完成首个真实 tagged alpha release 验证，`v0.1.0-alpha.1` 的 userscript 和 extension zip 下载都正常
- 已补充安装路径可视化素材，并完成 README 中“视觉材料”这一项 TODO
- 已确认主会话之外仍有两个很大的首屏辅助 payload：
  - `aip/connectors/list_accessible` 约 `1.13 MB`
  - `estuary/content` 约 `0.82 MB`
- 这说明下一轮首次可见时间优化，很可能要从辅助 app / connector surfaces 继续抠预算，而不只是继续压 conversation 树

## 三、总目标

这轮后续工作的总目标分成 4 个：

1. 让性能更强，而不是只是“功能上能跑”
2. 让性能结论更可验证、更可对比
3. 让不懂代码的用户也能更顺手地安装和使用
4. 让仓库在结构、文档、发布流程上更像长期维护的开源项目

### 当前明确的量化目标

为了避免“优化了很多”这种模糊说法，这轮后续工作按下面这些目标推进：

1. 公开主 benchmark 从 `n=2` 预实验升级到 `n=5`
2. 首次可见时间至少做到 **不慢于原始页面中位数**
3. 冷启动 **首次可见时间** 在正式 `n=5` benchmark 中稳住 **`<= 15 s`**
4. 冷启动 **首次可操作时间** 继续逼近 **`<= 16 s`**
5. 热重开 **首次可见时间** 继续逼近 **`<= 6 s`**
6. 标准化 **4 屏长滚动测试** 做到 **`5/5` 都是 `smooth`**
7. 默认档位的稳态 DOM 压到 **`<= 3.0k`**
8. 默认档位的稳态 heap 压到 **`<= 90 MB`**
9. `render gap` 压到 **`<= 1.5 s`**

## 四、工作流划分

后续工作按 4 条主线推进：

1. 性能调优
2. 测试与验证
3. 发布与分发
4. 文档与 OSS 门面打磨

---

## 五、主线 1：性能调优

这是当前最优先的主线。

### 5.1 Optimization 2 调优

当前状态：

- turn-level virtualization 已经有效
- 在真实长线程里 DOM 明显下降
- 但内存改善还不如 DOM 改善那么理想

接下来要做：

- 降低 snapshot 带来的 retained memory
- 降低滚动时的重复恢复 / 重复虚拟化开销
- 改善 placeholder 尺寸稳定性
- 尽量减少 layout thrash
- 优化 `Ctrl/Cmd + F` 搜索期间的暂停与恢复体验

本轮已额外完成：

- 后台标签页不再继续做无意义扫描
- heavy block 分类结果做了缓存
- benchmark lane 对空样本失败更敏感

验收标准：

- 首屏加载效果不倒退
- Iteration 2 / 3 的 steady-state DOM 不回升
- heap 在多次 benchmark 中更稳定
- 长线程滚动和搜索没有明显视觉破坏

预计工作量：

- 1 到 3 轮迭代

### 5.2 Optimization 3 调优

当前状态：

- 离屏 `pre`
- 离屏 `table`
- 图片 / 视频 / iframe lazy hints

这些已经有了，但仍然只是 MVP。

接下来要做：

- 调整哪些 `pre` 算重块
- 调整哪些 `table` 算重块
- 优化图片 / 视频 / iframe 的延迟策略
- 降低重块恢复时的闪烁
- 确保 heavy block deferral 不和 turn virtualization 打架

验收标准：

- 相比仅有 Iteration 2，steady DOM 持续更低
- 恢复时可读性不被明显破坏
- 媒体类内容在长线程中仍然可用

预计工作量：

- 1 到 2 轮迭代

### 5.3 性能结果同步规则

每次性能迭代必须同步更新：

- `README.md`
- `README.zh-CN.md`
- `docs/benchmarks.md`
- `CHANGELOG.md`

规则：

- 没有 benchmark 结果，就不写“优化成功”

---

## 六、主线 2：测试与验证

这条线现在已经开始了，但覆盖还偏薄。

### 6.1 补纯逻辑测试

要补的测试：

- payload trim 逻辑
- active branch / keep-limit 边界
- benchmark compare 工具
- 打包 / 生成产物的核心约束

验收标准：

- 核心纯逻辑不再只靠人工验证

### 6.2 补 runtime 行为测试

要补的测试：

- heavy block 判定
- placeholder 创建条件
- virtualized turn 恢复行为
- heavy placeholder 恢复行为

验收标准：

- runtime 关键分支有自动测试兜底

### 6.3 CI 强化

现在已有：

- build
- syntax
- package
- test
- 命名清洁度检查

接下来可继续补：

- 对生成产物的更细约束检查
- 对 README / benchmark 文档一致性的简单守护
- 让 release 前校验更明确

验收标准：

- 明显错误尽量在 CI 阶段就能拦住

预计工作量：

- 1 到 2 天

---

## 七、主线 3：发布与分发

### 7.1 首个真实 tagged release 验证

当前状态：

- 已有 tag 触发的 GitHub Release asset workflow
- 已经完成过一遍真实 alpha tag 发布验证

接下来要做：

- 持续确保 release note、userscript、extension zip 在后续版本里都正常产出
- 保持 release checklist 与当前流程同步

验收标准：

- 后续 tagged alpha release 仍然稳定可复现

### 7.2 面向普通用户的分发体验优化

当前状态：

- userscript 已可直接安装
- extension zip 已可打包

接下来要做：

- 优化 extension 安装文案
- 确认 release 资产下载后用户能直接用
- 用普通用户视角检查 manifest / 权限说明是否够清晰

验收标准：

- 一个不看源码的用户也能完成安装

### 7.3 浏览器商店准备度检查

这轮不承诺立即上架，但要先把阻塞点看清楚。

接下来要做：

- 梳理 Chrome Web Store / Edge Add-ons 需要的最小材料
- 检查权限面是否足够克制
- 提前列出 store blocker

验收标准：

- 有一份简短的 store readiness checklist

预计工作量：

- 0.5 到 1.5 天

---

## 八、主线 4：文档与 OSS 门面打磨

### 8.1 README 继续优化

当前状态：

- README 已经能支撑公开 alpha

接下来要做：

- 继续优化 release / install 引导
- 增加 1 到 2 个视觉材料
  - 截图
  - 简短 GIF
- 持续保持 TODO、路线图、benchmark 摘要同步

验收标准：

- 新用户打开首页后，能快速理解项目、安装方式和效果

### 8.2 文档细节继续优化

接下来要做：

- 安装文案继续面向非技术用户收口
- 补 maintainer release checklist
- 补 benchmark workflow 说明

验收标准：

- 新贡献者不需要私下问一堆问题，就能跑通核心工作流

### 8.3 本地化扩展

当前状态：

- 英文 README
- 中文 README

这一项优先级较低：

- 先等核心文档稳定，再决定是否补更多语言

预计工作量：

- 0.5 到 1 天

---

## 九、建议执行顺序

### Phase A：性能优先

- Optimization 2 调优
- Optimization 3 调优
- 每轮都更新 benchmark

### Phase B：测试补强

- 补 payload trim / heavy block / restore 测试
- 继续强化 CI

### Phase C：发布验证

- 做首个真实 tagged alpha release
- 检查 release assets 下载体验

### Phase D：文档收口

- README 和安装文档继续打磨
- 补截图 / GIF
- 补 store readiness checklist

---

## 十、下一版 public alpha 的完成标准

我建议把“下一版更强的 public alpha”定义成下面这样：

- post-load memory 行为明显比当前更稳定
- benchmark history / compare 流程稳定可用
- 成功跑通一遍真实 tagged release
- 非技术用户安装路径更顺手
- 核心 runtime 逻辑不再只靠人工测试

---

## 十一、粗略时间预估

如果继续保持现在这个范围，只做 ChatGPT：

- Phase A：1 到 3 天
- Phase B：1 到 2 天
- Phase C：0.5 到 1 天
- Phase D：0.5 到 1 天

总计：

- 大约 **3 到 7 个工作日**

---

## 十二、这份计划的非目标

为了避免发散，这份计划明确不包含：

- Gemini 支持
- Claude 支持
- 通用多模型 adapter
- 把浏览器商店上线当作这一轮硬性要求
- 各种增长、营销、埋点类功能


## 附：插件边界与实现原则

为了避免后续优化再次发散，这里把项目边界写死：

- 我们做的是**浏览器侧渐进式渲染层**，不是服务端分页系统
- 能优化的是：响应拦截、主线重建、首屏小窗口、离屏虚拟化、重内容延迟激活、渐进恢复
- 不能优化的是：让 OpenAI 服务端只返回首屏数据，或替换 ChatGPT 官方前端的完整状态管理
- 因此后续实现优先级固定为：
  1. 首次可见
  2. 首次可操作
  3. 4 屏长滚动
  4. 历史与重内容的渐进恢复
