# austevic-i18n

使用方法：

1. 在项目根目录创建一个 .env 文件，内容如下：

```
OPENAI_CLIENT=sk-xxxxx
```

2. 运行 `bunx @austevic/i18n`，会自动翻译项目中的所有 i18n`, i18nKey`, i18nObj`` 字符串，并生成 i18n 源文件。

3. 在项目中使用 i18n`` 字符串，例如：

```js
import { i18n } from "./i18n";
// 这个只能在浏览器中使用:
const a = i18n`Hello, world`;

// 根据浏览器的语言环境，会自动翻译成对应的语言，例如：
console.log(a); // 你好, 世界

// 也可以手动指定语言：
const b = i18nObj`Hello, world`("ja");
console.log(b); // こんにちは世界
```

4. 在服务端中使用 i18nKey("xxx") 字符串，例如：

- 之所以使用 i18nKey 而不是 i18n，是因为服务端不需要翻译，而是需要在 i18n 源文件中生成对应的翻译。
- 之所以使用 i18nKey() 而不是 i18nKey``，是因为服务端的模版字符串会有编码问题

```js
import { i18nKey } from "./i18n";
const a = i18nKey("Hello, world");
console.log(a); // Hello, world, 这个不会翻译, 而是反回原文, 但是会在 i18n 源文件中生成对应的翻译

// 前端拿到原文后，可以使用 i18nFromKey`` 来获取对应的翻译
// 例如：
const b = i18nFromKey("Hello, world");
console.log(b); // 根据浏览器环境, 输出正确的语言: 你好, 世界
```

5. 在客户端使用 replaceI18n 方法来替换字符串中的变量，例如：

```js
import { replaceI18n } from "./i18n";
const a = replaceI18n(i18n`Hello, {name}`, { name: "Liam" });
console.log(a); // 你好, Liam
```
