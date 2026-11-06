**important！**

WATERS:关掉bt，mbutton+control jog两下 再按两下（disable-enable）：触发丢失模式..用另一个手机另一个苹果账号-识别找到的物品-发现设备后按照提示操作-点击网页查看详情（序列号 物主手机号）-点击停用详情（关机后能搜到）（disable丢失模式））

water sn最后两位如果是00 findmy'里面只显示14为序列号，00不显示的，本来为16位序列号。有的时候ota之后findmy里面fw版本不变，如v5.1.8还是v5.1.8

MERCURY：关掉BT，盒子上的control jog按五下 再按五下（disable-enable）；按四下是查看丢失网页详情（A quadruple press will trigger a Find my serial number look up）

MERCURY: 充电盒ota：mercury盒子按三下 进入充电盒ota，从v1.1支持。手机→耳机（保存了充电盒的固件）（显示紫灯表示已经进行ota）→充电盒。（目前支有单耳放进入充电盒才能ota，双耳不行）

为你整理了一份极简版学习笔记，直接抓核心操作：

### 🎧 WATERS 学习笔记

*   **触发丢失模式**：关 BT ➔ `M button + Control Jog` 按两下 ➔ 再按两下 (Disable-Enable)。

*   **解除/验证丢失模式**：另一台手机/苹果账号 ➔ “识别找到的物品” ➔ 按提示操作 ➔ 网页看详情(序列号/手机号) ➔ 点“停用详情” (关机也能搜到) ➔ 关闭丢失模式。

*   **注意点**：

    *   若SN 尾数为 `00` ，则不在 Find My 显示（只显示前 14 位，后两位隐藏）。

    *   OTA 后 Find My 里的 FW 版本可能不变（例：烧录 v5.1.8 还是显示 v5.1.8）。

---

### 🔋 MERCURY 学习笔记

*   **触发丢失模式**：关 BT ➔ 盒子 `Control Jog` 按 5 下 ➔ 再按 5 下 (Disable-Enable)。

*   **查丢失网页详情/查 SN**：按 4 下 (Quadruple press)。

*   **充电盒 OTA (v1.1+ 支持)**：

    *   **操作**：盒子按 3 下进入 OTA ➔ 手机传给耳机（保存盒子固件，**亮紫灯**表示进行中）➔ 耳机传给盒子。

    *   **限制**：**只能单耳**放入盒中 OTA，双耳不行。