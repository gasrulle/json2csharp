import * as fs from 'fs';
import * as path from 'path';

/**
 * C# reserved keywords that need to be escaped with @ prefix
 */
const CSHARP_KEYWORDS = new Set([
    'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
    'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
    'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
    'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
    'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
    'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
    'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
    'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
    'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while'
]);

/**
 * Check if a string is a valid C# identifier
 * Must start with a letter or underscore, followed by letters, digits, or underscores
 */
function isValidCSharpIdentifier(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Escape a C# keyword with @ prefix if necessary
 */
function escapeCSharpKeyword(name: string): string {
    return CSHARP_KEYWORDS.has(name.toLowerCase()) ? `@${name}` : name;
}

/**
 * Find the nearest .csproj file by walking up parent directories
 * Returns the full path to the .csproj file, or undefined if not found
 */
function findNearestCsproj(filePath: string): string | undefined {
    let currentDir = path.dirname(filePath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const files = fs.readdirSync(currentDir);
        const csproj = files.find(f => f.endsWith('.csproj'));
        if (csproj) {
            return path.join(currentDir, csproj);
        }
        currentDir = path.dirname(currentDir);
    }

    return undefined;
}

/**
 * Extract the RootNamespace from a .csproj file
 * Falls back to the project filename (without extension) if not specified
 */
function extractRootNamespace(csprojPath: string): string {
    try {
        const content = fs.readFileSync(csprojPath, 'utf-8');
        const match = content.match(/<RootNamespace>(.+?)<\/RootNamespace>/);
        if (match && match[1]) {
            const rootNs = match[1].trim();
            // Validate that each segment is a valid identifier
            const segments = rootNs.split('.');
            if (segments.every(s => isValidCSharpIdentifier(s))) {
                return rootNs;
            }
        }
    } catch {
        // If we can't read the file, fall back to filename
    }

    // Fallback: use project filename without extension
    const projectName = path.parse(csprojPath).name;
    return isValidCSharpIdentifier(projectName) ? projectName : '';
}

/**
 * Calculate the namespace for a file based on its location relative to the .csproj
 * Returns undefined if:
 * - No .csproj file found
 * - Any folder name is not a valid C# identifier
 *
 * Matches VS Code C# extension behavior:
 * - Root namespace from <RootNamespace> or project filename
 * - Path segments from .csproj directory to file's parent directory
 * - C# keywords escaped with @ prefix
 * - Invalid folder names (hyphens, spaces, leading digits) cause entire namespace to be skipped
 */
export function calculateNamespace(currentFilePath: string): string | undefined {
    const csprojPath = findNearestCsproj(currentFilePath);
    if (!csprojPath) {
        return undefined;
    }

    const rootNamespace = extractRootNamespace(csprojPath);
    const csprojDir = path.dirname(csprojPath);
    const fileDir = path.dirname(currentFilePath);

    // If file is in the same directory as .csproj, just use root namespace
    if (fileDir === csprojDir) {
        return rootNamespace || undefined;
    }

    // Calculate relative path from .csproj directory to file's directory
    const relativePath = path.relative(csprojDir, fileDir);
    if (!relativePath || relativePath.startsWith('..')) {
        // File is not under the .csproj directory
        return rootNamespace || undefined;
    }

    // Split into folder segments
    const folders = relativePath.split(path.sep);

    // Process each folder segment
    const namespaceSegments: string[] = [];

    for (const folder of folders) {
        // Each folder can contain dots, which become separate namespace segments
        const parts = folder.split('.');

        for (const part of parts) {
            if (!isValidCSharpIdentifier(part)) {
                // Invalid folder name - skip namespace entirely (match VS Code behavior)
                return undefined;
            }
            namespaceSegments.push(escapeCSharpKeyword(part));
        }
    }

    // Combine root namespace with folder-based segments
    if (rootNamespace) {
        return [rootNamespace, ...namespaceSegments].join('.');
    } else if (namespaceSegments.length > 0) {
        return namespaceSegments.join('.');
    }

    return undefined;
}
