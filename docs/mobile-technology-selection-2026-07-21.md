# BulkDesk 移动端技术选型（2026-07-21）

## 1. 结论

**推荐调整为：优先以 `react-native@0.82.1 + @react-native-oh/react-native-harmony@0.82.30` 完成三端 POC；这是截至 2026-07-21 可从 npm 获取且 peer dependency 精确匹配的最新 RNOH 稳定组合。只有关键插件在目标鸿蒙真机全部通过，才将其锁定为一期正式技术栈。**

选择依据如下：

- 一期必须同时交付 iOS、Android 与鸿蒙，且包含扫码、拍照上传、离线草稿、二维码和双工作台；鸿蒙并不是可在上线前再补的次要目标。
- React Native `0.82` 是首个完全运行在新架构上的版本，并带来 React 19.1.1、Hermes V1（实验性）和 DOM Node API 支持；对新项目而言，其架构边界和性能演进路径比旧版 React Native 更清晰。
- 现有 Web 后台采用 React 19 + TypeScript。虽然 Ant Design Pro 页面、Umi 路由和 Web 组件不能直接迁移到原生 App，但 Hooks、服务层组织、状态模型、React Query 使用方式、DTO 和测试习惯可直接延续，降低移动端团队切换成本。
- RNOH 当前稳定包为 `@react-native-oh/react-native-harmony@0.82.30`，其 peer dependency 为 `react-native@0.82.1`；之前以 `0.72.5` 为依据的结论已过时。`0.84.x` 仍是预览/适配线，不能取代稳定 POC 基线；但“RNOH 核心可构建”不等于扫码、相机、加密存储、推送等全部原生库都已兼容，仍须用目标版本逐项验收。
- 上游 React Native 有 `0.83.10` 稳定线，但 RNOH npm 没有发布任何 `0.83.x` 包，不能将 `react-native@0.83.10` 与 RNOH 组合为三端基线。RNOH 的下一条可安装线是 `0.84.2`，其 npm dist-tag 为 `0.84-rc` 且 peer dependency 为 `react-native@0.84.1`，因此只能作为独立的前瞻性对照 POC，不能替代稳定基线。
- 批发业务一期以商品列表、订单、库存、扫码和表单为主，不以重度自绘、复杂动画或 3D 图形为核心；RN 的原生组件路径和现有 React 能力更符合这一范围。

**不建议把现有 Umi 管理后台直接封装成 WebView / PWA 容器作为正式 App。** 这不能稳妥满足原生扫码、相机、离线、通知以及鸿蒙应用分发的体验和维护要求，最多可作为接口联调或早期原型。

## 2. 前置事实与边界

### 2.1 已有系统条件

- 后端为 FastAPI，业务接口统一位于 `/api/v1`，使用 Bearer access token + refresh token；通用响应是 `{ code, message, data }`。
- 当前 Web 端使用 React 19、TypeScript、Umi Max 4、Ant Design 6；移动端应独立建工程，不与 `frontend/` 共用构建链路或 UI 组件。
- `移动端记录.md` 已定义一个 App 内的客户与商家两套隔离工作台，并明确一期需要商品浏览、购物车、订单、库存、扫码、拍照凭证、离线草稿和多角色切换。
- 客户自助商品目录、客户身份映射、自助下单、临时下单二维码及移动消息等服务端能力仍是后续补充项。因此，客户端选型不等于可立即开始全量业务开发；这些 API 契约必须先落实。

### 2.2 一期不可妥协的技术验收项

| 项目 | 必须验证的行为 |
| --- | --- |
| 三端构建 | 同一业务代码可产出 iOS、Android、HarmonyOS 安装包，并可在真机完成登录与接口调用。 |
| 扫码 | 商家端可持续扫码；游客临时下单二维码可被解析，失败时显示可恢复的提示。 |
| 相机/上传 | 可拍摄付款凭证、压缩并上传，失败后允许重试且不丢失草稿。 |
| 本地数据 | 购物车、游客临时订单、离线草稿和令牌安全存储；身份切换清除另一工作台的敏感缓存。 |
| 权限 | 相机、相册、通知等权限按需申请，拒绝权限后仍能完成非依赖功能。 |
| 性能 | 中端 Android、iPhone 和目标鸿蒙真机上，商品列表滚动、库存查询、扫码返回页面均无明显卡顿。 |

## 3. 候选方案

评分为针对 BulkDesk 一期的相对判断：5 为最有利，1 为风险最高；不是框架通用排名。

| 方案 | 技术构成 | iOS / Android | 鸿蒙 | 现有团队复用 | 硬件与离线能力 | 三端交付风险 | 总评 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| A（条件推荐） | RN `0.82.1` + RNOH `0.82.30` | 5 | 4 | 5 | 3 | 3 | 当前 RNOH 稳定组合；React 复用与新架构优势明显，以关键插件 POC 作为上线前置条件。 |
| B | `uni-app x` + Vue 3 + TypeScript + UTS | 4 | 5 | 2 | 4 | 4 | 鸿蒙交付确定性高，但需要引入 Vue/UTS 体系。 |
| C | Flutter + OpenHarmony Flutter 分支 | 5 | 3 | 2 | 3 | 3 | UI 一致性好，需引入 Dart，鸿蒙插件与 SDK 版本风险较高。 |
| D | SwiftUI + Kotlin/Compose + ArkUI 三套原生客户端 | 5 | 5 | 1 | 5 | 2 | 平台风险最低、研发成本和长期维护成本最高，仅适合强原生投入。 |

### A. RN `0.82.1` + RNOH `0.82.30`：条件推荐路线

**形态**

- 新建独立的 `mobile/` 项目，使用 React Native、TypeScript、React Navigation、TanStack Query 与轻量本地状态方案。
- 页面、路由、请求、工作台缓存按客户/商家工作台隔离；请求层实现统一 token 刷新、错误映射、幂等键和文件上传。
- iOS、Android 使用 `react-native@0.82.1`，鸿蒙使用其精确匹配的 `@react-native-oh/react-native-harmony@0.82.30`；任何版本升级均按三端 POC 和回归结果执行。
- 将扫码、相机、相册、文件、通知和安全存储封装为内部 `platform` 接口；业务页面不得直接散落依赖第三方原生库。

**优势**

- React、TypeScript、Hooks、React Query 与现有前端团队的实践一致；能复用开发规范和大量非 UI 的类型、请求、状态设计。
- `0.82` 已完全采用新架构，减少旧架构/新架构并存期的迁移负担，并能直接采用新版 React 的能力。
- iOS、Android 的 React Native 生态成熟；对于 BulkDesk 的表单、列表、订单状态和库存查询，原生组件方案足够且不需要重建一套 Vue/UTS 技术体系。

**代价与控制措施**

- RNOH 不是 React Native 主发行版的常规第三目标，依赖库是否有鸿蒙实现必须逐个维护兼容矩阵。
- 当前公开的鸿蒙 `react-native-vision-camera` 使用文档仍以 RNOH `0.77` 为示例，不能据此推断其在 `0.82.30` / RN `0.82.1` 组合上已稳定支持；扫码与相机是本项目的硬性 POC 阻塞项。
- 不以 Expo 托管工作流作为鸿蒙发布基础；按 bare React Native / RNOH 工程治理，并为必须补齐的 ArkTS 能力预留自研桥接路径。
- 商家端长列表和库存表单应优先采用移动信息架构，不把 Ant Design Pro 桌面表格逐页搬到手机。

**适用条件**：目标鸿蒙设备上的扫码、拍照上传、安全存储和发布链路全部通过 POC；团队可以维护一个小而明确的 ArkTS 原生适配层。

### B. `uni-app x`：鸿蒙确定性备选路线

**形态**

- 新建独立的 `mobile/` 项目，使用 Vue 3、TypeScript 和 Pinia（或项目约定的等价状态方案）。
- 将扫码、相机、文件、加密存储和通知定义为 TypeScript 平台适配层；所有第三方原生库必须记录 iOS、Android、HarmonyOS 三端支持矩阵。
- 使用 UTS 封装必须调用的原生能力，业务页面只依赖内部 `platform` 接口。

**优势**

- DCloud 的 `uni-app x` 文档将 Android、iOS、HarmonyOS 列为 App 目标，并提供原生插件能力；三端路径更集中。
- 适合国内业务 App 常见的相机、相册、扫码、文件上传、推送和本地存储需求。

**主要风险**

- 团队需要学习 Vue 3、uni-app x 生命周期和 UTS，不能直接使用既有 React 组件和 Hook 生态。
- 若 POC 表明 RN `0.82.1` + RNOH `0.82.30` 的扫码或相机链路不稳定，`uni-app x` 是优先的回退路线，而不是在业务开发中临时更换框架。

**适用条件**：鸿蒙上线确定性高于 React 技术栈延续，或 RN 关键插件 POC 未能通过。

### C. Flutter + OpenHarmony Flutter 分支：渲染一致性路线

**形态**

- 采用 Flutter/Dart 编写页面和领域逻辑；iOS、Android 使用 Flutter 官方稳定 SDK；鸿蒙通过 OpenHarmony SIG 的 Flutter 引擎/SDK 分支构建。
- 将摄像头、二维码、相册、文件和通知统一封装成 Dart 接口，并为鸿蒙实现单独的原生桥接与真机测试。

**优势**

- Flutter 的自绘 UI 能带来较强的跨 iOS/Android 一致性，复杂页面和滚动性能的控制力较好。
- 大型社区和成熟的 iOS/Android 生态，适合后续需要高度定制视觉体验的客户侧应用。

**主要风险**

- Flutter 官方文档的常规移动目标仍是 iOS/Android；鸿蒙依赖 OpenHarmony SIG 移植。调研时鸿蒙分支标识为 `3.22.0-harmony`，与 Flutter 官方稳定线存在版本差异。
- 任何含平台通道的插件都可能需要鸿蒙补齐或自行维护，尤其是扫码、推送、支付（如后续纳入）和崩溃监控。
- 现有团队需要引入 Dart、Flutter 状态管理、原生桥接和构建发布经验，无法直接复用 React 组件。

**适用条件**：团队已有 Flutter 能力，且客户侧将演进为更重的定制 UI；否则其鸿蒙适配投入不优于方案 A。

### D. 三套原生客户端：确定性优先的保底路线

**形态**

- iOS 使用 Swift / SwiftUI，Android 使用 Kotlin / Jetpack Compose，鸿蒙使用 ArkTS / ArkUI。
- 通过 OpenAPI 描述、统一错误码和测试用例维持 API 一致性；不假设 UI 或状态代码可跨端复用。

**优势**

- 相机、扫码、后台任务、安全存储、推送与系统权限全部使用各端官方 API；鸿蒙原生能力与发布链路最可控。
- 适合未来有大量离线库存作业、蓝牙外设、标签打印、工业扫码枪或强后台任务等深度硬件需求的场景。

**代价**

- 需要三套 UI、状态、测试和发布流水线；功能一致性靠严格的产品验收与接口契约保证。
- 研发和维护成本通常显著高于跨端方案，不符合当前“一个跨端 App”的产品目标。

**适用条件**：移动端被提升为核心生产力工具，且公司能长期投入三端原生团队；否则不建议一期采用。

## 4. 推荐架构（方案 A：RN `0.82.1` + RNOH `0.82.30`）

```text
mobile/
  src/
    app/                 # 启动、会话恢复、全局错误处理
    api/                 # HTTP 客户端、DTO、OpenAPI 生成结果或人工封装
    auth/                # token、角色、身份切换、权限守卫
    workspaces/
      customer/          # 客户首页、购物车、订单、我的
      merchant/          # 工作台、订单、库存、我的
    platform/            # scanner/camera/storage/file/notification 的抽象
    storage/             # 按 workspace + account 分区的本地数据
    shared/              # 纯业务组件、格式化、错误映射
```

关键规则：

1. `workspace`（`customer` / `merchant`）是路由、状态和缓存分区键的一部分；切换身份时销毁另一工作台的导航栈、查询缓存和敏感草稿。
2. 价格、可售库存、订单状态转换和权限只由后端决定；移动端仅展示服务端结果并处理可恢复错误。
3. 离线仅保存“草稿/待同步操作”，不能在本地确认库存、价格或订单状态。恢复联网后重新读取服务端事实并执行幂等提交。
4. 扫码和拍照都经 `platform` 适配层调用，禁止业务页面依赖具体插件，以便在三端补齐差异。
5. access token、refresh token 和用户敏感标识必须使用系统安全存储；购物车与游客临时订单按设备与工作台分区，并提供清除入口。

## 5. 选择后的 POC 门槛

在正式建业务页面前，先用 **10 个工作日左右** 完成一个三端 POC。只有下列项目均通过，才确认框架版本并启动一期开发：

| 验收项 | 通过标准 |
| --- | --- |
| 三端构建与安装 | iOS 真机、Android 中端真机、目标鸿蒙真机均可稳定安装、升级和启动。 |
| 插件兼容矩阵 | 锁定 `react-native@0.82.1` 与 `@react-native-oh/react-native-harmony@0.82.30`；为扫码、相机、图片压缩、文件、加密存储、权限和通知逐项记录包版本、鸿蒙实现、真机结果与维护责任人。 |
| 鉴权 | 登录、401 刷新、刷新失败退出、客户/商家身份切换和缓存清理均可复现。 |
| 扫码 | 连续扫码 30 次，能解析现有临时订单二维码；取消和异常路径不崩溃。 |
| 拍照上传 | 拍照、从相册选择、压缩、`multipart/form-data` 上传和失败重试均成功。 |
| 本地草稿 | 断网创建购物车/草稿，重启后仍在；恢复网络后按幂等键同步且不重复创建。 |
| 列表体验 | 目标设备上 200 条本地模拟商品滚动、搜索、图片加载和返回操作可用，无明显掉帧。 |
| 发布可行性 | 三端签名、隐私清单、相机权限声明、商店/企业分发流程有可执行脚本与责任人。 |

任一项失败时，先判断是插件、框架版本还是业务接口契约问题；如果鸿蒙的扫码/相机/安全存储无法稳定闭环，方案 A 不应硬推进，应转入方案 B，而不是在业务开发中继续赌插件兼容性。

## 6. 实施顺序建议

1. **补齐后端契约**：先定义客户登录/身份映射、客户商品目录、客户下单、临时单二维码、商家扫码转单和移动消息接口；将权限、库存和幂等规则写入 OpenAPI 与后端测试。
2. **完成三端 POC**：固定框架、IDE、SDK、插件和最低系统版本，产出真机验收记录。
3. **搭建 App 基座**：实现请求层、认证、工作台隔离、错误处理、监控和安全存储，不先堆业务页面。
4. **客户工作台优先**：商品目录、购物车、客户下单、订单查询和游客临时单；所有价格与库存以服务端返回为准。
5. **商家工作台**：待办订单、扫码转单、订单状态操作、库存查询与经权限校验的库存动作。
6. **最后接入通知与发布**：订单状态、待处理订单和库存预警在主流程稳定后接入推送，并完成三端发布验收。

## 7. 资料来源（检索日期：2026-07-21）

- [uni-app x：平台支持](https://doc.dcloud.net.cn/uni-app-x/app-platform.html)
- [uni-app x：UTS 原生语言与插件](https://doc.dcloud.net.cn/uni-app-x/uts/)
- [React Native：平台特定代码](https://reactnative.dev/docs/platform-specific-code)
- [React Native 0.82：New Architecture Only](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- [RNOH 0.82.30：npm 包元数据](https://www.npmjs.com/package/@react-native-oh/react-native-harmony/v/0.82.30)
- [OpenHarmony SIG：React Native for OpenHarmony](https://gitee.com/openharmony-sig/ohos_react_native)
- [Flutter：iOS 与 Android 安装/部署](https://docs.flutter.dev/get-started/install)
- [Flutter：平台通道](https://docs.flutter.dev/platform-integration/platform-channels)
- [OpenHarmony SIG：Flutter for OpenHarmony](https://gitee.com/openharmony-sig/flutter_flutter)

以上分支版本和插件兼容性会持续变化；开始 POC 的当天必须重新核对目标框架分支、HarmonyOS SDK 与关键插件的发布说明，不能仅依据本次调研锁定版本。
