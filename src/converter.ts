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
    CSharpTargetLanguage as CSharpTargetLanguageType,
    newtonsoftCSharpOptions as NewtonsoftCSharpOptionsType,
    NewtonsoftCSharpRenderer as NewtonsoftCSharpRendererType,
    systemTextJsonCSharpOptions as SystemTextJsonCSharpOptionsType,
    SystemTextJsonCSharpRenderer as SystemTextJsonCSharpRendererType
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
    newtonsoftCSharpOptions: typeof NewtonsoftCSharpOptionsType;
    NewtonsoftCSharpRenderer: typeof NewtonsoftCSharpRendererType;
    systemTextJsonCSharpOptions: typeof SystemTextJsonCSharpOptionsType;
    SystemTextJsonCSharpRenderer: typeof SystemTextJsonCSharpRendererType;
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
 * Create custom C# target language that omits namespace/usings.
 * When a serialization framework is specified, extends the framework-specific renderer
 * to get proper attribute support (e.g., [JsonPropertyName], [JsonProperty]).
 */
function createCustomCSharpLanguage(framework?: SerializationAttributes) {
    const { quicktypeCore, csharpLang } = loadQuicktypeModules();
    const { getOptionValues } = quicktypeCore;
    const {
        CSharpRenderer, CSharpTargetLanguage, cSharpOptions,
        SystemTextJsonCSharpRenderer, systemTextJsonCSharpOptions,
        NewtonsoftCSharpRenderer, newtonsoftCSharpOptions
    } = csharpLang;

    // Pick the correct base renderer and options based on the framework
    const BaseRenderer = framework === 'SystemTextJson' ? SystemTextJsonCSharpRenderer
        : framework === 'NewtonsoftJson' ? NewtonsoftCSharpRenderer
            : CSharpRenderer;
    const optionsDef = framework === 'SystemTextJson' ? systemTextJsonCSharpOptions
        : framework === 'NewtonsoftJson' ? newtonsoftCSharpOptions
            : cSharpOptions;

    /**
     * Custom C# renderer that:
     * - Omits namespace and using statements for clean paste
     * - Inherits attribute support from the framework-specific renderer when applicable
     */
    class CustomCSharpRenderer extends BaseRenderer {
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
                getOptionValues(optionsDef, untypedOptionValues)
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
 * Serialization framework for property attributes
 */
export type SerializationAttributes = 'SystemTextJson' | 'NewtonsoftJson';

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
    namespace?: string,
    serializationAttributes?: SerializationAttributes,
    alwaysRenderAttributes: boolean = false
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
    const lang = createCustomCSharpLanguage(serializationAttributes);

    // Build renderer options based on serialization attributes setting
    const rendererOptions: Record<string, string> = {
        'namespace': '',
        'csharp-version': '6',
        'any-type': 'object',
        'number-type': 'double',
        'array-type': options.collectionType === 'Array' ? 'array' : 'list',
    };

    if (serializationAttributes) {
        rendererOptions['features'] = 'attributes-only';
        rendererOptions['framework'] = serializationAttributes === 'SystemTextJson' ? 'SystemTextJson' : 'NewtonSoft';
    } else {
        rendererOptions['just-types'] = 'true';
        rendererOptions['features'] = 'just-types';
    }

    // Run quicktype
    const result = await quicktype({
        inputData,
        lang,
        rendererOptions,
        inferEnums: options.inferEnums,
        inferDateTimes: options.inferDateTimes,
        inferMaps: true,
        inferUuids: false,
        inferBooleanStrings: false,
        inferIntegerStrings: false,
    });

    let output = result.lines.join('\n');

    // Post-process: Remove redundant serialization attributes where JSON key matches C# name
    if (serializationAttributes && !alwaysRenderAttributes) {
        output = removeRedundantAttributes(output);
    }

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

    // Post-process: Prepend using statement if serialization attributes are present and namespace is included
    if (serializationAttributes && namespace) {
        const usingStatement = serializationAttributes === 'SystemTextJson'
            ? 'using System.Text.Json.Serialization;'
            : 'using Newtonsoft.Json;';
        output = `${usingStatement}\n\n${output}`;
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
 * Remove serialization attributes where the JSON key matches the C# property name (case-insensitive).
 * E.g., removes [JsonPropertyName("year")] above a property named Year,
 * but keeps [JsonPropertyName("my_title")] above MyTitle.
 */
function removeRedundantAttributes(code: string): string {
    // Match attribute line followed by property line, where attribute value equals property name
    // Use [ \t]* instead of \s* to avoid consuming blank lines above the attribute
    const redundantAttrRegex = /^[ \t]*\[(?:JsonPropertyName|JsonProperty)\("(\w+)"\)\]\n([ \t]*public\s+\S+\s+(\w+)\s*\{)/gm;

    return code.replace(redundantAttrRegex, (_match, jsonKey, propertyLine, propName) => {
        if (jsonKey.toLowerCase() === propName.toLowerCase()) {
            // JSON key matches C# name (ignoring case) — remove the attribute line
            return propertyLine;
        }
        // Names differ — keep the attribute
        return _match;
    });
}

/**
 * Convert C# classes to positional records
 * Transforms: public class Foo { public string Bar { get; set; } }
 * To: public record Foo(string Bar);
 * Preserves serialization attributes with [property:] target.
 */
function convertToPositionalRecords(code: string): string {
    // Match class declarations and their properties
    // Use [\s\S] instead of [^}] to match across braces inside the class body
    const classRegex = /public\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

    return code.replace(classRegex, (match, className, body: string) => {
        // Extract properties with optional preceding attribute lines
        // Captures: optional [JsonPropertyName("...")] or [JsonProperty("...")], then property declaration
        const propertyRegex = /(?:\[(?:JsonPropertyName|JsonProperty)\("[^"]*"\)\]\s*\n\s*)?public\s+(\S+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}(?:\s*=\s*[^;]+)?/g;
        const parameters: string[] = [];
        let propMatch;

        while ((propMatch = propertyRegex.exec(body)) !== null) {
            const fullMatch = propMatch[0];
            const [, type, name] = propMatch;

            // Check if there's an attribute on this property
            const attrMatch = fullMatch.match(/\[(JsonPropertyName|JsonProperty)\("([^"]*)"\)\]/);
            if (attrMatch) {
                const attrName = attrMatch[1];
                const jsonKey = attrMatch[2];
                parameters.push(`[property: ${attrName}("${jsonKey}")] ${type} ${name}`);
            } else {
                parameters.push(`${type} ${name}`);
            }
        }

        if (parameters.length === 0) {
            return match; // Keep as class if no properties found
        }

        return `public record ${className}(${parameters.join(', ')});`;
    });
}
