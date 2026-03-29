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
- 首个真实 tagged release 还没走完验证
- release 资产虽然能打包，但“面向普通用户”的发布体验还没完全收口
- 文档虽然够用，但还没到“成熟开源项目首页”的最佳状态

## 三、总目标

这轮后续工作的总目标分成 4 个：

1. 让性能更强，而不是只是“功能上能跑”
2. 让性能结论更可验证、更可对比
3. 让不懂代码的用户也能更顺手地安装和使用
4. 让仓库在结构、文档、发布流程上更像长期维护的开源项目

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
- 但还没真正走过一遍完整发布

接下来要做：

- 打一个真实 alpha tag
- 确认 release note 自动生成正常
- 确认 `convoglide.user.js` 正常上传
- 确认 `convoglide-extension.zip` 正常上传
- 补 release checklist

验收标准：

- 成功完成 1 次真实 tagged alpha release

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

- 首个 tagged release 完成后补 release / install 引导
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
