import * as vscode from 'vscode';
import { convertJsonToCSharp, NullableStyle, SerializationAttributes } from './converter';
import { calculateNamespace } from './namespace';
import { validateJson } from './validator';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('json2csharp.paste', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Read clipboard
        const clipboardText = await vscode.env.clipboard.readText();
        if (!clipboardText.trim()) {
            vscode.window.showErrorMessage('Clipboard is empty');
            return;
        }

        // Validate JSON
        const validationResult = validateJson(clipboardText);
        if (!validationResult.isValid) {
            vscode.window.showErrorMessage(`Invalid JSON: ${validationResult.error}`);
            return;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('json2csharp');
        const alwaysUseRootClassName = config.get<boolean>('alwaysUseRootClassName', false);
        const defaultRootClassName = config.get<string>('rootClassName', 'Root');

        // Determine root class name
        let rootClassName: string;
        if (alwaysUseRootClassName) {
            rootClassName = defaultRootClassName;
        } else {
            const userInput = await vscode.window.showInputBox({
                prompt: 'Enter the root class name',
                value: defaultRootClassName,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Class name cannot be empty';
                    }
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
                        return 'Invalid C# class name';
                    }
                    return null;
                }
            });

            if (!userInput) {
                return; // User cancelled
            }
            rootClassName = userInput;
        }

        // Get nullable style from settings
        const nullableSetting = config.get<string>('nullableReferenceTypes', 'none');
        const nullableStyle: NullableStyle | undefined =
            nullableSetting === 'nullable' ? 'nullable' :
                nullableSetting === 'defaultValues' ? 'defaults' : undefined;

        // Get serialization attributes setting
        const serializationSetting = config.get<string>('serializationAttributes', 'SystemTextJson');
        const serializationAttributes: SerializationAttributes | undefined =
            serializationSetting === 'SystemTextJson' ? 'SystemTextJson' :
                serializationSetting === 'NewtonsoftJson' ? 'NewtonsoftJson' : undefined;

        // Calculate namespace if enabled
        const includeNamespace = config.get<boolean>('includeNamespace', false);
        const namespace = includeNamespace ? calculateNamespace(editor.document.uri.fsPath) : undefined;

        try {
            // Convert JSON to C#
            const csharpCode = await convertJsonToCSharp(clipboardText, rootClassName, config, nullableStyle, namespace, serializationAttributes);

            // Insert at cursor position
            await editor.edit((editBuilder) => {
                editBuilder.insert(editor.selection.active, csharpCode);
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to convert JSON: ${errorMessage}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }
