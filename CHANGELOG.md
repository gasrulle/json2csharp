# Changelog

All notable changes to the "json2csharp" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-02-08

### Added

- Root class name is selected as a linked snippet placeholder after paste
  - All occurrences of the root name are highlighted and editable simultaneously
  - User can immediately type to rename, then press Tab/Escape to confirm
  - Only activates when the default root name is used (not when user typed a custom name)
  - Uses word-boundary matching to avoid replacing derived names like `RootElement`

## [1.2.0] - 2026-02-07

### Added

- Attribute rendering mode setting (`json2csharp.attributeRendering`)
  - `whenDifferent` (default): Only add serialization attributes when the JSON key differs from the C# property name (existing behavior)
  - `always`: Always add serialization attributes on every property, even when names match
  - Only applies when `serializationAttributes` is set to SystemTextJson or NewtonsoftJson

## [1.1.0] - 2026-02-07

### Added

- Serialization attributes support (System.Text.Json / Newtonsoft.Json)
  - `[JsonPropertyName]` or `[JsonProperty]` on properties where the JSON key differs from the C# property name
  - Positional records use `[property:]` attribute target syntax
  - Redundant attributes are removed when JSON key matches C# name (case-insensitive)
  - `using` statements are prepended when `includeNamespace` is also enabled
  - New setting `json2csharp.serializationAttributes` with options: none, SystemTextJson (default), NewtonsoftJson

## [1.0.0] - 2026-02-06

### Added

- Paste JSON as C# classes or records from clipboard
- Context menu integration for .cs files
- Configurable type styles (class, positional record, record with properties)
- Configurable collection types (Array, List, IList, IEnumerable, IReadOnlyList)
- Nullable reference type handling (none, nullable annotations, default values)
- Optional file-scoped namespace detection from .csproj
- JSON validation with helpful error messages
- Enum and DateTime inference options
- Lazy-loaded quicktype-core for faster extension activation
