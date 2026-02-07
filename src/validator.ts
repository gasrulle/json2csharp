/**
 * Result of JSON validation
 */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validate JSON string and return user-friendly error messages
 */
export function validateJson(jsonString: string): ValidationResult {
    const trimmed = jsonString.trim();

    // Check for empty input
    if (!trimmed) {
        return {
            isValid: false,
            error: 'Empty input - no JSON content found',
        };
    }

    // Check if it starts with valid JSON characters
    const firstChar = trimmed[0];
    if (firstChar !== '{' && firstChar !== '[') {
        return {
            isValid: false,
            error: 'JSON must start with { or [',
        };
    }

    try {
        JSON.parse(trimmed);
        return { isValid: true };
    } catch (e) {
        const error = e as SyntaxError;
        const message = error.message;

        // Provide user-friendly error messages for common issues
        if (message.includes('Unexpected token')) {
            // Check for common issues
            if (/,\s*[}\]]/.test(trimmed)) {
                return {
                    isValid: false,
                    error: 'Trailing comma detected - remove the comma before } or ]',
                };
            }
            if (/[{,]\s*\w+\s*:/.test(trimmed)) {
                return {
                    isValid: false,
                    error: 'Unquoted property name detected - property names must be in double quotes',
                };
            }
            if (/'/.test(trimmed)) {
                return {
                    isValid: false,
                    error: 'Single quotes detected - JSON requires double quotes for strings',
                };
            }
        }

        if (message.includes('Unexpected end')) {
            return {
                isValid: false,
                error: 'Incomplete JSON - missing closing bracket or brace',
            };
        }

        // Return the original error message if we can't provide a better one
        return {
            isValid: false,
            error: message,
        };
    }
}
