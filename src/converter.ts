import * as vscode from 'vscode';

// Type imports only (stripped at runtime, no code is loaded)
import type {
    getOptionValues as GetOptionValuesType,
    InputData as InputDataType,
    jsonInputForTargetLanguage as JsonInputType,
    quicktype as QuicktypeType,
    RenderContext as RenderContextType
} from 'quicktype-core';
import type {
    cSharpOptions as CSharpOptionsType,
    CSharpRenderer as CSharpRendererType,
    CSharpTargetLanguage as CSharpTargetLanguageType
} from 'quicktype-core/dist/language/CSharp';

// Lazy-loaded quicktype-core module cache
let quicktypeCore: {
    getOptionValues: typeof GetOptionValuesType;
    InputData: typeof InputDataType;
    jsonInputForTargetLanguage: typeof JsonInputType;
    quicktype: typeof QuicktypeType;
} | null = null;

let csharpLang: {
    cSharpOptions: typeof CSharpOptionsType;
    CSharpRenderer: typeof CSharpRendererType;
    CSharpTargetLanguage: typeof CSharpTargetLanguageType;
} | null = null;

/**
 * Lazy-load quicktype-core modules on first use
 */
function loadQuicktypeModules() {
    if (!quicktypeCore) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        quicktypeCore = require('quicktype-core');
    }
    if (!csharpLang) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        csharpLang = require('quicktype-core/dist/language/CSharp');
    }
    return { quicktypeCore: quicktypeCore!, csharpLang: csharpLang! };
}

/**
 * Create custom C# target language that omits namespace/usings
 */
function createCustomCSharpLanguage() {
    const { quicktypeCore, csharpLang } = loadQuicktypeModules();
    const { getOptionValues } = quicktypeCore;
    const { CSharpRenderer, CSharpTargetLanguage, cSharpOptions } = csharpLang;

    /**
     * Custom C# renderer that:
     * - Omits namespace and using statements for clean paste
     */
    class CustomCSharpRenderer extends CSharpRenderer {
        protected needNamespace(): boolean {
            return false;
        }

        protected emitUsings(): void {
            // Don't emit usings
        }
    }

    /**
     * Custom C# target language that uses our custom renderer
     */
    class CustomCSharpTargetLanguage extends CSharpTargetLanguage {
        protected makeRenderer(
            renderContext: RenderContextType,
            untypedOptionValues: Record<string, unknown>
        ): CSharpRendererType {
            return new CustomCSharpRenderer(
                this,
                renderContext,
                getOptionValues(cSharpOptions, untypedOptionValues)
            );
        }
    }

    return new CustomCSharpTargetLanguage();
}

/**
 * Supported collection types for JSON arrays
 */
export type CollectionType = 'Array' | 'List' | 'IList' | 'IEnumerable' | 'IReadOnlyList';

/**
 * Style of generated types
 */
export type TypeStyle = 'class' | 'recordPositional' | 'recordProperties';

/**
 * How to handle nullable reference types
 */
export type NullableStyle = 'nullable' | 'defaults';

/**
 * Configuration options for the converter
 */
export interface ConverterOptions {
    typeStyle: TypeStyle;
    inferEnums: boolean;
    inferDateTimes: boolean;
    collectionType: CollectionType;
}

/**
 * Extract converter options from VS Code configuration
 */
function getConverterOptions(config: vscode.WorkspaceConfiguration): ConverterOptions {
    return {
        typeStyle: config.get<TypeStyle>('typeStyle', 'class'),
        inferEnums: config.get<boolean>('inferEnums', false),
        inferDateTimes: config.get<boolean>('inferDateTimes', true),
        collectionType: config.get<CollectionType>('collectionType', 'IEnumerable'),
    };
}

/**
 * Convert JSON string to C# classes using quicktype
 */
export async function convertJsonToCSharp(
    jsonString: string,
    rootClassName: string,
    config: vscode.WorkspaceConfiguration,
    nullableStyle?: NullableStyle,
    namespace?: string
): Promise<string> {
    const options = getConverterOptions(config);

    // Lazy-load quicktype-core modules
    const { quicktypeCore } = loadQuicktypeModules();
    const { quicktype, InputData, jsonInputForTargetLanguage } = quicktypeCore;

    // Set up quicktype input
    const jsonInput = jsonInputForTargetLanguage('csharp');
    await jsonInput.addSource({
        name: rootClassName,
        samples: [jsonString],
    });

    const inputData = new InputData();
    inputData.addInput(jsonInput);

    // Use custom C# language that omits namespace/usings
    const lang = createCustomCSharpLanguage();

    // Run quicktype
    const result = await quicktype({
        inputData,
        lang,
        rendererOptions: {
            'just-types': 'true',
            'namespace': '',
            'csharp-version': '6',
            'any-type': 'object',
            'number-type': 'double',
            'features': 'just-types',
            'array-type': options.collectionType === 'Array' ? 'array' : 'list',
        },
        inferEnums: options.inferEnums,
        inferDateTimes: options.inferDateTimes,
        inferMaps: true,
        inferUuids: false,
        inferBooleanStrings: false,
        inferIntegerStrings: false,
    });

    let output = result.lines.join('\n');

    // Post-process: Convert to the selected collection type
    if (options.collectionType !== 'Array') {
        output = convertCollectionType(output, options.collectionType);
    }

    // Post-process: Handle nullable reference types based on user choice
    if (nullableStyle === 'nullable') {
        output = addNullableAnnotations(output);
    } else if (nullableStyle === 'defaults') {
        output = addDefaultValues(output);
    }

    // Post-process: Remove unnecessary 'partial' keyword
    output = output.replace(/public\s+partial\s+class/g, 'public class');

    // Post-process: Convert to records if configured
    if (options.typeStyle === 'recordPositional') {
        output = convertToPositionalRecords(output);
    } else if (options.typeStyle === 'recordProperties') {
        output = output.replace(/public\s+class\s+(\w+)/g, 'public record $1');
    }

    // Post-process: Prepend file-scoped namespace if provided
    if (namespace) {
        output = `namespace ${namespace};\n\n${output}`;
    }

    return output.trim();
}

/**
 * Convert List<T> to the selected collection type
 */
function convertCollectionType(code: string, collectionType: CollectionType): string {
    switch (collectionType) {
        case 'List':
            // quicktype generates List<T> when array-type is 'list', keep as-is
            return code;
        case 'IList':
            return code.replace(/\bList</g, 'IList<');
        case 'IEnumerable':
            return code.replace(/\bList</g, 'IEnumerable<');
        case 'IReadOnlyList':
            return code.replace(/\bList</g, 'IReadOnlyList<');
        default:
            return code;
    }
}

/**
 * C# value types that don't need nullable annotation
 */
const VALUE_TYPES = new Set([
    'bool',
    'byte', 'sbyte',
    'short', 'ushort',
    'int', 'uint',
    'long', 'ulong',
    'float', 'double', 'decimal',
    'char',
    'DateTime', 'DateTimeOffset', 'TimeSpan',
    'Guid',
]);

/**
 * Add nullable annotations (?) to reference type properties.
 * This makes the generated code compatible with <Nullable>enable</Nullable>
 */
function addNullableAnnotations(code: string): string {
    // Match property declarations: public TYPE NAME { get; set; }
    const propertyRegex = /public\s+(\S+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;

    return code.replace(propertyRegex, (match, type: string, name: string) => {
        // Skip if already nullable
        if (type.endsWith('?')) {
            return match;
        }

        // Check if it's a value type (doesn't need ?)
        const baseType = type.replace(/<.*>/, ''); // Remove generic part for checking
        if (VALUE_TYPES.has(baseType)) {
            return match;
        }

        // Reference type - add nullable annotation
        return `public ${type}? ${name} { get; set; }`;
    });
}

/**
 * Add default values to reference type properties.
 * This makes the generated code compatible with <Nullable>enable</Nullable>
 * by initializing properties instead of making them nullable.
 */
function addDefaultValues(code: string): string {
    // Match property declarations: public TYPE NAME { get; set; }
    const propertyRegex = /public\s+(\S+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;

    return code.replace(propertyRegex, (match, type: string, name: string) => {
        // Skip if already has default value or is nullable
        if (type.endsWith('?')) {
            return match;
        }

        // Check if it's a value type (doesn't need default)
        const baseType = type.replace(/<.*>/, ''); // Remove generic part for checking
        if (VALUE_TYPES.has(baseType)) {
            return match;
        }

        // Determine default value based on type
        let defaultValue: string;
        if (type === 'string') {
            defaultValue = 'string.Empty';
        } else if (type.startsWith('IEnumerable<') || type.startsWith('List<') || type.startsWith('IList<') || type.startsWith('IReadOnlyList<') || type.endsWith('[]')) {
            defaultValue = '[]';
        } else if (type === 'object') {
            defaultValue = 'new object()';
        } else {
            // For other reference types (custom classes), use null-forgiving with new()
            defaultValue = 'default!';
        }

        return `public ${type} ${name} { get; set; } = ${defaultValue};`;
    });
}

/**
 * Convert C# classes to positional records
 * Transforms: public class Foo { public string Bar { get; set; } }
 * To: public record Foo(string Bar);
 */
function convertToPositionalRecords(code: string): string {
    // Match class declarations and their properties
    // Use [\s\S] instead of [^}] to match across braces inside the class body
    const classRegex = /public\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

    return code.replace(classRegex, (match, className, body) => {
        // Extract properties - handle both with and without default values
        // Matches: public string Title { get; set; }
        // Matches: public string Title { get; set; } = string.Empty;
        const propertyRegex = /public\s+(\S+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}(?:\s*=\s*[^;]+)?/g;
        const properties: string[] = [];
        let propMatch;

        while ((propMatch = propertyRegex.exec(body)) !== null) {
            const [, type, name] = propMatch;
            properties.push(`${type} ${name}`);
        }

        if (properties.length === 0) {
            return match; // Keep as class if no properties found
        }

        return `public record ${className}(${properties.join(', ')});`;
    });
}
