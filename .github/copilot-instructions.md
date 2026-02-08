# json2csharp - VS Code Extension

## Project Overview

This is a VS Code extension that allows users to quickly paste JSON from the clipboard as C# classes or records. It's designed to be simple and fast for converting JSON from REST API documentation into C# request/response objects.

**IMPORTANT: This file MUST be kept updated as the project progresses. After making ANY changes to the codebase (adding features, modifying settings, changing architecture, fixing bugs), UPDATE THIS FILE IMMEDIATELY before completing the task. This ensures accurate documentation for future development sessions.**

## Architecture

```
json2csharp/
├── .vscode/
│   ├── launch.json      # Debug configurations (Run Extension, Extension Tests)
│   └── tasks.json       # Build tasks (watch, compile, Package VSIX)
├── src/
│   ├── extension.ts     # Entry point, 3 command registrations, shared pasteJsonAsCSharp() helper
│   ├── converter.ts     # JSON to C# conversion using quicktype-core (lazy-loaded)
│   ├── validator.ts     # JSON validation with user-friendly errors
│   └── namespace.ts     # Namespace detection from .csproj and folder structure
├── resources/
│   ├── icon.png         # Extension icon (128x128 PNG)
│   └── icon.svg         # Source vector icon
├── dist/                # Bundled output (esbuild)
├── esbuild.js           # Build script with production optimizations
├── package.json         # Extension manifest and dependencies
└── tsconfig.json        # TypeScript configuration
```

## Key Technologies

- **TypeScript 5.x** - Type-safe development
- **esbuild** - Fast bundling for production (~545 KB compressed)
- **quicktype-core ^23.0.170** - JSON to C# conversion engine
- **VS Code Extension API ^1.96.0** - Clipboard, commands, configuration

## Features

### Implemented
- [x] Context menu "Paste JSON as C#" in .cs files
- [x] JSON validation with user-friendly error messages
- [x] Configurable root class name (prompt or setting)
- [x] Configurable collection type (Array, List, IList, IEnumerable, IReadOnlyList)
- [x] Type style: classes or records (positional or property-based)
- [x] Nullable reference type handling (nullable annotations or default values)
- [x] Enum and DateTime inference options
- [x] Clean output (no using statements, no partial keyword - just class definitions)
- [x] Optional file-scoped namespace from .csproj and folder structure
- [x] Serialization attributes (System.Text.Json or Newtonsoft.Json) when JSON keys differ from C# names
- [x] Root class name selected as linked snippet placeholder after paste (for instant rename)
- [x] Namespace mode with submenu: `choose` mode shows submenu with "Classes Only" / "With Namespace & Usings"

### Configuration Options
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `json2csharp.alwaysUseRootClassName` | boolean | false | Skip prompt, use default name |
| `json2csharp.rootClassName` | string | "Root" | Default root class name |
| `json2csharp.typeStyle` | enum | "class" | Type style: class, recordPositional, recordProperties |
| `json2csharp.collectionType` | enum | "IEnumerable" | Collection type for arrays (Array, List, IList, IEnumerable, IReadOnlyList) |
| `json2csharp.nullableReferenceTypes` | enum | "none" | Handle nullable context: none, nullable (?), or defaultValues (= string.Empty, = []) |
| `json2csharp.inferEnums` | boolean | false | Infer enum types from values |
| `json2csharp.inferDateTimes` | boolean | true | Infer DateTime types from strings |
| `json2csharp.namespaceMode` | enum | "withoutNamespace" | Namespace inclusion: withoutNamespace, withNamespace (single menu item), or choose (submenu with both options) |
| `json2csharp.serializationAttributes` | enum | "SystemTextJson" | Serialization attributes: none, SystemTextJson ([JsonPropertyName]), NewtonsoftJson ([JsonProperty]) |
| `json2csharp.attributeRendering` | enum | "whenDifferent" | When to render attributes: whenDifferent (only when JSON key differs) or always. Only applies when serializationAttributes is SystemTextJson or NewtonsoftJson |

## Key Implementation Details

### Custom CSharpRenderer
The extension uses a custom `CSharpRenderer` extending quicktype's renderer to:
- Skip namespace wrapper (`needNamespace()` returns false)
- Skip using statements (`emitUsings()` is empty)

### Lazy Loading
The quicktype-core library (~1.6 MB) is lazy-loaded on first command invocation:
- Type-only imports for TypeScript types (stripped at compile time)
- `require()` for runtime loading in `loadQuicktypeModules()`
- Module references cached for subsequent calls
- Extension activation is instant, heavy code loads only when needed

### Post-Processing Steps
1. Remove redundant serialization attributes (where JSON key matches C# name) — skipped when `attributeRendering` is `always`
2. Convert collection types (`List<T>` → user's chosen type)
3. Remove `partial` keyword from class declarations
4. Add nullable annotations or default values (if configured)
5. Convert classes to records (if configured)
6. Prepend file-scoped namespace (if enabled and valid)
7. Collect and prepend required `using` statements (sorted alphabetically) when namespace is included:
   - `using System.Collections.Generic;` — if collection type is not Array **and** the output contains collections
   - `using System.Text.Json.Serialization;` or `using Newtonsoft.Json;` — if serialization attributes are enabled

### Namespace Mode & Context Menu
The `namespaceMode` setting controls both behavior and context menu appearance:
- **`withoutNamespace`** (default): Single "Paste JSON as C#" menu item, never includes namespace
- **`withNamespace`**: Single "Paste JSON as C#" menu item, always includes namespace and usings
- **`choose`**: Shows a submenu "Paste JSON as C#" → "Classes Only" / "With Namespace & Usings"

Conditional menu visibility uses VS Code's `config.*` when-clause support:
- `config.json2csharp.namespaceMode != 'choose'` → show single command
- `config.json2csharp.namespaceMode == 'choose'` → show submenu

The submenu is defined via `contributes.submenus` with child items in `contributes.menus["json2csharp.submenu"]`.
Submenu commands (`pasteClassesOnly`, `pasteWithNamespace`) are hidden from the Command Palette via `commandPalette` when clauses.

**Migration**: The `resolveNamespaceMode()` function handles old boolean `includeNamespace` settings gracefully — `true` maps to `withNamespace`, `false` maps to `withoutNamespace`.

### Collection Type Conversion
- quicktype generates `T[]` (array-type: 'array') or `List<T>` (array-type: 'list')
- Post-processing converts `List<T>` to the user's chosen type via regex replacement
- When namespace is included and the output contains generic collections, `using System.Collections.Generic;` is prepended
- `Array` (`T[]`) is built-in and never requires a `using` statement
- The `using` is only added when the type actually appears in the output (no unnecessary imports)

### Nullable Reference Types
Two strategies for `<Nullable>enable</Nullable>` compatibility:
1. **nullable**: Adds `?` to reference types (`string?`, `IEnumerable<T>?`)
2. **defaultValues**: Adds initializers (`= string.Empty`, `= []`, `= default!`)

### Value Types Set
The converter maintains a set of C# value types that don't need nullable handling:
`bool, byte, sbyte, short, ushort, int, uint, long, ulong, float, double, decimal, char, DateTime, DateTimeOffset, TimeSpan, Guid`

### Serialization Attributes
When `serializationAttributes` is set to `SystemTextJson` or `NewtonsoftJson`:
- The custom language creates a renderer extending `SystemTextJsonCSharpRenderer` or `NewtonsoftCSharpRenderer` (not the base `CSharpRenderer`) to get proper attribute support
- quicktype is invoked with `features: 'attributes-only'` and the corresponding `framework` option (`SystemTextJson` or `NewtonSoft`)
- A post-processing step removes attributes where the JSON key matches the C# property name (case-insensitive comparison)
- For positional records, attributes use `[property:]` target syntax: `[property: JsonPropertyName("key")]`
- `using` statements are only prepended when namespace is included in the output

### Root Name Snippet Selection
When the user accepts the default root class name (or `alwaysUseRootClassName` is enabled), the extension inserts via `editor.insertSnippet()` with linked placeholders (`${1:RootName}`) so all occurrences of the root name are selected and editable simultaneously. When the user types a custom name in the input box, plain `editor.edit(insert)` is used instead (no placeholder). The C# output is escaped for snippet syntax (`}` → `\}`, `$` → `\$`, `\` → `\\`) before root name occurrences are replaced using a `\b`-bounded regex to avoid false matches in derived identifiers like `RootElement`.

### Namespace Detection (matches VS Code C# extension behavior)
When namespace inclusion is active (via `withNamespace` mode or "With Namespace & Usings" submenu choice), the extension:
1. **Finds nearest .csproj** - Walks up parent directories from the current file
2. **Extracts root namespace** - From `<RootNamespace>` element, or falls back to project filename
3. **Calculates path segments** - Relative path from .csproj directory to file's parent directory
4. **Validates identifiers** - Each folder must be a valid C# identifier (no hyphens, spaces, leading digits)
5. **Escapes keywords** - C# keywords prefixed with `@` (e.g., folder `class` → `@class`)
6. **Skips entirely if invalid** - No .csproj found or invalid folder names → no namespace generated

## Development

### Prerequisites
- Node.js 20 LTS or later
- VS Code ^1.96.0

### Commands
```bash
npm install          # Install dependencies
npm run compile      # One-time build
npm run watch        # Watch mode for development
npm run package      # Production build
```

### Debugging
1. Press F5 to launch Extension Development Host
2. Open a .cs file
3. Copy JSON to clipboard
4. Right-click → "Paste JSON as C#"

### Packaging
```bash
npx @vscode/vsce package    # Creates .vsix file
```

## Code Conventions

### TypeScript
- Use strict mode
- Prefer async/await over callbacks
- Use explicit types for function parameters and return values
- Export types that need to be shared between modules

### Error Handling
- Always provide user-friendly error messages
- Use `vscode.window.showErrorMessage()` for user-facing errors
- Log technical details to console for debugging

### Testing
- Test with various JSON structures (nested, arrays, primitives)
- Test invalid JSON cases
- Test all configuration combinations

## Changelog

### v1.4.0 (Current)
- `using System.Collections.Generic;` automatically prepended when namespace is included and the output contains generic collection types (List, IList, IEnumerable, IReadOnlyList)
  - Only added when collections actually appear in the output
  - Arrays (`T[]`) don't require a using statement
  - All using statements are sorted alphabetically
- Replaced `includeNamespace` boolean setting with `namespaceMode` enum (`withoutNamespace`, `withNamespace`, `choose`)
  - `withoutNamespace` / `withNamespace`: Single context menu item with deterministic behavior
  - `choose`: Submenu "Paste JSON as C#" → "Classes Only" / "With Namespace & Usings"
- Added `contributes.submenus` for the expandable context menu
- Three commands registered: `json2csharp.paste`, `json2csharp.pasteClassesOnly`, `json2csharp.pasteWithNamespace`
- Submenu commands hidden from Command Palette
- Graceful migration from old boolean `includeNamespace` setting
- Extracted shared `pasteJsonAsCSharp()` helper function in extension.ts

### v1.3.0
- Root class name selected as linked snippet placeholder after paste
  - All occurrences of the root name are highlighted and editable simultaneously
  - User can immediately type to rename, then press Tab/Escape to confirm
  - Only activates when the default root name is used (not when user typed a custom name)
  - Uses `\b` word-boundary regex to avoid replacing derived names like `RootElement`

### v1.2.0
- Attribute rendering mode (`attributeRendering` setting)
  - `whenDifferent` (default): Only add serialization attributes when JSON key differs from C# property name (existing behavior)
  - `always`: Always add serialization attributes on every property, even when names match
  - Only applies when `serializationAttributes` is set to SystemTextJson or NewtonsoftJson

### v1.1.0
- Serialization attributes support (System.Text.Json / Newtonsoft.Json)
  - `[JsonPropertyName]` or `[JsonProperty]` on properties where JSON key differs from C# name
  - Positional records use `[property:]` attribute target
  - `using` statements only emitted when `includeNamespace` is enabled
  - Default: SystemTextJson enabled

### v1.0.0
- Lazy-loaded quicktype-core for faster extension activation
- Extension icon added (resources/icon.png)
- Publisher set to Gasrulle, MIT license
- Repository: https://github.com/gasrulle/json2csharp

### v0.0.1
- Basic JSON to C# conversion with quicktype-core
- Context menu integration in .cs files
- Configurable root class name
- Configurable collection types (Array, List, IList, IEnumerable, IReadOnlyList)
- Nullable reference type handling (none, nullable, defaultValues)
- Records support
- Clean output without namespace/usings/partial keyword
- JSON validation with friendly errors
- Enum and DateTime inference options

---

**REMINDER TO AI ASSISTANTS: Always update this file when making changes to the project. Check the Architecture, Features, Configuration Options, and Changelog sections after every modification.**
