import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';
import safeNumberPlugin from '../src/index';

describe('plugin exports', () => {
    it('exposes meta and reuses the exact plugin reference in flat/recommended', () => {
        assert.equal(safeNumberPlugin.meta.name, 'eslint-plugin-safe-number');
        assert.ok(safeNumberPlugin.meta.version.length > 0);
        assert.ok(safeNumberPlugin.rules['no-unsafe-number-conversion']);
        assert.strictEqual(
            safeNumberPlugin.configs['flat/recommended'].plugins['safe-number'],
            safeNumberPlugin
        );
    });

    it('does not throw "Cannot redefine plugin" in ESLint flat config', async () => {
        const eslint = new ESLint({
            overrideConfigFile: true,
            overrideConfig: [
                safeNumberPlugin.configs['flat/recommended'] as any,
                {
                    plugins: { 'safe-number': safeNumberPlugin as any },
                    rules: { 'safe-number/no-unsafe-number-conversion': 'warn' },
                },
            ],
        });
        const config = await eslint.calculateConfigForFile('test.ts');
        assert.ok(config.plugins['safe-number']);
    });
});
