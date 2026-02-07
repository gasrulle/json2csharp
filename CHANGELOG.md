# Changelog

All notable changes to the "json2csharp" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
